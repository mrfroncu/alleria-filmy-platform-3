const express = require('express');
const db = require('../db');
const { requireAuth } = require('../lib/auth');

const router = express.Router();

// ============ WATCH HISTORY (personal) ============
router.get('/api/history', requireAuth, (req, res) => {
  try {
    // No limit — full history for logged-in user
    const history = db.prepare(`
      SELECT wl.watched_at, v.id, v.title, v.thumbnail, v.publish_date,
      u.username AS author_name, u.display_name AS author_display_name
      FROM watch_logs wl
      JOIN videos v ON wl.video_id = v.id
      LEFT JOIN users u ON v.author_id = u.id
      WHERE wl.user_id = ?
      ORDER BY wl.watched_at DESC
    `).all(req.session.user.id);
    res.json(history);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ STATS API ============
router.get('/api/stats', requireAuth, (req, res) => {
  try {
    const totalVideos = db.prepare('SELECT COUNT(*) AS c FROM videos').get().c;
    const totalUsers = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    const totalViews = db.prepare('SELECT COUNT(*) AS c FROM watch_logs').get().c;
    const totalTags = db.prepare('SELECT COUNT(*) AS c FROM tags').get().c;
    const totalCategories = db.prepare('SELECT COUNT(*) AS c FROM categories').get().c;

    const mostWatched = db.prepare(`
      SELECT v.id, v.title, v.thumbnail, COUNT(wl.id) AS views, u.display_name AS author_display_name
      FROM watch_logs wl JOIN videos v ON wl.video_id = v.id LEFT JOIN users u ON v.author_id = u.id
      GROUP BY v.id ORDER BY views DESC LIMIT 10
    `).all();

    const topViewers = db.prepare(`
      SELECT u.id, u.display_name, u.avatar, COUNT(wl.id) AS total_views
      FROM watch_logs wl JOIN users u ON wl.user_id = u.id
      GROUP BY u.id ORDER BY total_views DESC LIMIT 10
    `).all();

    const recentActivity = db.prepare(`
      SELECT DATE(wl.watched_at) AS day, COUNT(*) AS views
      FROM watch_logs wl WHERE wl.watched_at >= datetime('now', '-30 days')
      GROUP BY day ORDER BY day ASC
    `).all();

    const tagCloud = db.prepare(`
      SELECT t.id, t.name, COUNT(vt.video_id) AS count
      FROM tags t JOIN video_tags vt ON t.id = vt.tag_id
      GROUP BY t.id ORDER BY count DESC LIMIT 20
    `).all();

    const topAuthors = db.prepare(`
      SELECT u.id, u.display_name, u.avatar, COUNT(v.id) AS video_count
      FROM users u JOIN videos v ON u.id = v.author_id
      GROUP BY u.id ORDER BY video_count DESC LIMIT 10
    `).all();

    const myStats = {
      views: db.prepare('SELECT COUNT(*) AS c FROM watch_logs WHERE user_id = ?').get(req.session.user.id).c,
      favorites: db.prepare('SELECT COUNT(*) AS c FROM favorites WHERE user_id = ?').get(req.session.user.id).c,
    };

    const isAdminUser = req.session.user.role === 'admin' || req.session.user.role === 'dev';
    res.json({ totalVideos, totalUsers, totalViews, totalTags, totalCategories, mostWatched, ...(isAdminUser ? { topViewers } : {}), recentActivity, tagCloud, topAuthors, myStats });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
