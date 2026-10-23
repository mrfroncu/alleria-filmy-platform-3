// Which source (main / mirrorN) each playback event came from, plus one row per stretch of viewing
// on one source (watch time, positions, which page visit it belongs to). Lets analytics keep
// alternative versions (mirrorN_is_alt) apart from the film itself, show which mirrors people
// actually use, and when a viewer switched from one to another. Rows from before this migration
// have source_key NULL / is_alt 0 and count towards the film itself.
module.exports = {
  version: 10,
  name: 'playback_sources',
  description: 'Źródło (main/mirror) przy zdarzeniach odtwarzania + sesje oglądania per źródło (video_source_sessions)',
  up(db) {
    db.exec(`
      ALTER TABLE video_playback_events ADD COLUMN source_key TEXT;
      ALTER TABLE video_playback_events ADD COLUMN is_alt INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX IF NOT EXISTS idx_playback_events_video_source ON video_playback_events(video_id, is_alt, source_key);

      CREATE TABLE IF NOT EXISTS video_source_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL UNIQUE,
        view_id TEXT NOT NULL,
        video_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        source_key TEXT NOT NULL,
        source_label TEXT,
        is_alt INTEGER NOT NULL DEFAULT 0,
        context TEXT NOT NULL DEFAULT 'solo',
        start_position REAL,
        end_position REAL,
        max_position REAL,
        duration REAL,
        watched_seconds REAL NOT NULL DEFAULT 0,
        started_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_source_sessions_video ON video_source_sessions(video_id, started_at);
      CREATE INDEX IF NOT EXISTS idx_source_sessions_user ON video_source_sessions(user_id);
    `);
  },
};
