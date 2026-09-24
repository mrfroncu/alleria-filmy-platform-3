const express = require('express');
const db = require('../db');
const { requireAdmin, requireAuth } = require('../lib/auth');

const router = express.Router();

// ============ APP RANKS API ============
router.get('/api/ranks', requireAuth, (req, res) => {
  try {
    const ranks = db.prepare('SELECT * FROM app_ranks ORDER BY name').all();
    res.json(ranks);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/ranks', requireAdmin, (req, res) => {
  try {
    const { name, description, color } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Nazwa rangi jest wymagana.' });
    const result = db.prepare('INSERT INTO app_ranks (name, description, color) VALUES (?, ?, ?)').run(name.trim(), description || '', color || '#6366f1');
    const rank = db.prepare('SELECT * FROM app_ranks WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, rank });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Ranga o tej nazwie już istnieje.' });
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/ranks/:id', requireAdmin, (req, res) => {
  try {
    const { name, description, color } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Nazwa rangi jest wymagana.' });
    db.prepare('UPDATE app_ranks SET name=?, description=?, color=? WHERE id=?').run(name.trim(), description || '', color || '#6366f1', req.params.id);
    res.json({ success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Ranga o tej nazwie już istnieje.' });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/api/ranks/:id', requireAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM app_ranks WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get ranks assigned to a user
router.get('/api/users/:id/ranks', requireAdmin, (req, res) => {
  try {
    const ranks = db.prepare(`
      SELECT r.* FROM app_ranks r
      JOIN user_rank_assignments ura ON r.id = ura.rank_id
      WHERE ura.user_id = ?
      ORDER BY r.name
    `).all(req.params.id);
    res.json(ranks);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Set ranks for a user (replaces all current assignments)
router.post('/api/users/:id/ranks', requireAdmin, (req, res) => {
  try {
    const { rank_ids } = req.body;
    const userId = parseInt(req.params.id);
    db.prepare('DELETE FROM user_rank_assignments WHERE user_id = ?').run(userId);
    if (rank_ids && rank_ids.length > 0) {
      const stmt = db.prepare('INSERT OR IGNORE INTO user_rank_assignments (user_id, rank_id, assigned_by) VALUES (?, ?, ?)');
      rank_ids.forEach(rid => stmt.run(userId, rid, req.session.user.id));
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
