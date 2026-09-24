const express = require('express');
const db = require('../db');
const { requireAuth } = require('../lib/auth');
const { userCanViewVideo } = require('../lib/access');

const router = express.Router();

// ============ FAVORITES API ============
router.get('/api/favorites', requireAuth, (req, res) => {
  try {
    const user = req.session.user;
    const favs = db.prepare(`
      SELECT v.*, u.username AS author_name, u.display_name AS author_display_name,
      GROUP_CONCAT(DISTINCT t.name) AS tag_names, GROUP_CONCAT(DISTINCT t.id) AS tag_ids,
      f.created_at AS favorited_at
      FROM favorites f
      JOIN videos v ON f.video_id = v.id
      LEFT JOIN users u ON v.author_id = u.id
      LEFT JOIN video_tags vt ON v.id = vt.video_id
      LEFT JOIN tags t ON vt.tag_id = t.id
      WHERE f.user_id = ?
      GROUP BY v.id
      ORDER BY f.created_at DESC
    `).all(user.id);
    // Same rationale as /api/progress: a favorite can outlive access to its video.
    res.json(favs.filter(v => userCanViewVideo(v, user).ok).map(v => ({
      ...v,
      tags: v.tag_names ? v.tag_names.split(',').map((name, i) => ({ id: parseInt(v.tag_ids.split(',')[i]), name })) : []
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/favorites/:videoId', requireAuth, (req, res) => {
  try {
    const user = req.session.user;
    const video = db.prepare('SELECT id, category_id, access_mode, publish_date FROM videos WHERE id = ?').get(req.params.videoId);
    if (!video) return res.status(404).json({ error: 'Video not found' });
    if (!userCanViewVideo(video, user).ok) return res.status(403).json({ error: 'Brak dostępu do tego filmu.' });
    db.prepare('INSERT OR IGNORE INTO favorites (user_id, video_id) VALUES (?, ?)').run(user.id, req.params.videoId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/api/favorites/:videoId', requireAuth, (req, res) => {
  try {
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND video_id = ?').run(req.session.user.id, req.params.videoId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/api/favorites/check/:videoId', requireAuth, (req, res) => {
  const fav = db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND video_id = ?').get(req.session.user.id, req.params.videoId);
  const count = db.prepare('SELECT COUNT(*) AS c FROM favorites WHERE video_id = ?').get(req.params.videoId);
  res.json({ isFavorite: !!fav, count: count?.c || 0 });
});

module.exports = router;
