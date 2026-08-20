const Database = require('better-sqlite3');
const path = require('path');

// DB_PATH env override is used by the API test suite (tests/) to point at a throwaway database
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'alleria.db');

function initDB() {
  const fs = require('fs');
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id TEXT UNIQUE,
      username TEXT NOT NULL,
      display_name TEXT,
      avatar TEXT,
      role TEXT DEFAULT 'member',
      auth_method TEXT DEFAULT 'discord',
      ts_ip TEXT,
      ts_uid TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      last_login TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author_id INTEGER NOT NULL,
      main_source TEXT NOT NULL,
      main_source_type TEXT DEFAULT 'youtube',
      main_source_title TEXT,
      thumbnail TEXT,
      custom_thumbnail INTEGER DEFAULT 0,
      mirror1_name TEXT,
      mirror1_url TEXT,
      mirror1_is_embed INTEGER DEFAULT 0,
      mirror2_name TEXT,
      mirror2_url TEXT,
      mirror2_is_embed INTEGER DEFAULT 0,
      description TEXT,
      publish_date TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (author_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS video_tags (
      video_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (video_id, tag_id),
      FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS watch_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      video_id INTEGER NOT NULL,
      watched_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS login_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT,
      auth_method TEXT,
      ip_address TEXT,
      success INTEGER DEFAULT 1,
      reason TEXT,
      logged_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expired TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS favorites (
      user_id INTEGER NOT NULL,
      video_id INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, video_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT DEFAULT '',
      icon TEXT DEFAULT 'Film',
      sort_order INTEGER DEFAULT 0,
      parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS category_access (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      discord_role_id TEXT NOT NULL,
      access_type TEXT NOT NULL DEFAULT 'viewer',
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
      UNIQUE(category_id, discord_role_id, access_type)
    );

    CREATE TABLE IF NOT EXISTS video_access (
      video_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      PRIMARY KEY (video_id, user_id),
      FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      parent_id INTEGER REFERENCES comments(id) ON DELETE SET NULL,
      content TEXT NOT NULL,
      edited INTEGER DEFAULT 0,
      edit_history TEXT DEFAULT '[]',
      deleted INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Migrations
  try { db.exec(`ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ''`); } catch (e) {}
  try { db.exec(`ALTER TABLE videos ADD COLUMN stream_video_id TEXT`); } catch (e) {}
  try { db.exec(`ALTER TABLE videos ADD COLUMN drm_enhanced INTEGER DEFAULT 0`); } catch (e) {}
  try { db.exec(`ALTER TABLE videos ADD COLUMN stream_status TEXT DEFAULT 'ready'`); } catch (e) {}
  try { db.exec(`ALTER TABLE videos ADD COLUMN category_id INTEGER REFERENCES categories(id)`); } catch (e) {}
  try { db.exec(`ALTER TABLE videos ADD COLUMN access_mode TEXT DEFAULT 'category'`); } catch (e) {}
  try { db.exec(`ALTER TABLE videos ADD COLUMN webhook_sent INTEGER`); } catch (e) {}
  try { db.exec(`ALTER TABLE categories ADD COLUMN parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL`); } catch (e) {}
  try { db.exec(`ALTER TABLE categories ADD COLUMN webhook_url TEXT DEFAULT ''`); } catch (e) {}
  try { db.exec(`ALTER TABLE categories ADD COLUMN webhook_template TEXT DEFAULT ''`); } catch (e) {}
  try { db.exec(`ALTER TABLE users ADD COLUMN discord_roles TEXT DEFAULT '[]'`); } catch (e) {}
  try { db.exec(`ALTER TABLE videos ADD COLUMN published INTEGER DEFAULT 1`); } catch (e) {}
  try { db.exec(`ALTER TABLE comments ADD COLUMN parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE`); } catch (e) {}
  try { db.exec(`ALTER TABLE comments ADD COLUMN edited INTEGER DEFAULT 0`); } catch (e) {}
  try { db.exec(`ALTER TABLE comments ADD COLUMN edit_history TEXT DEFAULT '[]'`); } catch (e) {}

  try { db.exec(`ALTER TABLE comments ADD COLUMN deleted INTEGER DEFAULT 0`); } catch (e) {}
  try { db.exec(`ALTER TABLE videos ADD COLUMN mirror1_type TEXT DEFAULT 'link'`); } catch (e) {}
  try { db.exec(`ALTER TABLE videos ADD COLUMN mirror2_type TEXT DEFAULT 'link'`); } catch (e) {}
  try { db.exec(`ALTER TABLE categories ADD COLUMN access_mode TEXT DEFAULT 'roles'`); } catch (e) {}
  db.exec(`CREATE TABLE IF NOT EXISTS category_user_access (
    category_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    PRIMARY KEY (category_id, user_id),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  // Add access_type to category_user_access to support editors in custom mode
  try { db.exec(`ALTER TABLE category_user_access ADD COLUMN access_type TEXT DEFAULT 'viewer'`); } catch (e) {}

  // Migrate legacy access_mode values to new compound format: viewer_mode:editor_mode
  // 'roles' → 'roles:roles', 'custom' → 'custom:none', NULL/empty → 'public:none'
  try { db.exec(`UPDATE categories SET access_mode = 'roles:roles' WHERE access_mode = 'roles'`); } catch (e) {}
  try { db.exec(`UPDATE categories SET access_mode = 'custom:none' WHERE access_mode = 'custom'`); } catch (e) {}
  try { db.exec(`UPDATE categories SET access_mode = 'public:none' WHERE access_mode IS NULL OR access_mode = ''`); } catch (e) {}

  // Migrate: is_embed=1 → type='embed'
  try { db.exec(`UPDATE videos SET mirror1_type='embed' WHERE mirror1_is_embed=1 AND mirror1_type='link'`); } catch (e) {}
  try { db.exec(`UPDATE videos SET mirror2_type='embed' WHERE mirror2_is_embed=1 AND mirror2_type='link'`); } catch (e) {}

  // Mirrors 3–5
  try { db.exec(`ALTER TABLE videos ADD COLUMN mirror3_name TEXT`); } catch (e) {}
  try { db.exec(`ALTER TABLE videos ADD COLUMN mirror3_url TEXT`); } catch (e) {}
  try { db.exec(`ALTER TABLE videos ADD COLUMN mirror3_type TEXT DEFAULT 'link'`); } catch (e) {}
  try { db.exec(`ALTER TABLE videos ADD COLUMN mirror4_name TEXT`); } catch (e) {}
  try { db.exec(`ALTER TABLE videos ADD COLUMN mirror4_url TEXT`); } catch (e) {}
  try { db.exec(`ALTER TABLE videos ADD COLUMN mirror4_type TEXT DEFAULT 'link'`); } catch (e) {}
  try { db.exec(`ALTER TABLE videos ADD COLUMN mirror5_name TEXT`); } catch (e) {}
  try { db.exec(`ALTER TABLE videos ADD COLUMN mirror5_url TEXT`); } catch (e) {}
  try { db.exec(`ALTER TABLE videos ADD COLUMN mirror5_type TEXT DEFAULT 'link'`); } catch (e) {}

  // Discord avatar source (global vs. per-server/Nitro)
  try { db.exec(`ALTER TABLE users ADD COLUMN discord_avatar_hash TEXT`); } catch (e) {}
  try { db.exec(`ALTER TABLE users ADD COLUMN discord_guild_avatar_hash TEXT`); } catch (e) {}
  try { db.exec(`ALTER TABLE users ADD COLUMN avatar_source TEXT DEFAULT 'global'`); } catch (e) {}

  // Audit logs
  db.exec(`CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id INTEGER,
    details TEXT DEFAULT '',
    created_at DATETIME DEFAULT (datetime('now'))
  )`);

  // Watch Party logs
  db.exec(`CREATE TABLE IF NOT EXISTS watch_party_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at DATETIME DEFAULT (datetime('now')),
    party_code TEXT NOT NULL,
    action TEXT NOT NULL,
    user_id INTEGER,
    user_name TEXT,
    target_user_id INTEGER,
    target_user_name TEXT,
    details TEXT DEFAULT ''
  )`);

  // Watch progress (Continue Watching)
  db.exec(`CREATE TABLE IF NOT EXISTS watch_progress (
    user_id INTEGER NOT NULL,
    video_id INTEGER NOT NULL,
    position REAL NOT NULL DEFAULT 0,
    duration REAL NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, video_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
  )`);

  // Application settings (key/value store for runtime-configurable options)
  db.exec(`CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  // App ranks (application-level ranks, independent of Discord roles)
  db.exec(`CREATE TABLE IF NOT EXISTS app_ranks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT DEFAULT '',
    color TEXT DEFAULT '#6366f1',
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // User rank assignments
  db.exec(`CREATE TABLE IF NOT EXISTS user_rank_assignments (
    user_id INTEGER NOT NULL,
    rank_id INTEGER NOT NULL,
    assigned_by INTEGER,
    assigned_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, rank_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (rank_id) REFERENCES app_ranks(id) ON DELETE CASCADE
  )`);

  // Category rank-based access (per-category editor/viewer access via app ranks)
  db.exec(`CREATE TABLE IF NOT EXISTS category_rank_access (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    rank_id INTEGER NOT NULL,
    access_type TEXT NOT NULL DEFAULT 'viewer',
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
    FOREIGN KEY (rank_id) REFERENCES app_ranks(id) ON DELETE CASCADE,
    UNIQUE(category_id, rank_id, access_type)
  )`);

  // TS3 and TS6 are different servers with independent identities — a user can have BOTH
  // a TS3 account and a completely separate TS6 account linked at once, so each needs its
  // own uid/ip pair instead of sharing the single generic ts_uid/ts_ip columns.
  try { db.exec(`ALTER TABLE users ADD COLUMN ts3_uid TEXT`); } catch (e) {}
  try { db.exec(`ALTER TABLE users ADD COLUMN ts3_ip TEXT`); } catch (e) {}
  try { db.exec(`ALTER TABLE users ADD COLUMN ts6_uid TEXT`); } catch (e) {}
  try { db.exec(`ALTER TABLE users ADD COLUMN ts6_ip TEXT`); } catch (e) {}
  try {
    db.exec(`UPDATE users SET ts3_uid = ts_uid, ts3_ip = ts_ip WHERE auth_method = 'teamspeak3' AND ts_uid IS NOT NULL AND ts3_uid IS NULL`);
  } catch (e) {}
  try {
    db.exec(`UPDATE users SET ts6_uid = ts_uid, ts6_ip = ts_ip WHERE auth_method = 'teamspeak' AND ts_uid IS NOT NULL AND ts6_uid IS NULL`);
  } catch (e) {}
  try { db.exec(`DROP INDEX IF EXISTS idx_users_ts_uid`); } catch (e) {}
  try { db.exec(`ALTER TABLE users DROP COLUMN ts_uid`); } catch (e) {}
  try { db.exec(`ALTER TABLE users DROP COLUMN ts_ip`); } catch (e) {}
  try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_ts3_uid ON users(ts3_uid) WHERE ts3_uid IS NOT NULL`); } catch (e) {}
  try { db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_ts6_uid ON users(ts6_uid) WHERE ts6_uid IS NOT NULL`); } catch (e) {}

  // Discord email — only populated once the OAuth flow requests the `email` scope; existing
  // sessions/accounts backfill it on their next Discord login (Discord doesn't retroactively
  // grant new scopes), so this stays nullable indefinitely.
  try { db.exec(`ALTER TABLE users ADD COLUMN discord_email TEXT`); } catch (e) {}

  // GDPR/RODO — anonymization state on the existing users row. Deletion never removes the row
  // (comments/videos reference it) — it blanks PII and keeps the original name around for admins.
  try { db.exec(`ALTER TABLE users ADD COLUMN is_anonymized INTEGER DEFAULT 0`); } catch (e) {}
  try { db.exec(`ALTER TABLE users ADD COLUMN anonymized_original_username TEXT`); } catch (e) {}
  try { db.exec(`ALTER TABLE users ADD COLUMN anonymized_original_display_name TEXT`); } catch (e) {}
  try { db.exec(`ALTER TABLE users ADD COLUMN anonymized_at TEXT`); } catch (e) {}

  db.exec(`CREATE TABLE IF NOT EXISTS gdpr_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    requested_at TEXT DEFAULT (datetime('now')),
    due_at TEXT NOT NULL,
    export_file TEXT,
    admin_note TEXT DEFAULT '',
    processed_by INTEGER,
    processed_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  // Separate, optional step on top of anonymizeUser() — a dev can additionally wipe the user's
  // activity/log rows outright instead of just anonymizing the users row.
  try { db.exec(`ALTER TABLE gdpr_requests ADD COLUMN activity_purged_at TEXT`); } catch (e) {}

  // Regulamin (terms of service) acceptance — content itself lives in app_settings
  // (tos_content/tos_updated_at); this just tracks when THIS user last agreed to it.
  try { db.exec(`ALTER TABLE users ADD COLUMN tos_accepted_at TEXT`); } catch (e) {}

  // Category notification toggles — webhook_enabled defaults to whether a URL was already
  // configured, so upgrading never silently stops a webhook that was already firing.
  try { db.exec(`ALTER TABLE categories ADD COLUMN webhook_enabled INTEGER DEFAULT 0`); } catch (e) {}
  try {
    db.exec(`UPDATE categories SET webhook_enabled = 1 WHERE webhook_url IS NOT NULL AND webhook_url != ''`);
  } catch (e) {}
  try { db.exec(`ALTER TABLE categories ADD COLUMN email_enabled INTEGER DEFAULT 0`); } catch (e) {}
  try { db.exec(`ALTER TABLE categories ADD COLUMN email_template TEXT DEFAULT ''`); } catch (e) {}

  // Account contact email — separate from discord_email (the raw OAuth capture); this is the
  // effective address used for notifications/GDPR/admin display, editable regardless of login method.
  try { db.exec(`ALTER TABLE users ADD COLUMN email TEXT`); } catch (e) {}
  try { db.exec(`ALTER TABLE users ADD COLUMN email_notifications INTEGER DEFAULT 0`); } catch (e) {}

  // Browser push notifications — category toggle mirrors webhook_enabled/email_enabled above.
  // Subscriptions live per-device (a user can have one per browser/device they enabled it on).
  try { db.exec(`ALTER TABLE categories ADD COLUMN push_enabled INTEGER DEFAULT 0`); } catch (e) {}
  db.exec(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  // Star ratings were dropped in favor of favorites/likes being the single "I like this" signal —
  // clean up the table on any dev DB that already created it.
  try { db.exec(`DROP TABLE IF EXISTS video_ratings`); } catch (e) {}

  // Comment reactions — a user can react to the same comment with several different emoji
  // (each is its own toggle), but only once per emoji.
  db.exec(`CREATE TABLE IF NOT EXISTS comment_reactions (
    comment_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    emoji TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (comment_id, user_id, emoji),
    FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  // Comment moderation reports. comment_id is a loose reference (like audit_logs.entity_id) —
  // NOT a foreign key — so a resolved report survives even if its comment is later hard-deleted,
  // keeping the moderation trail intact instead of cascading away or blocking the delete.
  db.exec(`CREATE TABLE IF NOT EXISTS comment_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comment_id INTEGER NOT NULL,
    reporter_user_id INTEGER NOT NULL,
    reason TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    resolved_by INTEGER,
    resolved_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (reporter_user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  // In-app notification center. Delivered live over /ws/notifications when the recipient is
  // connected (see backend/notifications.js); this table is the source of truth either way —
  // the bell's initial state and unread count always come from here, not from WS memory.
  db.exec(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT DEFAULT '',
    url TEXT DEFAULT '',
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at)`);

  // Sampled player events — SecurePlayer's real play/pause/seek DOM events for self-hosted, and
  // a polling-inferred equivalent for YouTube (see YT_SEEK_JUMP_THRESHOLD_S in VideoPage.jsx) —
  // powering the per-video analytics heatmap. from_position is only set for 'seek' rows — it's
  // what makes a rewind ("landed before where they were") distinguishable from a skip forward.
  db.exec(`CREATE TABLE IF NOT EXISTS video_playback_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    position REAL NOT NULL,
    from_position REAL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_playback_events_video ON video_playback_events(video_id, event_type)`);

  // 'solo' (normal playback) vs 'watch_party' — lets the analytics page split the two apart
  // instead of silently blending a shared watch-party session into one viewer's solo stats.
  try { db.exec(`ALTER TABLE video_playback_events ADD COLUMN context TEXT DEFAULT 'solo'`); } catch (e) {}
  try { db.exec(`ALTER TABLE watch_logs ADD COLUMN context TEXT DEFAULT 'solo'`); } catch (e) {}

  // Explicit "watched" mark — separate from watch_progress (which only tracks *resume* position
  // and gets deleted once a video is finished, see the 90%-completion handler in VideoPage.jsx).
  // A row here means "watched", full stop; auto-inserted at 90% completion or toggled manually,
  // and survives independently of whatever happens to the resume position afterwards.
  db.exec(`CREATE TABLE IF NOT EXISTS video_watched (
    user_id INTEGER NOT NULL,
    video_id INTEGER NOT NULL,
    watched_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, video_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
  )`);

  // Shorts — reworked from a per-video flag into a per-category one: a category marked as a
  // Shorts category plays its videos back-to-back in the sequential Shorts player instead of
  // opening the normal video page. Videos themselves carry no is_short flag anymore — any
  // format works (vertical or horizontal), it's purely about which category a video sits in.
  try { db.exec(`ALTER TABLE videos DROP COLUMN is_short`); } catch (e) {}
  try { db.exec(`ALTER TABLE categories ADD COLUMN is_shorts_category INTEGER DEFAULT 0`); } catch (e) {}

  // Marks a mirror as an "alternative version" of the movie (e.g. different cut, behind the
  // scenes) — purely a display flag, the viewer renders these tabs in a distinct color.
  try { db.exec(`ALTER TABLE videos ADD COLUMN mirror1_is_alt INTEGER DEFAULT 0`); } catch (e) {}
  try { db.exec(`ALTER TABLE videos ADD COLUMN mirror2_is_alt INTEGER DEFAULT 0`); } catch (e) {}
  try { db.exec(`ALTER TABLE videos ADD COLUMN mirror3_is_alt INTEGER DEFAULT 0`); } catch (e) {}
  try { db.exec(`ALTER TABLE videos ADD COLUMN mirror4_is_alt INTEGER DEFAULT 0`); } catch (e) {}
  try { db.exec(`ALTER TABLE videos ADD COLUMN mirror5_is_alt INTEGER DEFAULT 0`); } catch (e) {}

  // Custom uploaded avatar — an alternative to the Discord global/guild avatar_source values.
  try { db.exec(`ALTER TABLE users ADD COLUMN custom_avatar TEXT`); } catch (e) {}

  return db;
}

module.exports = { initDB, DB_PATH };
