const express = require('express');
const db = require('../db');
const { getSetting } = require('../lib/settings');
const { requireAdmin, requireDev } = require('../lib/auth');

const router = express.Router();

// ============ LOGS API ============
router.get('/api/logs/watch', requireAdmin, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const perPage = parseInt(getSetting('logs_per_page', '50'), 10) || 50;
  const offset = (page - 1) * perPage;
  const userId = parseInt(req.query.user_id) || null;
  const videoId = parseInt(req.query.video_id) || null;

  let where = '1=1';
  const params = [];
  if (userId) { where += ' AND wl.user_id = ?'; params.push(userId); }
  if (videoId) { where += ' AND wl.video_id = ?'; params.push(videoId); }

  const total = db.prepare(`SELECT COUNT(*) AS c FROM watch_logs wl WHERE ${where}`).get(...params).c;
  const logs = db.prepare(`
    SELECT wl.*, u.username, u.display_name AS user_display, v.title AS video_title
    FROM watch_logs wl
    LEFT JOIN users u ON wl.user_id = u.id
    LEFT JOIN videos v ON wl.video_id = v.id
    WHERE ${where}
    ORDER BY wl.watched_at DESC LIMIT ? OFFSET ?
  `).all(...params, perPage, offset);
  res.json({ logs, total, page, perPage, totalPages: Math.ceil(total / perPage) });
});

// Distinct videos that have at least one watch-log entry — used to populate the movie filter dropdown.
router.get('/api/logs/watch/videos', requireAdmin, (req, res) => {
  const videos = db.prepare(`
    SELECT DISTINCT v.id, v.title FROM watch_logs wl
    JOIN videos v ON wl.video_id = v.id
    ORDER BY v.title COLLATE NOCASE ASC
  `).all();
  res.json(videos);
});

router.get('/api/logs/login', requireAdmin, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const perPage = parseInt(getSetting('logs_per_page', '50'), 10) || 50;
  const offset = (page - 1) * perPage;
  const userId = parseInt(req.query.user_id) || null;

  let where = '1=1';
  const params = [];
  if (userId) { where += ' AND user_id = ?'; params.push(userId); }

  const total = db.prepare(`SELECT COUNT(*) AS c FROM login_logs WHERE ${where}`).get(...params).c;
  const logs = db.prepare(`SELECT * FROM login_logs WHERE ${where} ORDER BY logged_at DESC LIMIT ? OFFSET ?`).all(...params, perPage, offset);
  res.json({ logs, total, page, perPage, totalPages: Math.ceil(total / perPage) });
});

// ============ LOG CLEARING API ============
router.delete('/api/logs/watch/clear', requireAdmin, (req, res) => {
  try {
    const info = db.prepare('DELETE FROM watch_logs').run();
    res.json({ success: true, deleted: info.changes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/api/logs/login/clear', requireAdmin, (req, res) => {
  try {
    const info = db.prepare('DELETE FROM login_logs').run();
    res.json({ success: true, deleted: info.changes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Watch Party logs
router.get('/api/logs/watch-party', requireAdmin, (req, res) => {
  try {
    const perPage = parseInt(getSetting('logs_per_page', '50'), 10) || 50;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const code = (req.query.code || '').toUpperCase();
    const action = req.query.action || '';
    const userId = parseInt(req.query.user_id) || null;

    let where = '1=1';
    const params = [];
    if (code) { where += ' AND party_code = ?'; params.push(code); }
    if (action) { where += ' AND action = ?'; params.push(action); }
    if (userId) { where += ' AND (user_id = ? OR target_user_id = ?)'; params.push(userId, userId); }

    const total = db.prepare(`SELECT COUNT(*) AS c FROM watch_party_logs WHERE ${where}`).get(...params).c;
    const offset = (page - 1) * perPage;
    const logs = db.prepare(`SELECT * FROM watch_party_logs WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, perPage, offset);
    res.json({ logs, total, page, totalPages: Math.ceil(total / perPage) || 1 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/api/logs/watch-party/clear', requireAdmin, (req, res) => {
  try {
    const code = (req.query.code || '').toUpperCase();
    const info = code
      ? db.prepare('DELETE FROM watch_party_logs WHERE party_code = ?').run(code)
      : db.prepare('DELETE FROM watch_party_logs').run();
    res.json({ success: true, deleted: info.changes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ AUDIT LOGS ============
router.get('/api/audit-logs', requireDev, (req, res) => {
  const { page = 1, type, action, user_id } = req.query;
  const perPage = 50;
  const offset = (parseInt(page) - 1) * perPage;
  let where = '1=1';
  const params = [];
  if (type) { where += ' AND a.entity_type = ?'; params.push(type); }
  if (action) { where += ' AND a.action = ?'; params.push(action); }
  if (user_id) { where += ' AND a.user_id = ?'; params.push(parseInt(user_id)); }
  const total = db.prepare(`SELECT COUNT(*) AS c FROM audit_logs a WHERE ${where}`).get(...params).c;
  const logs = db.prepare(`SELECT a.*, u.display_name, u.username FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id WHERE ${where} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`).all(...params, perPage, offset);
  res.json({ logs, total, page: parseInt(page), totalPages: Math.ceil(total / perPage) });
});

router.delete('/api/audit-logs/clear', requireDev, (req, res) => {
  try {
    const info = db.prepare('DELETE FROM audit_logs').run();
    res.json({ success: true, deleted: info.changes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
