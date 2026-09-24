const path = require('path');
const { IS_TEST, DATA_DIR } = require('./config');
const { SqliteSessionStore } = require('./sessionStore');

// Named so account-merge logic can reach into the store to invalidate a merged-away
// account's live session(s) — see invalidateUserSessions. In test mode express-session's
// default in-memory store is used instead (no sessions.db on disk).
const sessionStore = IS_TEST ? undefined : new SqliteSessionStore({ file: path.join(DATA_DIR, 'sessions.db') });

// Destroys every live session belonging to userId (used after a merge deletes that user's
// row — sessions aren't re-validated against the DB per request, so without this a merged-away
// account's cookie would keep working with stale data until its natural 7-day expiry).
function invalidateUserSessions(userId) {
  if (!sessionStore) return;
  for (const row of sessionStore.rows()) {
    if (row.sess?.user?.id === userId) sessionStore.destroy(row.sid);
  }
}

// Captures device context on the session at login time — express-session itself doesn't
// track this, so without it "Aktywne sesje" would have nothing to show besides a sid.
function stampSessionMeta(req) {
  req.session.ua = req.get('user-agent') || '';
  req.session.ip = req.ip || req.socket.remoteAddress || '';
  req.session.loggedInAt = new Date().toISOString();
}

// Good-enough device label from a raw User-Agent string — not a full parser, just enough
// to tell sessions apart in a list (e.g. "Chrome · Windows").
function parseUserAgent(ua) {
  if (!ua) return 'Nieznane urządzenie';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Przeglądarka';
  // iPhone/iPad UAs contain "like Mac OS X" for compat, so they must be checked before macOS.
  const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS'
    : /Android/.test(ua) ? 'Android' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} · ${os}` : browser;
}

// Powers GET /api/profile/sessions — this user's live sessions, newest login first.
async function listUserSessions(userId) {
  if (!sessionStore) return [];
  return sessionStore.rows()
    .filter(row => row.sess?.user?.id === userId)
    .map(row => ({
      sid: row.sid,
      device: parseUserAgent(row.sess.ua),
      ip: row.sess.ip || null,
      loggedInAt: row.sess.loggedInAt || null,
      expiresAt: row.expired ? new Date(row.expired).toISOString() : null,
    }))
    .sort((a, b) => (b.loggedInAt || '').localeCompare(a.loggedInAt || ''));
}

module.exports = { sessionStore, invalidateUserSessions, stampSessionMeta, parseUserAgent, listUserSessions };
