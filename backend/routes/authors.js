const express = require('express');
const db = require('../db');
const { requireAuth } = require('../lib/auth');

const router = express.Router();

// ============ AUTHORS API ============
router.get('/api/authors', requireAuth, (req, res) => {
  const authors = db.prepare(`
    SELECT DISTINCT u.id, u.username, u.display_name FROM users u
    JOIN videos v ON v.author_id = u.id ORDER BY u.display_name
  `).all();
  res.json(authors);
});

router.get('/api/authors/:id', requireAuth, (req, res) => {
  const author = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar, u.bio, u.created_at,
      COUNT(v.id) AS video_count
    FROM users u LEFT JOIN videos v ON v.author_id = u.id
    WHERE u.id = ?
    GROUP BY u.id
  `).get(parseInt(req.params.id));
  if (!author) return res.status(404).json({ error: 'Autor nie znaleziony.' });
  if (author.video_count === 0) return res.status(404).json({ error: 'To konto nie opublikowało żadnego filmu.' });
  res.json(author);
});

module.exports = router;
