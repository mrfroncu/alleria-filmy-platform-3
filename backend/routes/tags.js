const express = require('express');
const db = require('../db');
const { audit } = require('../lib/helpers');
const { requireAdmin, requireAuth } = require('../lib/auth');

const router = express.Router();

// ============ TAGS API ============
router.get('/api/tags', requireAuth, (req, res) => {
  const { search } = req.query;
  const query = search
    ? 'SELECT t.*, COUNT(vt.video_id) as video_count FROM tags t LEFT JOIN video_tags vt ON t.id = vt.tag_id WHERE t.name LIKE ? GROUP BY t.id ORDER BY t.name'
    : 'SELECT t.*, COUNT(vt.video_id) as video_count FROM tags t LEFT JOIN video_tags vt ON t.id = vt.tag_id GROUP BY t.id ORDER BY t.name';
  const tagRows = search ? db.prepare(query).all(`%${search}%`) : db.prepare(query).all();
  const videosByTag = db.prepare('SELECT vt.tag_id, v.id, v.title FROM video_tags vt JOIN videos v ON vt.video_id = v.id ORDER BY v.title').all();
  const videoMap = {};
  for (const row of videosByTag) {
    if (!videoMap[row.tag_id]) videoMap[row.tag_id] = [];
    videoMap[row.tag_id].push({ id: row.id, title: row.title });
  }
  res.json(tagRows.map(t => ({ ...t, videos: videoMap[t.id] || [] })));
});

router.delete('/api/tags/:id', requireAdmin, (req, res) => {
  try {
    const count = db.prepare('SELECT COUNT(*) as cnt FROM video_tags WHERE tag_id = ?').get(req.params.id);
    if (count.cnt > 0) return res.status(409).json({ error: `Tag jest przypisany do ${count.cnt} film${count.cnt === 1 ? 'u' : 'ów'} i nie może zostać usunięty.` });
    const tag = db.prepare('SELECT name FROM tags WHERE id = ?').get(req.params.id);
    db.prepare('DELETE FROM tags WHERE id = ?').run(req.params.id);
    audit(req.session.user.id, "delete", "tag", parseInt(req.params.id), tag?.name || "");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete tag' });
  }
});

// Tags used in a specific category
router.get('/api/tags/category/:slug', requireAuth, (req, res) => {
  try {
    const cat = db.prepare('SELECT id FROM categories WHERE slug = ?').get(req.params.slug);
    if (!cat) return res.json([]);
    const tags = db.prepare(`
      SELECT DISTINCT t.* FROM tags t
      JOIN video_tags vt ON t.id = vt.tag_id
      JOIN videos v ON vt.video_id = v.id
      WHERE v.category_id = ?
      ORDER BY t.name ASC
    `).all(cat.id);
    res.json(tags);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
