const fetch = require('node-fetch');
const { getDiscordRoleSetting } = require('./tsConfig');

// ============ DISCORD ROLES ============
// 'dev' / 'admin' / 'member' from a guild member's Discord role ids, or null with none of the
// required ones. Member/admin role ids are optionally panel-managed (DISCORD_ROLES_CONFIG_SOURCE);
// the dev role always comes straight from .env, no override.
function discordRoleFromRoles(roles) {
  const memberRoleId = getDiscordRoleSetting('discord_member_role_id', process.env.DISCORD_MEMBER_ROLE_ID || '');
  const adminRoleId = getDiscordRoleSetting('discord_admin_role_id', process.env.DISCORD_ADMIN_ROLE_ID || '');
  const hasMemberRole = roles.includes(memberRoleId);
  const hasAdminRole = roles.includes(adminRoleId);
  const hasDevRole = roles.includes(process.env.DISCORD_DEV_ROLE_ID);
  if (hasDevRole) return 'dev';
  if (hasAdminRole) return 'admin';
  if (hasMemberRole) return 'member';
  return null;
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

module.exports = { discordRoleFromRoles, fetchDiscordGuildRoles };
