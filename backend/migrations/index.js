// Numbered schema migrations.
//
// Each migration is a file NNN_name.js exporting { version, name, description, up(db) } and is
// listed in MIGRATIONS below (explicitly — a stray file in this folder never runs by accident).
// On startup every migration not yet recorded in schema_migrations runs exactly once, in version
// order, inside a transaction (unless it sets `transaction: false`), and is then recorded there
// and in PRAGMA user_version. A failing migration aborts startup instead of letting the app run
// against a half-migrated schema.
//
// Adding a change: create e.g. 003_something.js with `version: 3`, append it to MIGRATIONS.
// Never edit a migration that has already shipped — write a new one.
const fs = require('fs');
const path = require('path');

const MIGRATIONS = [
  require('./001_baseline'),
  require('./002_indexes'),
];

const BACKUP_PREFIX = 'alleria-';
const MAX_BACKUPS = 5;

MIGRATIONS.forEach((m, i) => {
  if (m.version !== i + 1) throw new Error(`Migration list out of order: expected version ${i + 1}, got ${m.version} (${m.name})`);
});
const LATEST_VERSION = MIGRATIONS.length;

const pad = (v) => String(v).padStart(3, '0');

function ensureMigrationsTable(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now')),
    duration_ms INTEGER
  )`);
}

function appliedRows(db) {
  return db.prepare('SELECT version, name, applied_at, duration_ms FROM schema_migrations ORDER BY version').all();
}

function backupDirFor(dbPath) {
  return path.join(path.dirname(dbPath), 'backups');
}

function listBackups(dbPath) {
  const dir = backupDirFor(dbPath);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.startsWith(BACKUP_PREFIX) && f.endsWith('.db'))
    .map(f => {
      const st = fs.statSync(path.join(dir, f));
      return { file: f, sizeBytes: st.size, createdAt: st.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Consistent snapshot of the live database (WAL included) via VACUUM INTO — synchronous, so it
// can run during startup before anything else touches the DB. `label` names the reason, e.g.
// 'before-v003' (automatic, pre-migration) or 'manual-v002'. Keeps the newest MAX_BACKUPS.
function backupDatabase(db, dbPath, label) {
  const dir = backupDirFor(dbPath);
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace(/-\d{3}Z$/, 'Z');
  const file = path.join(dir, `${BACKUP_PREFIX}${label}-${stamp}.db`);
  db.prepare('VACUUM INTO ?').run(file);
  for (const old of listBackups(dbPath).slice(MAX_BACKUPS)) {
    try { fs.unlinkSync(path.join(dir, old.file)); } catch (e) {}
  }
  return path.basename(file);
}

function runMigrations(db, { dbPath, isTest = false } = {}) {
  ensureMigrationsTable(db);
  const applied = new Set(appliedRows(db).map(r => r.version));
  const dbVersion = applied.size ? Math.max(...applied) : 0;
  if (dbVersion > LATEST_VERSION) {
    console.warn(`[DB] ⚠️  Database schema is v${pad(dbVersion)} but this build only knows up to v${pad(LATEST_VERSION)} — was the app rolled back? Running anyway; newer columns/tables are simply ignored.`);
  }

  const pending = MIGRATIONS.filter(m => !applied.has(m.version));
  if (pending.length === 0) return;

  // A brand-new database has nothing worth saving; an existing one gets a snapshot before any
  // schema change, so a bad migration can always be undone by swapping the file back.
  const hasData = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
  if (hasData && !isTest && dbPath && dbPath !== ':memory:') {
    const file = backupDatabase(db, dbPath, `before-v${pad(pending[0].version)}`);
    console.log(`[DB] Backup before migrating: backups/${file}`);
  }

  const record = db.prepare('INSERT INTO schema_migrations (version, name, duration_ms) VALUES (?, ?, ?)');
  for (const m of pending) {
    const started = Date.now();
    const apply = () => {
      m.up(db);
      record.run(m.version, m.name, Date.now() - started);
    };
    try {
      if (m.transaction === false) apply(); else db.transaction(apply)();
    } catch (e) {
      console.error(`[DB] ❌ Migration ${pad(m.version)} "${m.name}" failed: ${e.message}`);
      throw e;
    }
    db.pragma(`user_version = ${m.version}`);
    if (!isTest) console.log(`[DB] ✅ Migration ${pad(m.version)} "${m.name}" applied (${Date.now() - started} ms)`);
  }
}

function getMigrationStatus(db, dbPath) {
  const rows = appliedRows(db);
  const byVersion = new Map(MIGRATIONS.map(m => [m.version, m]));
  const appliedSet = new Set(rows.map(r => r.version));
  const current = rows.length ? rows[rows.length - 1].version : 0;
  const fileSize = (p) => { try { return fs.statSync(p).size; } catch (e) { return 0; } };
  return {
    currentVersion: current,
    latestVersion: LATEST_VERSION,
    status: current > LATEST_VERSION ? 'ahead' : current < LATEST_VERSION ? 'behind' : 'ok',
    applied: rows.map(r => ({
      ...r,
      description: byVersion.get(r.version)?.description || null,
      known: byVersion.has(r.version),
    })),
    pending: MIGRATIONS.filter(m => !appliedSet.has(m.version)).map(m => ({ version: m.version, name: m.name, description: m.description })),
    backups: listBackups(dbPath),
    database: {
      sizeBytes: fileSize(dbPath) + fileSize(`${dbPath}-wal`),
      sqliteVersion: db.prepare('SELECT sqlite_version() AS v').get().v,
      journalMode: db.pragma('journal_mode', { simple: true }),
      userVersion: db.pragma('user_version', { simple: true }),
      tables: db.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get().c,
      indexes: db.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'").get().c,
    },
  };
}

module.exports = { MIGRATIONS, LATEST_VERSION, pad, runMigrations, getMigrationStatus, backupDatabase };
