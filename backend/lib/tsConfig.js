const { getSetting } = require('./settings');

// Config-source flags — .env-only, boot-time (require a restart to flip), never editable from the panel.
// This is the escape hatch: if a panel-managed value ever breaks TS/Discord login, flipping the
// flag back to 'env' and restarting ignores whatever is in the DB and falls back to plain .env.
function tsConfigSource() {
  return (process.env.TS_CONFIG_SOURCE || 'env').toLowerCase() === 'panel' ? 'panel' : 'env';
}
function discordRolesConfigSource() {
  return (process.env.DISCORD_ROLES_CONFIG_SOURCE || 'env').toLowerCase() === 'panel' ? 'panel' : 'env';
}
// Effective value for a TS3/TS6 config field: in 'panel' mode, DB setting wins (falling back to the
// .env-derived value when no DB row exists yet — i.e. first save in the panel "copies" from .env);
// in 'env' mode, the DB is ignored entirely and the .env-derived value always wins.
function getTsSetting(dbKey, envValue) {
  return tsConfigSource() === 'panel' ? getSetting(dbKey, envValue) : envValue;
}
function getDiscordRoleSetting(dbKey, envValue) {
  return discordRolesConfigSource() === 'panel' ? getSetting(dbKey, envValue) : envValue;
}
function getTsBotNickname() {
  return getTsSetting('ts_bot_nickname', process.env.TS_BOT_NICKNAME || 'ALLERIA VIDEOS PLATFORM');
}

module.exports = { tsConfigSource, discordRolesConfigSource, getTsSetting, getDiscordRoleSetting, getTsBotNickname };
