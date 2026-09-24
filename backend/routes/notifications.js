const express = require('express');
const db = require('../db');
const { createWsToken: createNotificationsWsToken } = require('../notifications');
const { requireAuth } = require('../lib/auth');

const router = express.Router();

// ============ IN-APP NOTIFICATIONS ============
router.get('/api/notifications/token', requireAuth, (req, res) => {
  const token = createNotificationsWsToken(req.session.user);
  res.json({ token });
});

router.get('/api/notifications', requireAuth, (req, res) => {
  try {
    const before = parseInt(req.query.before, 10);
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    let where = 'user_id = ?';
    const params = [req.session.user.id];
    if (Number.isInteger(before)) { where += ' AND id < ?'; params.push(before); }
    const notifications = db.prepare(`SELECT * FROM notifications WHERE ${where} ORDER BY id DESC LIMIT ?`).all(...params, limit);
    const unreadCount = db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read = 0').get(req.session.user.id).c;
    res.json({ notifications, unreadCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/notifications/:id/read', requireAuth, (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.session.user.id);
  res.json({ success: true });
});

router.post('/api/notifications/read-all', requireAuth, (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0').run(req.session.user.id);
  res.json({ success: true });
});

module.exports = router;
