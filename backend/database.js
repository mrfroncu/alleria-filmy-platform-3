const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'alleria.db');

function initDB() {
  const fs = require('fs');
  const dir = path.join(__dirname, 'data');
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

  return db;
}

module.exports = { initDB, DB_PATH };
