// Delivery log for "new video" announcements: one row per channel per attempt (automatic at
// publication, or a manual resend from the publication panel), with the actual outcome — e.g.
// Discord's HTTP status — instead of only the single videos.webhook_sent "was attempted" flag.
module.exports = {
  version: 7,
  name: 'notification_log',
  description: 'Dziennik wysyłki powiadomień o nowym filmie (webhook, e-mail, push, dzwonek) - video_notification_log',
  up(db) {
    db.exec(`
      CREATE TABLE video_notification_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
        channel TEXT NOT NULL,
        status TEXT NOT NULL,
        trigger TEXT NOT NULL,
        detail TEXT DEFAULT '',
        recipients INTEGER,
        delivered INTEGER,
        user_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX idx_video_notification_log_video ON video_notification_log(video_id, created_at);
    `);
  },
};
