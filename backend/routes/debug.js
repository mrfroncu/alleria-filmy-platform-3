const path = require('path');
const fs = require('fs');
const express = require('express');
const fetch = require('node-fetch');
const db = require('../db');
const { DB_PATH } = require('../database');
const { getMigrationStatus, backupDatabase, pad } = require('../migrations');
const { audit } = require('../lib/helpers');
const { checkCatAccess, getUserRankIds, parseCatModes } = require('../lib/access');
const { requireDev } = require('../lib/auth');

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

    res.write('{');
    tables.forEach((name, ti) => {
      if (ti > 0) res.write(',');
      res.write(JSON.stringify(name) + ':[');
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

router.post('/api/debug/import', requireDev, express.json({ limit: '50mb' }), (req, res) => {
  try {
    const data = req.body;
    // Disable FK checks outside the transaction (SQLite does not allow PRAGMA inside a transaction)
    db.prepare('PRAGMA foreign_keys = OFF').run();
    try {
      const transaction = db.transaction(() => {
        const tables = db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        ).all().map(r => r.name).filter(n => !EXPORT_SKIP_TABLES.has(n));

        // Clear all tables
        for (const name of tables) {
          db.prepare(`DELETE FROM "${name}"`).run();
        }

        // Re-insert rows using column names taken from the data itself
        for (const [tableName, rows] of Object.entries(data)) {
          if (EXPORT_SKIP_TABLES.has(tableName)) continue;
          if (!Array.isArray(rows) || rows.length === 0) continue;
          const cols = Object.keys(rows[0]);
          const colList = cols.map(c => `"${c}"`).join(', ');
          const placeholders = cols.map(() => '?').join(', ');
          const stmt = db.prepare(`INSERT OR IGNORE INTO "${tableName}" (${colList}) VALUES (${placeholders})`);
          for (const row of rows) {
            stmt.run(cols.map(c => row[c]));
          }
        }
      });
      transaction();
    } finally {
      db.prepare('PRAGMA foreign_keys = ON').run();
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ error: 'Import failed: ' + err.message });
  }
});

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
