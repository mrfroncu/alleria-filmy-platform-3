const db = require('../db');

// ============ APP SETTINGS (key/value) ============
function getSetting(key, defaultVal = null) {
  try {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
    return row ? row.value : defaultVal;
  } catch (_) { return defaultVal; }
}

function setSetting(key, value) {
  db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));
}

// Removes a setting row entirely (as opposed to setting it to ''), so getSetting() falls back to
// its .env-derived default again — this is how a panel field gets "reset to .env" from the UI.
function clearSetting(key) {
  db.prepare('DELETE FROM app_settings WHERE key = ?').run(key);
}

// Content length limits — configurable via Debug Tools, with defaults.
const LIMIT_DEFAULTS = { limit_display_name: 50, limit_bio: 1000, limit_comment: 3000 };

function getLimit(key) {
  const v = parseInt(getSetting(key, ''), 10);
  return Number.isInteger(v) && v > 0 ? v : LIMIT_DEFAULTS[key];
}

module.exports = { getSetting, setSetting, clearSetting, LIMIT_DEFAULTS, getLimit };
