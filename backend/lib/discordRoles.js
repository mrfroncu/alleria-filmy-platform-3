const fetch = require('node-fetch');
const db = require('../db');
const { getDiscordRoleSetting } = require('./tsConfig');

// ============ DEV ACCOUNTS ============
// 'dev' is granted per Discord ACCOUNT (DISCORD_DEV_USER_IDS, comma-separated user ids), never per
// guild role: anyone with Manage Roles on the Discord server could hand themselves a role, and with
// it full control of the platform (SQL console, DB import, settings).
function devDiscordIds() {
  return (process.env.DISCORD_DEV_USER_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
}

function isDevDiscordId(discordId) {
  return !!discordId && devDiscordIds().includes(String(discordId));
}

// ============ DISCORD ROLES ============
// 'dev' / 'admin' / 'member' for a Discord user from their id and guild role ids, or null with none
// of the required ones. Member/admin role ids are optionally panel-managed
// (DISCORD_ROLES_CONFIG_SOURCE); dev comes only from DISCORD_DEV_USER_IDS in .env.
function discordRoleFromRoles(roles, discordId) {
  if (isDevDiscordId(discordId)) return 'dev';
  const memberRoleId = getDiscordRoleSetting('discord_member_role_id', process.env.DISCORD_MEMBER_ROLE_ID || '');
  const adminRoleId = getDiscordRoleSetting('discord_admin_role_id', process.env.DISCORD_ADMIN_ROLE_ID || '');
  if (adminRoleId && roles.includes(adminRoleId)) return 'admin';
  if (memberRoleId && roles.includes(memberRoleId)) return 'member';
  return null;
}

// Stored 'dev' roles that no current source backs anymore — granted earlier by the old
// DISCORD_DEV_ROLE_ID, or by a Discord id since removed from DISCORD_DEV_USER_IDS. Linked accounts
// never lose a role on login (maxRole), so without this such a dev would stay one for good. An
// account with Authentik linked is left alone while AUTHENTIK_DEV_GROUPS is set (its group may be
// what made it dev; the next Authentik login settles that). Runs at startup; returns the demoted.
function demoteUnlistedDevs() {
  const authentikDev = !!(process.env.AUTHENTIK_DEV_GROUPS || '').trim();
  const demoted = [];
  for (const u of db.prepare("SELECT id, display_name, username, discord_id, discord_roles, authentik_sub FROM users WHERE role = 'dev'").all()) {
    if (isDevDiscordId(u.discord_id)) continue;
    if (authentikDev && u.authentik_sub) continue;
    let roles = [];
    try { roles = JSON.parse(u.discord_roles || '[]'); } catch (e) {}
    const role = discordRoleFromRoles(Array.isArray(roles) ? roles : [], null) || 'member';
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, u.id);
    console.warn(`[AUTH] User #${u.id} (${u.display_name || u.username}) had role dev without a DISCORD_DEV_USER_IDS entry — now ${role}`);
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

module.exports = { devDiscordIds, isDevDiscordId, discordRoleFromRoles, demoteUnlistedDevs, fetchDiscordGuildRoles };
