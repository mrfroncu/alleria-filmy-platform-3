// Indexes for the lookups the app does on every page view — until now only notifications and
// playback events had any, so e.g. every HLS segment request (resolveStreamVideoForUser, keyed on
// stream_video_id) and every video page's comment list was a full table scan.
module.exports = {
  version: 2,
  name: 'indexes',
  description: 'Indeksy dla najczęstszych zapytań (strumień, komentarze, logi, kategorie, tagi)',
  up(db) {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_videos_stream_video_id ON videos(stream_video_id);
      CREATE INDEX IF NOT EXISTS idx_videos_category ON videos(category_id);
      CREATE INDEX IF NOT EXISTS idx_videos_publish_date ON videos(publish_date);
      CREATE INDEX IF NOT EXISTS idx_video_tags_tag ON video_tags(tag_id);
      CREATE INDEX IF NOT EXISTS idx_comments_video ON comments(video_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);
      CREATE INDEX IF NOT EXISTS idx_comment_reports_status ON comment_reports(status);
      CREATE INDEX IF NOT EXISTS idx_favorites_video ON favorites(video_id);
      CREATE INDEX IF NOT EXISTS idx_watch_logs_video ON watch_logs(video_id, watched_at);
      CREATE INDEX IF NOT EXISTS idx_watch_logs_user ON watch_logs(user_id, watched_at);
      CREATE INDEX IF NOT EXISTS idx_playback_events_user ON video_playback_events(user_id);
      CREATE INDEX IF NOT EXISTS idx_login_logs_logged_at ON login_logs(logged_at);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
      CREATE INDEX IF NOT EXISTS idx_watch_party_logs_created ON watch_party_logs(created_at);
      CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
    `);
  },
};
