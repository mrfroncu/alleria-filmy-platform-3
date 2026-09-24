const session = require('express-session');
const Database = require('better-sqlite3');

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

// express-session store on better-sqlite3 (synchronous, already a dependency for the main DB)
// replacing connect-sqlite3, which dragged in the native `sqlite3` package and its build
// toolchain (and the toolchain's open advisories — see the 2026-09 security audit).
//
// Deliberately keeps connect-sqlite3's on-disk format — same file (data/sessions.db), same
// table (sid PRIMARY KEY, expired = epoch ms, sess = JSON) and the same expiry rules — so the
// switch is invisible to users: sessions written by the old store stay valid after a deploy.
class SqliteSessionStore extends session.Store {
  constructor({ file, table = 'sessions' } = {}) {
    super();
    if (!/^\w+$/.test(table)) throw new Error(`Invalid session table name: ${table}`);
    this.table = table;
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`CREATE TABLE IF NOT EXISTS ${table} (sid PRIMARY KEY, expired, sess)`);
    this.stmts = {
      get: this.db.prepare(`SELECT sess FROM ${table} WHERE sid = ? AND ? <= expired`),
      set: this.db.prepare(`INSERT OR REPLACE INTO ${table} (sid, expired, sess) VALUES (?, ?, ?)`),
      destroy: this.db.prepare(`DELETE FROM ${table} WHERE sid = ?`),
      touch: this.db.prepare(`UPDATE ${table} SET expired = ? WHERE sid = ? AND ? <= expired`),
      all: this.db.prepare(`SELECT sid, expired, sess FROM ${table} WHERE ? <= expired`),
      length: this.db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE ? <= expired`),
      clear: this.db.prepare(`DELETE FROM ${table}`),
      cleanup: this.db.prepare(`DELETE FROM ${table} WHERE expired < ?`),
    };
    this.cleanup();
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
  }

  cleanup() {
    try { this.stmts.cleanup.run(Date.now()); } catch (e) { console.error('[SESSIONS] Cleanup failed:', e.message); }
  }

  get(sid, cb) {
    try {
      const row = this.stmts.get.get(sid, Date.now());
      cb(null, row ? JSON.parse(row.sess) : null);
    } catch (e) { cb(e); }
  }

  set(sid, sess, cb) {
    try {
      const maxAge = sess?.cookie?.maxAge;
      const expired = Date.now() + (maxAge ? maxAge : ONE_DAY_MS);
      this.stmts.set.run(sid, expired, JSON.stringify(sess));
      if (cb) cb(null);
    } catch (e) { if (cb) cb(e); }
  }

  destroy(sid, cb) {
    try {
      this.stmts.destroy.run(sid);
      if (cb) cb(null);
    } catch (e) { if (cb) cb(e); }
  }

  touch(sid, sess, cb) {
    try {
      if (sess?.cookie?.expires) {
        this.stmts.touch.run(new Date(sess.cookie.expires).getTime(), sid, Date.now());
      }
      if (cb) cb(null);
    } catch (e) { if (cb) cb(e); }
  }

  all(cb) {
    try {
      cb(null, this.rows().map(r => r.sess));
    } catch (e) { cb(e); }
  }

  length(cb) {
    try { cb(null, this.stmts.length.get(Date.now()).c); } catch (e) { cb(e); }
  }

  clear(cb) {
    try {
      this.stmts.clear.run();
      if (cb) cb(null);
    } catch (e) { if (cb) cb(e); }
  }

  // Live sessions with their sid and expiry kept — the standard Store API (all()) only hands
  // back session objects, which isn't enough to list or kill a specific user's devices.
  rows() {
    const out = [];
    for (const row of this.stmts.all.all(Date.now())) {
      let sess;
      try { sess = JSON.parse(row.sess); } catch (_) { continue; }
      out.push({ sid: row.sid, expired: row.expired, sess });
    }
    return out;
  }

  close() {
    clearInterval(this.cleanupTimer);
    this.db.close();
  }
}

module.exports = { SqliteSessionStore };
