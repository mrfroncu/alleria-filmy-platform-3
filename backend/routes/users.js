const express = require('express');
const db = require('../db');
const { audit } = require('../lib/helpers');
const { requireAdmin, requireAuth, requireDev } = require('../lib/auth');

const router = express.Router();

// ============ USERS API ============
router.get('/api/users', requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, display_name, avatar, role, auth_method, created_at, last_login, discord_roles, email, discord_email FROM users ORDER BY created_at DESC').all();
  res.json(users);
});

router.delete('/api/users/:id', requireAdmin, (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    // Prevent deleting yourself
    if (userId === req.session.user.id) {
      return res.status(400).json({ error: 'Nie możesz usunąć własnego konta.' });
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'Użytkownik nie znaleziony.' });
    // Clear related data
    db.prepare('DELETE FROM favorites WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM watch_logs WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    console.log(`[ADMIN] User deleted: ${user.display_name} (ID: ${userId}) by ${req.session.user.display_name}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/users/all', requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, display_name, avatar, role FROM users ORDER BY display_name').all();
  res.json(users);
});

// Create user manually (dev only) — for adding authors who haven't logged in yet
router.post('/api/debug/create-user', requireDev, (req, res) => {
  try {
    const { username, display_name, role, discord_id, avatar } = req.body;
    if (!username || !display_name) {
      return res.status(400).json({ error: 'username and display_name are required' });
    }
    const validRole = ['member', 'admin', 'dev'].includes(role) ? role : 'member';
    const result = db.prepare(
      `INSERT INTO users (username, display_name, role, auth_method, discord_id, avatar) VALUES (?, ?, ?, 'manual', ?, ?)`
    ).run(username, display_name, validRole, discord_id || null, avatar || null);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    console.log(`[DEBUG] User created manually: ${display_name} (ID: ${user.id})`);
    res.json({ success: true, user });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============ IMPERSONATION (dev only) ============
// req.session.user is fully replaced with the target's identity — including role — so the
// impersonated session gets *exactly* what that user would see, permission-wise. That also
// means it loses dev-only route access for the duration, which is why "stop impersonating"
// can't live behind a dev-gated page — it has to be reachable from anywhere (see the Layout.jsx
// banner) — and why this checks session.impersonatorId rather than requireDev.
function buildSessionUser(u) {
  return {
    id: u.id,
    discord_id: u.discord_id,
    username: u.username,
    display_name: u.display_name,
    avatar: u.avatar,
    role: u.role,
    auth_method: u.auth_method,
    discord_roles: JSON.parse(u.discord_roles || '[]'),
  };
}

router.post('/api/debug/impersonate/:userId', requireDev, (req, res) => {
  try {
    if (req.session.impersonatorId) return res.status(400).json({ error: 'Już się kogoś podszywasz — najpierw wróć do swojego konta.' });
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.userId);
    if (!target) return res.status(404).json({ error: 'Nie znaleziono użytkownika.' });
    if (target.id === req.session.user.id) return res.status(400).json({ error: 'Nie możesz zalogować się na samego siebie.' });
    if (target.role === 'dev') return res.status(403).json({ error: 'Nie można zalogować się jako inny deweloper.' });

    audit(req.session.user.id, 'impersonate_start', 'user', target.id,
      `${req.session.user.display_name || req.session.user.username} zalogował się jako ${target.display_name || target.username}`);

    req.session.impersonatorId = req.session.user.id;
    req.session.user = buildSessionUser(target);
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: 'Session save error' });
      res.json({ success: true, user: req.session.user });
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/debug/stop-impersonating', requireAuth, (req, res) => {
  try {
    if (!req.session.impersonatorId) return res.status(400).json({ error: 'Nie jesteś w trybie podszywania.' });
    const original = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.impersonatorId);
    if (!original) return res.status(500).json({ error: 'Nie udało się odnaleźć oryginalnego konta.' });

    audit(original.id, 'impersonate_stop', 'user', req.session.user.id,
      `${original.display_name || original.username} wrócił z podszywania się pod ${req.session.user.display_name || req.session.user.username}`);

    req.session.user = buildSessionUser(original);
    delete req.session.impersonatorId;
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: 'Session save error' });
      res.json({ success: true, user: req.session.user });
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
