const fetch = require('node-fetch');
const db = require('../db');
const { getDiscordRoleSetting } = require('./tsConfig');

// ============ DEV ACCOUNTS ============
// DISCORD_DEV_MODE picks how Discord grants 'dev' (.env only, never panel-overridable):
//   user (default, also for a missing/unknown value) — DISCORD_DEV_USER_IDS, comma-separated
//        Discord account ids. Only whoever edits .env decides who is dev.
//   role — DISCORD_DEV_ROLE_ID, a guild role. Anyone with Manage Roles on the Discord server can
//        then hand themselves the role, and with it full control of the platform (SQL console,
//        DB import, settings).
function devMode() {
  return (process.env.DISCORD_DEV_MODE || '').trim().toLowerCase() === 'role' ? 'role' : 'user';
}

function devDiscordIds() {
  return (process.env.DISCORD_DEV_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
}

// Whether the env var the current mode reads is set at all.
function devConfigured() {
  return devMode() === 'role' ? !!(process.env.DISCORD_DEV_ROLE_ID || '').trim() : devDiscordIds().length > 0;
}

function isDevOnDiscord(discordId, roles) {
  if (!discordId) return false;
  if (devMode() === 'role') {
    const devRoleId = (process.env.DISCORD_DEV_ROLE_ID || '').trim();
    return !!devRoleId && Array.isArray(roles) && roles.includes(devRoleId);
  }
  return devDiscordIds().includes(String(discordId));
}

// ============ DISCORD ROLES ============
// 'admin' / 'member' from guild role ids alone, or null. Role ids are optionally panel-managed
// (DISCORD_ROLES_CONFIG_SOURCE).
function memberOrAdminFromRoles(roles) {
  const memberRoleId = getDiscordRoleSetting('discord_member_role_id', process.env.DISCORD_MEMBER_ROLE_ID || '');
  const adminRoleId = getDiscordRoleSetting('discord_admin_role_id', process.env.DISCORD_ADMIN_ROLE_ID || '');
  if (adminRoleId && roles.includes(adminRoleId)) return 'admin';
  if (memberRoleId && roles.includes(memberRoleId)) return 'member';
  return null;
}

// 'dev' / 'admin' / 'member' for a Discord user from their id and guild role ids, or null with none
// of the required ones. Dev per DISCORD_DEV_MODE, see above.
function discordRoleFromRoles(roles, discordId) {
  if (isDevOnDiscord(discordId, roles)) return 'dev';
  return memberOrAdminFromRoles(roles);
}

// Stored 'dev' roles that the current dev config no longer backs — e.g. granted by a role before
// switching to user mode, or by an id/role since removed. Linked accounts never lose a role on
// login (maxRole), so without this such a dev would stay one for good. In role mode the stored
// discord_roles are used (refreshed on every Discord login and live re-check). An account with
// Authentik linked is left alone while AUTHENTIK_DEV_GROUPS is set (its group may be what made it
// dev; the next Authentik login settles that). Runs at startup; returns the demoted.
function demoteUnauthorizedDevs() {
  const authentikDev = !!(process.env.AUTHENTIK_DEV_GROUPS || '').trim();
  const source = devMode() === 'role' ? 'DISCORD_DEV_ROLE_ID' : 'DISCORD_DEV_USER_IDS';
  const demoted = [];
  for (const u of db.prepare("SELECT id, display_name, username, discord_id, discord_roles, authentik_sub FROM users WHERE role = 'dev'").all()) {
    let roles = [];
    try { roles = JSON.parse(u.discord_roles || '[]'); } catch (e) {}
    if (!Array.isArray(roles)) roles = [];
    if (isDevOnDiscord(u.discord_id, roles)) continue;
    if (authentikDev && u.authentik_sub) continue;
    const role = memberOrAdminFromRoles(roles) || 'member';
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, u.id);
    console.warn(`[AUTH] User #${u.id} (${u.display_name || u.username}) had role dev not backed by ${source} — now ${role}`);
    demoted.push({ id: u.id, role });
  }
  return demoted;
}

// Live guild roles of a Discord user via the bot: an array ([] = not on the server), or null when
// that can't be determined right now (bot not configured, Discord down) — callers then keep
// whatever they knew before instead of treating it as "no roles".
async function fetchDiscordGuildRoles(discordId) {
  if (!process.env.DISCORD_BOT_TOKEN || !process.env.DISCORD_GUILD_ID) return null;
  // DISCORD_API_URL exists only so the API tests can point this at a fake Discord.
  const api = process.env.DISCORD_API_URL || 'https://discord.com/api';
  try {
    const r = await fetch(`${api}/guilds/${process.env.DISCORD_GUILD_ID}/members/${discordId}`,
      { headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` } });
    if (r.status === 404) return [];
    if (!r.ok) { console.warn('[AUTH] Guild member lookup failed:', r.status); return null; }
    const m = await r.json();
    return Array.isArray(m.roles) ? m.roles : [];
  } catch (e) {
    console.warn('[AUTH] Guild member lookup error:', e.message);
    return null;
  }
}

module.exports = { devMode, devDiscordIds, devConfigured, isDevOnDiscord, discordRoleFromRoles, demoteUnauthorizedDevs, fetchDiscordGuildRoles };
