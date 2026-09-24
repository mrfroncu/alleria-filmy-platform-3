const express = require('express');
const db = require('../db');
const { getVapidKeys } = require('../lib/notify');
const { requireAuth } = require('../lib/auth');

const router = express.Router();

// ============ WEB PUSH SUBSCRIPTIONS ============
router.get('/api/push/vapid-public-key', requireAuth, (req, res) => {
  res.json({ publicKey: getVapidKeys().publicKey });
});

router.post('/api/push/subscribe', requireAuth, (req, res) => {
  try {
    const { endpoint, keys } = req.body?.subscription || req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) return res.status(400).json({ error: 'Nieprawidłowa subskrypcja push.' });
    db.prepare(`
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth
    `).run(req.session.user.id, endpoint, keys.p256dh, keys.auth);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/push/unsubscribe', requireAuth, (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'Brak endpoint.' });
    db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(endpoint, req.session.user.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
