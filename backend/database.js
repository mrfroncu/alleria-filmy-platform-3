const Database = require('better-sqlite3');
const path = require('path');
const { runMigrations } = require('./migrations');

// DB_PATH env override is used by the API test suite (tests/) to point at a throwaway database
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'alleria.db');

function initDB() {
  const fs = require('fs');
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Schema lives in numbered migrations (backend/migrations/) — see migrations/index.js.
  runMigrations(db, { dbPath: DB_PATH, isTest: process.env.NODE_ENV === 'test' });

  return db;
}

module.exports = { initDB, DB_PATH };
