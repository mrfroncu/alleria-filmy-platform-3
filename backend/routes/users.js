const express = require('express');
const db = require('../db');
const { audit } = require('../lib/helpers');
const { requireAdmin, requireAuth, requireDev } = require('../lib/auth');
const { invalidateUserSessions } = require('../lib/sessions');
const { disconnectUser } = require('../notifications');
const { disconnectUserFromParties } = require('../watchParty');

const router = express.Router();

// ============ USERS API ============
router.get('/api/users', requireAdmin, (req, res) => {
  const users = db.prepare(`SELECT u.id, u.username, u.display_name, u.avatar, u.role, u.auth_method, u.created_at, u.last_login, u.discord_roles, u.email, u.discord_email,
      u.banned_at, COALESCE(b.display_name, b.username) AS banned_by_name
    FROM users u LEFT JOIN users b ON b.id = u.banned_by ORDER BY u.created_at DESC`).all();
  res.json(users);
});

// ============ BANS ============
// Deleting an account is no block — the next login just recreates it. A ban keeps the row and
// refuses every login method of that account (see the login routes and refreshSessionUser).
// Dev-only like the rest of Zarządzanie; devs come from .env only, so they can't be banned here.
function banTarget(req, res) {
  const userId = parseInt(req.params.id);
  if (userId === req.session.user.id) {
    res.status(400).json({ error: 'Nie możesz zablokować własnego konta.' });
    return null;
  }
  const user = db.prepare('SELECT id, username, display_name, role, banned_at FROM users WHERE id = ?').get(userId);
  if (!user) {
    res.status(404).json({ error: 'Użytkownik nie znaleziony.' });
    return null;
  }
  if (user.role === 'dev') {
    res.status(403).json({ error: 'Konta dewelopera nie można zablokować z panelu.' });
    return null;
  }
  return user;
}

router.post('/api/users/:id/ban', requireDev, (req, res) => {
  const user = banTarget(req, res);
  if (!user) return;
  if (!user.banned_at) {
    db.prepare("UPDATE users SET banned_at = datetime('now'), banned_by = ? WHERE id = ?").run(req.session.user.id, user.id);
    audit(req.session.user.id, 'user_ban', 'user', user.id, `zablokował ${user.display_name || user.username}`);
  }
  invalidateUserSessions(user.id);
  disconnectUser(user.id);
  disconnectUserFromParties(user.id);
  res.json({ success: true });
});

router.delete('/api/users/:id/ban', requireDev, (req, res) => {
  const user = banTarget(req, res);
  if (!user) return;
  if (user.banned_at) {
    db.prepare('UPDATE users SET banned_at = NULL, banned_by = NULL WHERE id = ?').run(user.id);
    audit(req.session.user.id, 'user_unban', 'user', user.id, `odblokował ${user.display_name || user.username}`);
  }
  res.json({ success: true });
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
    db.prepare('DELETE FROM video_ratings WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM watch_logs WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    // Log them out everywhere right away (refreshSessionUser would also catch it on their next request)
    invalidateUserSessions(userId);
    disconnectUser(userId);
    disconnectUserFromParties(userId);
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
