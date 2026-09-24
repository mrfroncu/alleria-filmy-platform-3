const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { DEFAULT_TOS_UPDATED_AT } = require('../defaultTos');
const { reassignUserIdInParties } = require('../watchParty');
const { audit } = require('./helpers');
const { getSetting } = require('./settings');
const { invalidateUserSessions } = require('./sessions');

// ============ ACCOUNT LINKING & MERGE ============
// A logged-in user can attach an additional auth identity (Discord/TeamSpeak) to their
// account from the profile page. If that identity already belongs to a DIFFERENT existing
// account with its own history, linking requires an explicit, irreversible merge: all of
// the secondary account's data moves onto the primary (the account the user was logged
// into when they started linking) and the secondary row is deleted. Like tsChallenges,
// the confirmation step is a short-lived in-memory token — there's no need to persist it.
const pendingMerges = new Map(); // mergeId -> { primaryId, secondaryId, secondaryLabel, stats, identities, expires }
const PENDING_MERGE_TTL_MS = 5 * 60 * 1000;

function createPendingMerge(data) {
  const id = uuidv4();
  pendingMerges.set(id, { ...data, expires: Date.now() + PENDING_MERGE_TTL_MS });
  const t = setTimeout(() => pendingMerges.delete(id), PENDING_MERGE_TTL_MS);
  if (t.unref) t.unref();
  return id;
}

function getPendingMerge(mergeId) {
  const m = pendingMerges.get(mergeId);
  if (!m) return null;
  if (Date.now() > m.expires) { pendingMerges.delete(mergeId); return null; }
  return m;
}

function consumePendingMerge(mergeId) {
  const m = getPendingMerge(mergeId);
  if (m) pendingMerges.delete(mergeId);
  return m;
}

function getMergeStats(userId) {
  return {
    videoCount: db.prepare('SELECT COUNT(*) c FROM watch_logs WHERE user_id = ?').get(userId).c,
    commentCount: db.prepare('SELECT COUNT(*) c FROM comments WHERE user_id = ? AND deleted = 0').get(userId).c,
    favCount: db.prepare('SELECT COUNT(*) c FROM favorites WHERE user_id = ?').get(userId).c,
    authoredCount: db.prepare('SELECT COUNT(*) c FROM videos WHERE author_id = ?').get(userId).c,
  };
}

function identityList(u) {
  return [
    u.discord_id ? 'discord' : null,
    u.ts3_uid ? 'teamspeak3' : null,
    u.ts6_uid ? 'teamspeak' : null,
  ].filter(Boolean);
}

// Regulamin (ToS) — content lives in app_settings (tos_content/tos_updated_at), acceptance is
// per-user (users.tos_accepted_at). Plain ISO-string comparison — both sides are always either
// SQLite's datetime('now') or JS's toISOString(), which sort correctly as strings.
function tosNeedsAcceptance(tosAcceptedAt) {
  const updatedAt = getSetting('tos_updated_at', DEFAULT_TOS_UPDATED_AT);
  return !tosAcceptedAt || tosAcceptedAt < updatedAt;
}

// A linked account can log in via multiple identities (Discord + TS3/TS6), each of which
// independently computes a role from its own source (Discord guild roles, TS server
// groups) every time it logs in. Without this, whichever method logs in LAST wins and
// blindly overwrites the account's role — so an admin-via-Discord account looks like a
// plain member the moment they log in via TS3, and vice versa. Higher privilege should
// carry over regardless of which linked method is used: the stored role only ever moves
// up to what the current login computes, never down. TS3/TS6 can only ever compute
// 'member'/'admin' (no dev group concept exists there), so 'dev' — once granted by an
// actual live Discord role check — is naturally preserved and can never be granted by a
// TS login; a later Discord login without the dev role also won't strip it here (role
// demotion is an explicit admin action elsewhere, not a side effect of logging in).
const ROLE_RANK = { member: 0, admin: 1, dev: 2 };
function maxRole(a, b) {
  return (ROLE_RANK[a] ?? 0) >= (ROLE_RANK[b] ?? 0) ? a : b;
}

// Moves all of secondaryId's data onto primaryId and deletes the secondary account row.
// Irreversible — callers must have already gotten explicit user confirmation.
function mergeUsers(primaryId, secondaryId, { performedBy } = {}) {
  if (primaryId === secondaryId) throw new Error('Cannot merge an account into itself');
  const primary = db.prepare('SELECT * FROM users WHERE id = ?').get(primaryId);
  const secondary = db.prepare('SELECT * FROM users WHERE id = ?').get(secondaryId);
  if (!primary || !secondary) throw new Error('User not found');

  const run = db.transaction(() => {
    // Append-only tables / simple FK — zero collision risk, blind reassignment.
    // videos.author_id must move before the users row is deleted (plain FK, no ON DELETE).
    for (const [table, col] of [
      ['videos', 'author_id'], ['watch_logs', 'user_id'], ['login_logs', 'user_id'],
      ['audit_logs', 'user_id'], ['comments', 'user_id'],
    ]) {
      db.prepare(`UPDATE ${table} SET ${col} = ? WHERE ${col} = ?`).run(primaryId, secondaryId);
    }
    db.prepare('UPDATE watch_party_logs SET user_id = ? WHERE user_id = ?').run(primaryId, secondaryId);
    db.prepare('UPDATE watch_party_logs SET target_user_id = ? WHERE target_user_id = ?').run(primaryId, secondaryId);

    // Composite-PK "membership" tables — the data is binary (has/doesn't have), so on
    // collision just drop the secondary's redundant row, then reassign what's left.
    for (const [table, keyCol] of [
      ['favorites', 'video_id'], ['video_access', 'video_id'],
      ['category_user_access', 'category_id'], ['user_rank_assignments', 'rank_id'],
    ]) {
      db.prepare(`DELETE FROM ${table} WHERE user_id = ? AND ${keyCol} IN (SELECT ${keyCol} FROM ${table} WHERE user_id = ?)`)
        .run(secondaryId, primaryId);
      db.prepare(`UPDATE ${table} SET user_id = ? WHERE user_id = ?`).run(primaryId, secondaryId);
    }

    // watch_progress isn't binary — position/duration differ meaningfully, so on collision
    // keep whichever row was updated more recently.
    for (const row of db.prepare('SELECT * FROM watch_progress WHERE user_id = ?').all(secondaryId)) {
      const existing = db.prepare('SELECT * FROM watch_progress WHERE user_id = ? AND video_id = ?').get(primaryId, row.video_id);
      if (!existing) {
        db.prepare('UPDATE watch_progress SET user_id = ? WHERE user_id = ? AND video_id = ?').run(primaryId, secondaryId, row.video_id);
      } else if (new Date(row.updated_at) > new Date(existing.updated_at)) {
        db.prepare('UPDATE watch_progress SET position = ?, duration = ?, updated_at = ? WHERE user_id = ? AND video_id = ?')
          .run(row.position, row.duration, row.updated_at, primaryId, row.video_id);
        db.prepare('DELETE FROM watch_progress WHERE user_id = ? AND video_id = ?').run(secondaryId, row.video_id);
      } else {
        db.prepare('DELETE FROM watch_progress WHERE user_id = ? AND video_id = ?').run(secondaryId, row.video_id);
      }
    }

    // Secondary must be gone BEFORE we copy its identity columns onto primary below — the
    // identity columns being copied (discord_id/ts3_uid/ts6_uid) are exactly what's UNIQUE
    // and still held by secondary's still-existing row would collide with, would violate
    // the UNIQUE index if primary were updated first (that ordering was the original bug:
    // "UNIQUE constraint failed: users.ts_uid").
    db.prepare('DELETE FROM users WHERE id = ?').run(secondaryId);

    // Identity columns — copy onto primary only what it doesn't already have. If primary
    // already has an identity of this type, secondary's is intentionally dropped (the user
    // saw this coming via `identities` in the merge confirmation payload).
    const patch = {};
    if (!primary.discord_id && secondary.discord_id) {
      Object.assign(patch, {
        discord_id: secondary.discord_id,
        discord_roles: secondary.discord_roles,
        discord_avatar_hash: secondary.discord_avatar_hash,
        discord_guild_avatar_hash: secondary.discord_guild_avatar_hash,
        discord_email: secondary.discord_email,
      });
    }
    if (!primary.ts3_uid && secondary.ts3_uid) {
      Object.assign(patch, { ts3_uid: secondary.ts3_uid, ts3_ip: secondary.ts3_ip });
    }
    if (!primary.ts6_uid && secondary.ts6_uid) {
      Object.assign(patch, { ts6_uid: secondary.ts6_uid, ts6_ip: secondary.ts6_ip });
    }
    // Contact email is a general field, not tied to one identity type — keep primary's own
    // if it already set one (manually or via Discord), otherwise inherit secondary's along
    // with whatever notification preference was attached to it.
    if (!primary.email && secondary.email) {
      Object.assign(patch, { email: secondary.email, email_notifications: secondary.email_notifications });
    }
    if (Object.keys(patch).length) {
      const cols = Object.keys(patch);
      db.prepare(`UPDATE users SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`)
        .run(...cols.map(c => patch[c]), primaryId);
    }

    audit(performedBy ?? primaryId, 'merge_accounts', 'user', primaryId,
      `merged #${secondaryId} (${secondary.username}) into #${primaryId} (${primary.username})`);
  });
  run();

  reassignUserIdInParties(secondaryId, primaryId);
  invalidateUserSessions(secondaryId);

  return db.prepare('SELECT * FROM users WHERE id = ?').get(primaryId);
}

module.exports = { pendingMerges, PENDING_MERGE_TTL_MS, createPendingMerge, getPendingMerge, consumePendingMerge, getMergeStats, identityList, tosNeedsAcceptance, ROLE_RANK, maxRole, mergeUsers };
