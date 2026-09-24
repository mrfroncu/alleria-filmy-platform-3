const express = require('express');
const db = require('../db');
const { requireAuth } = require('../lib/auth');
const { userCanViewVideo } = require('../lib/access');

const router = express.Router();

// ============ WATCH PROGRESS ============
router.put('/api/progress/:videoId', requireAuth, (req, res) => {
  const user = req.session.user;
  const videoId = parseInt(req.params.videoId);
  const { position, duration } = req.body;
  if (isNaN(videoId) || position === undefined) return res.status(400).json({ error: 'Missing params' });
  try {
    const video = db.prepare('SELECT id, category_id, access_mode, publish_date FROM videos WHERE id = ?').get(videoId);
    if (!video) return res.status(404).json({ error: 'Video not found' });
    if (!userCanViewVideo(video, user).ok) return res.status(403).json({ error: 'Brak dostępu do tego filmu.' });
    db.prepare(`
      INSERT INTO watch_progress (user_id, video_id, position, duration, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, video_id) DO UPDATE SET
        position = excluded.position,
        duration = excluded.duration,
        updated_at = excluded.updated_at
    `).run(user.id, videoId, parseFloat(position), parseFloat(duration) || 0);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/progress', requireAuth, (req, res) => {
  const user = req.session.user;
  try {
    const rows = db.prepare(`
      SELECT wp.video_id, wp.position, wp.duration, wp.updated_at,
             v.title, v.thumbnail, v.main_source_type, v.stream_video_id, v.stream_status,
             v.category_id, v.access_mode, v.publish_date, c.name AS category_name, c.slug AS category_slug
      FROM watch_progress wp
      JOIN videos v ON wp.video_id = v.id
      LEFT JOIN categories c ON v.category_id = c.id
      WHERE wp.user_id = ? AND wp.duration > 0
        AND wp.position > wp.duration * 0.05
        AND wp.position < wp.duration * 0.90
      ORDER BY wp.updated_at DESC
      LIMIT 20
    `).all(user.id);
    // A progress row can outlive the user's access to its video (rank revoked, category
    // access changed) — never trust wp.* alone to expose video metadata like stream_video_id.
    const visible = rows
      .filter(r => userCanViewVideo({ id: r.video_id, category_id: r.category_id, access_mode: r.access_mode, publish_date: r.publish_date }, user).ok)
      .map(({ category_id, access_mode, publish_date, ...rest }) => rest);
    res.json(visible);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/api/progress', requireAuth, (req, res) => {
  const user = req.session.user;
  try {
    const info = db.prepare('DELETE FROM watch_progress WHERE user_id = ?').run(user.id);
    res.json({ success: true, deleted: info.changes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/api/progress/:videoId', requireAuth, (req, res) => {
  const user = req.session.user;
  try {
    db.prepare('DELETE FROM watch_progress WHERE user_id = ? AND video_id = ?').run(user.id, parseInt(req.params.videoId));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/progress/:videoId', requireAuth, (req, res) => {
  const user = req.session.user;
  try {
    const row = db.prepare('SELECT * FROM watch_progress WHERE user_id = ? AND video_id = ?')
      .get(user.id, parseInt(req.params.videoId));
    res.json(row || null);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ WATCHED MARKS ============
// Deliberately separate from watch_progress — see the video_watched table comment in database.js.
router.post('/api/videos/:id/watched', requireAuth, (req, res) => {
  const user = req.session.user;
  try {
    db.prepare(`
      INSERT INTO video_watched (user_id, video_id, watched_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(user_id, video_id) DO UPDATE SET watched_at = excluded.watched_at
    `).run(user.id, parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/api/videos/:id/watched', requireAuth, (req, res) => {
  const user = req.session.user;
  try {
    db.prepare('DELETE FROM video_watched WHERE user_id = ? AND video_id = ?').run(user.id, parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/watched', requireAuth, (req, res) => {
  try {
    const rows = db.prepare('SELECT video_id, watched_at FROM video_watched WHERE user_id = ?').all(req.session.user.id);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/api/watched', requireAuth, (req, res) => {
  const user = req.session.user;
  try {
    const info = db.prepare('DELETE FROM video_watched WHERE user_id = ?').run(user.id);
    res.json({ success: true, deleted: info.changes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
