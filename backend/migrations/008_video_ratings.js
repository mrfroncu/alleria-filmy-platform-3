// 1-5 star ratings collected on the end-of-video screen. Visible only to editors, in analytics.
module.exports = {
  version: 8,
  name: 'video_ratings',
  description: 'Oceny filmów 1-5 gwiazdek (video_ratings) - widoczne tylko w analityce',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS video_ratings (
        user_id INTEGER NOT NULL,
        video_id INTEGER NOT NULL,
        rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, video_id),
        FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_video_ratings_video ON video_ratings(video_id);
    `);
  },
};
