const express = require('express');
const db = require('../db');
const { requireAuth } = require('../lib/auth');
const { userCanViewVideo } = require('../lib/access');

const router = express.Router();

// Star ratings are collected on the end-of-video screen. Viewers only ever see their own rating;
// aggregates and per-user lists are exposed solely through the editor analytics endpoint.
router.get('/api/videos/:id/rating', requireAuth, (req, res) => {
  const row = db.prepare('SELECT rating FROM video_ratings WHERE user_id = ? AND video_id = ?').get(req.session.user.id, req.params.id);
  res.json({ rating: row?.rating || 0 });
});

router.put('/api/videos/:id/rating', requireAuth, (req, res) => {
  try {
    const user = req.session.user;
    const rating = parseInt(req.body.rating, 10);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: 'Ocena musi być liczbą od 1 do 5.' });
    const video = db.prepare('SELECT id, category_id, access_mode, publish_date, is_hidden FROM videos WHERE id = ?').get(req.params.id);
    if (!video) return res.status(404).json({ error: 'Nie znaleziono filmu.' });
    if (!userCanViewVideo(video, user).ok) return res.status(403).json({ error: 'Brak dostępu do tego filmu.' });
    db.prepare(`INSERT INTO video_ratings (user_id, video_id, rating) VALUES (?, ?, ?)
      ON CONFLICT(user_id, video_id) DO UPDATE SET rating = excluded.rating, updated_at = datetime('now')`).run(user.id, video.id, rating);
    res.json({ rating });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
