const db = require('../db');
const { identityList } = require('./accounts');
const { discordRoleFromRoles, fetchDiscordGuildRoles } = require('./discordRoles');

// ============ SESSION USER REFRESH ============
// req.session.user is a snapshot taken at login and sessions live 7 days — on its own, deleting a
// user, anonymizing them (RODO) or changing their role never reached a session that was already
// logged in. This runs on every request, before any route:
//   - the user row is gone, anonymized or banned → the login is dropped (routes then answer 401);
//   - the role always comes from the DB, so a change there applies on the very next request;
//   - for a Discord-only account the live guild roles are re-checked every DISCORD_RECHECK_MS via
//     the bot (the same rule as a fresh Discord login, see loginRole): losing the admin role on
//     Discord demotes, leaving the server / losing the member role logs out. If Discord can't be
//     reached the last known state is kept.
const DISCORD_RECHECK_MS = 10 * 60 * 1000;

function dropLogin(req) {
  delete req.session.user;
  delete req.session.impersonatorId;
}

async function recheckDiscord(req, su, row) {
  const now = Date.now();
  const last = req.session.discordCheckedAt;
  // A session from before this existed (or a test login) starts its clock on first sight.
  if (!last) { req.session.discordCheckedAt = now; return; }
  if (now - last < DISCORD_RECHECK_MS) return;
  req.session.discordCheckedAt = now;

  const roles = await fetchDiscordGuildRoles(row.discord_id);
  if (roles === null) return;
  db.prepare('UPDATE users SET discord_roles = ? WHERE id = ?').run(JSON.stringify(roles), row.id);
  // TeamSpeak logins don't carry Discord roles in the session (see completeTsSession) — keep it so.
  if (su.auth_method !== 'teamspeak' && su.auth_method !== 'teamspeak3') su.discord_roles = roles;

  const ids = identityList(row);
  if (ids.length !== 1 || ids[0] !== 'discord') return; // linked account: role may come from elsewhere
  const discordRole = discordRoleFromRoles(roles, row.discord_id);
  if (!discordRole) {
    console.log(`[AUTH] User #${row.id} no longer has a required Discord role — logging out`);
    dropLogin(req);
    return;
  }
  if (discordRole !== row.role) {
    console.log(`[AUTH] User #${row.id} role ${row.role} → ${discordRole} (live Discord check)`);
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(discordRole, row.id);
    su.role = discordRole;
  }
}

async function refreshSessionUser(req, res, next) {
  const su = req.session?.user;
  if (!su) return next();
  try {
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(su.id);
    if (!row || row.is_anonymized || row.banned_at) {
      dropLogin(req);
      return next();
    }
    if (su.role !== row.role) su.role = row.role;
    // While impersonating, the session belongs to the dev — don't log them out over the target.
    if (row.discord_id && !req.session.impersonatorId) await recheckDiscord(req, su, row);
  } catch (err) {
    console.error('[AUTH] Session refresh failed:', err.message);
  }
  next();
}

module.exports = { refreshSessionUser, DISCORD_RECHECK_MS };
