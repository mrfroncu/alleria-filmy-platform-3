const path = require('path');
const fs = require('fs');
const os = require('os');
const express = require('express');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { uploadsDir, gdprDir } = require('../lib/config');
const { DB_PATH } = require('../database');
const { getMigrationStatus, backupDatabase, pad, LATEST_VERSION } = require('../migrations');
const { audit } = require('../lib/helpers');
const { checkCatAccess, getUserRankIds, parseCatModes } = require('../lib/access');
const { requireDev } = require('../lib/auth');
const { sessionStore } = require('../lib/sessions');
const { VERSION } = require('../versions');

const router = express.Router();

router.get('/api/debug/access/:type/:id', requireDev, (req, res) => {
  const { type, id } = req.params;
  const dbUsers = db.prepare('SELECT id, username, display_name, avatar, role, discord_roles FROM users ORDER BY role DESC, display_name ASC').all();

  const computeUsers = (catId, accessMode, videoCustomIds = null) =>
    dbUsers.map(u => {
      const dr = JSON.parse(u.discord_roles || '[]');
      const ur = getUserRankIds(u.id);
      if (u.role === 'dev') {
        return { id: u.id, username: u.username, display_name: u.display_name, avatar: u.avatar, role: u.role, discord_roles: dr, app_rank_ids: ur, has_access: true, can_edit: true, reason: 'dev' };
      }
      if (videoCustomIds !== null) {
        const has = videoCustomIds.has(u.id);
        return { id: u.id, username: u.username, display_name: u.display_name, avatar: u.avatar, role: u.role, discord_roles: dr, app_rank_ids: ur, has_access: has, can_edit: false, reason: has ? 'custom_video_access' : 'not_in_custom_list' };
      }
      const { canView, canEdit } = checkCatAccess(catId, accessMode, u.id, dr, ur);
      let reason = 'no_access';
      if (canEdit) reason = 'editor';
      else if (canView) {
        const { vm } = parseCatModes(accessMode);
        reason = vm === 'public' ? 'public' : vm === 'custom' ? 'custom_viewer' : 'viewer_role_or_rank';
      }
      return { id: u.id, username: u.username, display_name: u.display_name, avatar: u.avatar, role: u.role, discord_roles: dr, app_rank_ids: ur, has_access: canView, can_edit: canEdit, reason };
    });

  if (type === 'category') {
    const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
    if (!cat) return res.status(404).json({ error: 'Category not found' });
    const { vm, em } = parseCatModes(cat.access_mode);
    const rules = db.prepare('SELECT * FROM category_access WHERE category_id = ?').all(id);
    const rankRules = db.prepare('SELECT cra.*, r.name AS rank_name FROM category_rank_access cra JOIN app_ranks r ON cra.rank_id = r.id WHERE cra.category_id = ?').all(id);
    return res.json({
      type: 'category', name: cat.name, access_mode: cat.access_mode,
      viewer_mode: vm, editor_mode: em,
      viewer_roles: rules.filter(r => r.access_type === 'viewer').map(r => r.discord_role_id),
      editor_roles: rules.filter(r => r.access_type === 'editor').map(r => r.discord_role_id),
      viewer_ranks: rankRules.filter(r => r.access_type === 'viewer'),
      editor_ranks: rankRules.filter(r => r.access_type === 'editor'),
      users: computeUsers(parseInt(id), cat.access_mode),
    });
  }

  if (type === 'video') {
    const video = db.prepare('SELECT v.*, c.name AS category_name, c.access_mode AS cat_access_mode FROM videos v LEFT JOIN categories c ON v.category_id = c.id WHERE v.id = ?').get(id);
    if (!video) return res.status(404).json({ error: 'Video not found' });
    if (video.access_mode === 'custom') {
      const rows = db.prepare('SELECT user_id FROM video_access WHERE video_id = ?').all(video.id);
      return res.json({ type: 'video', title: video.title, access_mode: 'custom', users: computeUsers(null, null, new Set(rows.map(r => r.user_id))) });
    }
    const catId = video.category_id;
    const catMode = catId ? (video.cat_access_mode || 'public:none') : 'public:none';
    const { vm, em } = parseCatModes(catMode);
    return res.json({
      type: 'video', title: video.title, access_mode: video.access_mode,
      category_id: catId, category_name: video.category_name,
      viewer_mode: vm, editor_mode: em,
      users: catId ? computeUsers(catId, catMode) : computeUsers(null, 'public:none'),
    });
  }

  res.status(400).json({ error: 'Invalid type' });
});

// schema_migrations describes the schema of THIS install, not data — importing another install's
// history would make it look migrated when it isn't (or the reverse).
const EXPORT_SKIP_TABLES = new Set(['sessions', 'schema_migrations']);

router.get('/api/debug/export', requireDev, (req, res) => {
  try {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all().map(t => t.name).filter(n => !EXPORT_SKIP_TABLES.has(n));

    // Stream the JSON row-by-row instead of buffering the whole DB in memory.
    // Avoids large memory spikes and keeps the connection active so a reverse
    // proxy doesn't time out (the cause of intermittent 502s on big exports).
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition',
      `attachment; filename="alleria-filmy-export-${new Date().toISOString().slice(0, 10)}.json"`);

    // `_meta` is an object, not a row array, so even older import code skips it harmlessly.
    res.write('{"_meta":' + JSON.stringify({
      format: 'alleria-filmy-export',
      app_version: VERSION,
      schema_version: getMigrationStatus(db, DB_PATH).currentVersion,
      exported_at: new Date().toISOString(),
    }));
    tables.forEach((name) => {
      res.write(',' + JSON.stringify(name) + ':[');
      let ri = 0;
      for (const row of db.prepare(`SELECT * FROM "${name}"`).iterate()) {
        res.write((ri++ > 0 ? ',' : '') + JSON.stringify(row));
      }
      res.write(']');
    });
    res.write('}');
    res.end();
  } catch (err) {
    console.error('[EXPORT] failed:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Export failed: ' + err.message });
    else res.end();
  }
});

// Database file size + row stats
router.get('/api/debug/db-stats', requireDev, (req, res) => {
  try {
    const parts = {};
    let sizeBytes = 0, mainBytes = 0;
    for (const f of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) {
      try { const s = fs.statSync(f); parts[path.basename(f)] = s.size; sizeBytes += s.size; if (f === DB_PATH) mainBytes = s.size; } catch (_) {}
    }
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
    let rowCount = 0;
    for (const t of tables) {
      try { rowCount += db.prepare(`SELECT COUNT(*) AS c FROM "${t.name}"`).get().c; } catch (_) {}
    }
    res.json({ sizeBytes, mainBytes, parts, tableCount: tables.length, rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Schema migration state (Zarządzanie → Ustawienia → Baza danych)
router.get('/api/debug/migrations', requireDev, (req, res) => {
  try {
    res.json(getMigrationStatus(db, DB_PATH));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// On-demand snapshot into data/backups/ — same mechanism as the automatic pre-migration backup.
router.post('/api/debug/migrations/backup', requireDev, (req, res) => {
  try {
    const file = backupDatabase(db, DB_PATH, `manual-v${pad(getMigrationStatus(db, DB_PATH).currentVersion)}`);
    audit(req.session.user.id, 'backup', 'database', null, file);
    res.json({ success: true, file });
  } catch (err) {
    res.status(500).json({ error: 'Nie udało się utworzyć kopii: ' + err.message });
  }
});

// What an export does NOT carry — shown in the "what else to copy" popup after exporting.
router.get('/api/debug/export/extras', requireDev, (req, res) => {
  const dirStats = (dir) => {
    let files = 0, bytes = 0;
    try {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!f.isFile()) continue;
        files++;
        try { bytes += fs.statSync(path.join(dir, f.name)).size; } catch (_) {}
      }
    } catch (_) {}
    return { files, bytes };
  };
  const pendingGdpr = db.prepare("SELECT COUNT(*) AS c FROM gdpr_requests WHERE export_file IS NOT NULL AND export_file != ''").get().c;
  res.json({ uploads: dirStats(uploadsDir), gdpr: { ...dirStats(gdprDir), withFile: pendingGdpr } });
});

// Just under V8's max string length (~512 MiB) — the whole file has to become one string to parse.
const IMPORT_MAX_BYTES = 500 * 1024 * 1024;

// Replaces every table's contents with the export's. Tolerates schema drift between the two
// installs: tables/columns the export has but this schema doesn't are skipped (and reported),
// ones it lacks just stay empty or take their column defaults.
// Also the restore path of the setup wizard (WelcomeStep.jsx) on a fresh install.
router.post('/api/debug/import', requireDev, express.json({ limit: IMPORT_MAX_BYTES }), (req, res) => runImport(req, res, req.body));

// Chunked variant, used unless chunked_upload is switched off — same reason as video uploads:
// Cloudflare refuses any single request over 100 MB. Videos are assembled by the streaming
// server; an import is assembled here, in the OS temp dir (the container's own filesystem, not
// the data volume, so a crash mid-upload leaves nothing behind after a restart).
const IMPORT_CHUNK_DIR = path.join(os.tmpdir(), 'alleria-import');
const IMPORT_CHUNK_MAX = 64 * 1024 * 1024; // client sends 50 MB parts
const IMPORT_STALE_MS = 60 * 60 * 1000;
const importUploads = new Map(); // upload_id -> { dir, total, size, userId, createdAt }

function dropImportUpload(id) {
  const u = importUploads.get(id);
  importUploads.delete(id);
  if (u) fs.rm(u.dir, { recursive: true, force: true }, () => {});
}

function getImportUpload(req, res, id) {
  const u = importUploads.get(id);
  if (!u || u.userId !== req.session.user.id) {
    res.status(404).json({ error: 'Nieznany lub wygasły upload - wybierz plik ponownie.' });
    return null;
  }
  return u;
}

router.post('/api/debug/import/init', requireDev, (req, res) => {
  for (const [id, u] of importUploads) if (Date.now() - u.createdAt > IMPORT_STALE_MS) dropImportUpload(id);
  const size = Number(req.body.filesize);
  const total = Number(req.body.total_chunks);
  if (!Number.isInteger(size) || size <= 0 || size > IMPORT_MAX_BYTES) {
    return res.status(400).json({ error: `Plik jest pusty albo większy niż ${IMPORT_MAX_BYTES / 1024 / 1024} MB.` });
  }
  if (!Number.isInteger(total) || total < Math.ceil(size / IMPORT_CHUNK_MAX) || total > size) {
    return res.status(400).json({ error: 'Nieprawidłowa liczba części.' });
  }
  const id = uuidv4();
  const dir = path.join(IMPORT_CHUNK_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  importUploads.set(id, { dir, total, size, userId: req.session.user.id, createdAt: Date.now() });
  res.json({ success: true, upload_id: id });
});

// Raw application/octet-stream body — neither global body parser touches it, so it streams
// straight to disk.
router.post('/api/debug/import/chunk', requireDev, (req, res) => {
  const u = getImportUpload(req, res, req.query.upload_id);
  if (!u) return;
  const index = Number(req.query.index);
  if (!Number.isInteger(index) || index < 0 || index >= u.total) return res.status(400).json({ error: 'Nieprawidłowy numer części.' });
  if (Number(req.headers['content-length']) > IMPORT_CHUNK_MAX) return res.status(413).json({ error: 'Część pliku jest za duża.' });

  const file = path.join(u.dir, String(index));
  const out = fs.createWriteStream(file);
  let bytes = 0, done = false;
  const fail = (status, error) => {
    if (done) return;
    done = true;
    req.unpipe(out);
    out.destroy();
    fs.rm(file, { force: true }, () => {});
    res.status(status).json({ error });
  };
  req.on('data', (c) => { bytes += c.length; if (bytes > IMPORT_CHUNK_MAX) fail(413, 'Część pliku jest za duża.'); });
  req.on('aborted', () => fail(400, 'Przerwano wysyłanie.'));
  out.on('error', (err) => fail(500, 'Nie udało się zapisać części: ' + err.message));
  out.on('finish', () => { if (!done) { done = true; res.json({ success: true, index, bytes }); } });
  req.pipe(out);
});

router.post('/api/debug/import/complete', requireDev, (req, res) => {
  const id = req.body.upload_id;
  const u = getImportUpload(req, res, id);
  if (!u) return;
  let data;
  try {
    const parts = [];
    for (let i = 0; i < u.total; i++) {
      const f = path.join(u.dir, String(i));
      if (!fs.existsSync(f)) return res.status(400).json({ error: `Brak części ${i + 1}/${u.total} - wyślij plik ponownie.` });
      parts.push(fs.readFileSync(f));
    }
    const buf = Buffer.concat(parts);
    if (buf.length !== u.size) return res.status(400).json({ error: `Niekompletny plik (${buf.length} z ${u.size} bajtów) - wyślij go ponownie.` });
    try {
      data = JSON.parse(buf.toString('utf8'));
    } catch (e) {
      return res.status(400).json({ error: 'Plik nie jest poprawnym JSON-em: ' + e.message });
    }
  } finally {
    dropImportUpload(id);
  }
  runImport(req, res, data);
});

function runImport(req, res, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.users) || !Array.isArray(data.app_settings)) {
    return res.status(400).json({ error: 'To nie wygląda na eksport Alleria Filmy (brak tabel users / app_settings).' });
  }
  const meta = data._meta && typeof data._meta === 'object' ? data._meta : null;

  let backup = null;
  try {
    // Safety net: a wrong file must never be a one-way trip.
    if (DB_PATH !== ':memory:') backup = backupDatabase(db, DB_PATH, 'before-import');
  } catch (err) {
    return res.status(500).json({ error: 'Nie udało się utworzyć kopii przed importem: ' + err.message });
  }

  const summary = { tables: 0, rows: 0, skippedTables: [], skippedColumns: {} };
  try {
    // Disable FK checks outside the transaction (SQLite does not allow PRAGMA inside a transaction)
    db.prepare('PRAGMA foreign_keys = OFF').run();
    try {
      db.transaction(() => {
        const tables = db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        ).all().map(r => r.name).filter(n => !EXPORT_SKIP_TABLES.has(n));
        const existing = new Set(tables);

        for (const name of tables) db.prepare(`DELETE FROM "${name}"`).run();

        for (const [tableName, rows] of Object.entries(data)) {
          if (tableName.startsWith('_') || EXPORT_SKIP_TABLES.has(tableName) || !Array.isArray(rows)) continue;
          if (!existing.has(tableName)) { summary.skippedTables.push(tableName); continue; }
          if (rows.length === 0) { summary.tables++; continue; }

          const targetCols = new Set(db.prepare(`PRAGMA table_info("${tableName}")`).all().map(c => c.name));
          const colSet = new Set();
          for (const r of rows) if (r && typeof r === 'object') for (const k in r) colSet.add(k);
          const exportCols = [...colSet];
          const cols = exportCols.filter(c => targetCols.has(c));
          const dropped = exportCols.filter(c => !targetCols.has(c));
          if (dropped.length) summary.skippedColumns[tableName] = dropped;
          if (cols.length === 0) continue;

          // Plain INSERT on purpose: OR IGNORE would also swallow NOT NULL/UNIQUE failures and
          // silently drop rows — any bad row must abort (and roll back) the whole import instead.
          const stmt = db.prepare(
            `INSERT INTO "${tableName}" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
          );
          for (const row of rows) {
            try {
              stmt.run(cols.map(c => (row[c] === undefined ? null : row[c])));
            } catch (e) {
              throw new Error(`tabela ${tableName}: ${e.message}`);
            }
            summary.rows++;
          }
          summary.tables++;
        }
      })();
    } finally {
      db.prepare('PRAGMA foreign_keys = ON').run();
    }
  } catch (err) {
    console.error('Import error:', err);
    return res.status(500).json({ error: 'Import nie powiódł się (baza bez zmian): ' + err.message, backup });
  }
  summary.fkViolations = db.prepare('PRAGMA foreign_key_check').all().length;

  // User ids from the old install don't line up with this one's — every other session now points
  // at an arbitrary (or missing) user id, so drop them all. The importing dev is re-bound to their
  // account in the imported data by Discord id, or has to log in again if there isn't one.
  if (sessionStore) {
    for (const row of sessionStore.rows()) if (row.sid !== req.sessionID) sessionStore.destroy(row.sid);
  }
  const me = req.session.user.discord_id
    ? db.prepare('SELECT * FROM users WHERE discord_id = ?').get(req.session.user.discord_id)
    : null;
  const finish = () => res.json({ success: true, backup, relogin: !me, meta, schemaVersion: LATEST_VERSION, ...summary });
  if (me) {
    Object.assign(req.session.user, { id: me.id, username: me.username, display_name: me.display_name, avatar: me.avatar, role: me.role });
    audit(me.id, 'import', 'database', null, `${summary.rows} rows, backup ${backup}`);
    req.session.save(finish);
  } else {
    req.session.destroy(finish);
  }
}

router.post('/api/debug/clear', requireDev, (req, res) => {
  try {
    db.prepare('DELETE FROM video_tags').run();
    db.prepare('DELETE FROM watch_logs').run();
    db.prepare('DELETE FROM login_logs').run();
    db.prepare('DELETE FROM videos').run();
    db.prepare('DELETE FROM tags').run();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Clear failed' });
  }
});

// SQL executor — DEV ONLY
router.post('/api/debug/sql', requireDev, (req, res) => {
  const { query } = req.body;
  if (!query || !query.trim()) return res.status(400).json({ error: 'Empty query' });

  const trimmed = query.trim();
  console.log(`[DEBUG SQL] Executed by ${req.session.user.display_name}: ${trimmed.slice(0, 200)}`);

  try {
    const isSelect = /^\s*(SELECT|PRAGMA|EXPLAIN)/i.test(trimmed);
    if (isSelect) {
      const rows = db.prepare(trimmed).all();
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      res.json({ success: true, type: 'query', rows, columns, count: rows.length });
    } else {
      const info = db.prepare(trimmed).run();
      res.json({ success: true, type: 'statement', changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) });
    }
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// .env sanity check — variable names only, values are never inspected/returned
const KNOWN_ENV_VARS = [
  'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_REDIRECT_URI', 'DISCORD_BOT_TOKEN', 'DISCORD_GUILD_ID',
  'DISCORD_MEMBER_ROLE_ID', 'DISCORD_ADMIN_ROLE_ID', 'DISCORD_DEV_ROLE_ID', 'DISCORD_ROLES_CONFIG_SOURCE',
  'TS_SERVER_HOST', 'TS6_HOST', 'TS_API_PORT', 'TS6_QUERY_PORT', 'TS_USERNAME', 'TS6_USERNAME', 'TS_PASSWORD', 'TS6_PASSWORD',
  'TS_API_KEY', 'TS6_API_KEY', 'TS_SERVER_ID', 'TS6_SERVER_ID', 'TS_MEMBER_GROUP_ID', 'TS6_MEMBER_GROUP_ID',
  'TS_ADMIN_GROUP_ID', 'TS6_ADMIN_GROUP_ID', 'TS_BOT_NICKNAME', 'TS_CONFIG_SOURCE',
  'TS3_HOST', 'TS3_PORT', 'TS3_USERNAME', 'TS3_PASSWORD', 'TS3_SERVER_ID', 'TS3_MEMBER_GROUP_ID', 'TS3_ADMIN_GROUP_ID',
  'SESSION_SECRET', 'PORT', 'NODE_ENV',
  'STREAM_SECRET', 'STREAM_URL', 'ALLOWED_ORIGIN',
];
const DEPRECATED_ENV_VARS = ['VIDEOS_PER_PAGE', 'GRID_COLUMNS', 'LOGS_PER_PAGE', 'IFRAME_EMBED_ENABLED', 'IFRAME_ALLOWED_ORIGINS'];
const APP_ENV_PREFIXES = /^(DISCORD_|TS3_|TS6_|TS_|SESSION_|STREAM_|IFRAME_|ALLOWED_ORIGIN|NODE_ENV|PORT)/;

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

router.get('/api/debug/env-check', requireDev, (req, res) => {
  const present = Object.keys(process.env);
  const known = new Set([...KNOWN_ENV_VARS, ...DEPRECATED_ENV_VARS]);

  const deprecated = DEPRECATED_ENV_VARS.filter(name => process.env[name] !== undefined);

  const suspicious = [];
  for (const name of present) {
    if (known.has(name) || !APP_ENV_PREFIXES.test(name)) continue;
    let best = null;
    for (const candidate of KNOWN_ENV_VARS) {
      const dist = levenshtein(name, candidate);
      if (dist > 0 && dist <= 2 && (!best || dist < best.dist)) best = { name: candidate, dist };
    }
    if (best) suspicious.push({ found: name, suggestion: best.name });
  }

  res.json({ deprecated, suspicious });
});

// Categories that have custom Discord role IDs or a custom Discord user list attached — an audit
// view so a dev can see what's affected before changing the global member/redaktor role IDs.
router.get('/api/debug/category-role-overview', requireDev, async (req, res) => {
  try {
    const cats = db.prepare('SELECT id, name FROM categories ORDER BY sort_order, name').all();
    const roleRows = db.prepare('SELECT category_id, discord_role_id, access_type FROM category_access').all();
    const userRows = db.prepare(`
      SELECT cua.category_id, cua.access_type, u.id, u.display_name, u.username
      FROM category_user_access cua
      JOIN users u ON u.id = cua.user_id
    `).all();

    // Discord role IDs are just raw snowflakes in our DB (no name cached anywhere) — resolve
    // names live from the guild, best-effort. Falls back to the bare ID if Discord is unreachable.
    let roleNames = {};
    if (roleRows.length > 0 && process.env.DISCORD_GUILD_ID && process.env.DISCORD_BOT_TOKEN) {
      try {
        const rolesRes = await fetch(`https://discord.com/api/guilds/${process.env.DISCORD_GUILD_ID}/roles`, {
          headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
        });
        if (rolesRes.ok) {
          const roles = await rolesRes.json();
          roleNames = Object.fromEntries(roles.map(r => [r.id, r.name]));
        }
      } catch (e) { /* Discord unreachable — fall back to raw IDs below */ }
    }

    const result = cats.map(c => ({
      id: c.id,
      name: c.name,
      discord_roles: roleRows.filter(r => r.category_id === c.id).map(r => ({
        role_id: r.discord_role_id,
        role_name: roleNames[r.discord_role_id] || null,
        access_type: r.access_type,
      })),
      custom_users: userRows.filter(u => u.category_id === c.id).map(u => ({
        id: u.id,
        display_name: u.display_name || u.username,
        access_type: u.access_type,
      })),
    })).filter(c => c.discord_roles.length > 0 || c.custom_users.length > 0);

    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
