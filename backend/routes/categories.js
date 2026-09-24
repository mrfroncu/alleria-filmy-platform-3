const express = require('express');
const db = require('../db');
const { audit } = require('../lib/helpers');
const { checkCatAccess, getUserRankIds } = require('../lib/access');
const { requireAuth, requireDev } = require('../lib/auth');

const router = express.Router();

// ============ CATEGORIES API ============
// List categories (filtered by user access)
router.get('/api/categories', requireAuth, (req, res) => {
  try {
    const allCats = db.prepare('SELECT * FROM categories ORDER BY sort_order, name').all();
    const user = req.session.user;
    const isDev = user.role === 'dev';

    // Only dev sees all categories without restriction
    if (isDev) {
      const cats = allCats.map(c => {
        const access = db.prepare('SELECT * FROM category_access WHERE category_id = ?').all(c.id);
        const rank_access = db.prepare('SELECT cra.*, r.name AS rank_name, r.color AS rank_color FROM category_rank_access cra JOIN app_ranks r ON cra.rank_id = r.id WHERE cra.category_id = ?').all(c.id);
        const videoCount = db.prepare('SELECT COUNT(*) AS c FROM videos WHERE category_id = ?').get(c.id).c;
        return { ...c, access, rank_access, videoCount, canView: true, canEdit: true };
      });
      return res.json(cats);
    }

    // Regular users — check access using compound mode
    const userId = user.id;
    const userRoles = user.discord_roles || [];
    const userRankIds = getUserRankIds(userId);
    const withAccess = allCats.map(c => {
      const { canView, canEdit } = checkCatAccess(c.id, c.access_mode, userId, userRoles, userRankIds);
      return { ...c, canView, canEdit };
    });

    // A category the user can't view is still included — as a minimal "locked" placeholder,
    // no access/rank_access/webhook details — if it has an accessible descendant, so that
    // descendant stays reachable in the category tree (sidebar) instead of silently vanishing
    // because its parent chain got filtered out. Otherwise it's dropped entirely, as before.
    const byParent = {};
    for (const c of withAccess) {
      const pid = c.parent_id || 0;
      (byParent[pid] = byParent[pid] || []).push(c);
    }
    const hasAccessibleDescendant = (catId) =>
      (byParent[catId] || []).some(ch => ch.canView || hasAccessibleDescendant(ch.id));

    const cats = withAccess
      .filter(c => c.canView || hasAccessibleDescendant(c.id))
      .map(c => {
        if (!c.canView) {
          return { id: c.id, name: c.name, slug: c.slug, icon: c.icon, sort_order: c.sort_order, parent_id: c.parent_id, canView: false, canEdit: false, locked: true };
        }
        const access = db.prepare('SELECT * FROM category_access WHERE category_id = ?').all(c.id);
        const rank_access = db.prepare('SELECT cra.*, r.name AS rank_name, r.color AS rank_color FROM category_rank_access cra JOIN app_ranks r ON cra.rank_id = r.id WHERE cra.category_id = ?').all(c.id);
        const videoCount = db.prepare('SELECT COUNT(*) AS c FROM videos WHERE category_id = ?').get(c.id).c;
        return { ...c, access, rank_access, videoCount };
      });

    res.json(cats);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create category (dev only)
router.post('/api/categories', requireDev, (req, res) => {
  try {
    const { name, description, icon, sort_order, parent_id, webhook_url, webhook_template, webhook_enabled, email_enabled, push_enabled, is_shorts_category } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const result = db.prepare('INSERT INTO categories (name, slug, description, icon, sort_order, parent_id, webhook_url, webhook_template, webhook_enabled, email_enabled, push_enabled, is_shorts_category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(name, slug, description || '', icon || 'Film', sort_order || 0, parent_id || null, webhook_url || '', webhook_template || '', webhook_enabled ? 1 : 0, email_enabled ? 1 : 0, push_enabled ? 1 : 0, is_shorts_category ? 1 : 0);
    const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);
    audit(req.session.user.id, "create", "category", cat.id, name);
    res.json({ success: true, category: cat });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update category (dev only)
router.put('/api/categories/:id', requireDev, (req, res) => {
  try {
    const { name, description, icon, sort_order, parent_id, webhook_url, webhook_template, webhook_enabled, email_enabled, push_enabled, is_shorts_category } = req.body;
    const slug = name ? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : undefined;
    if (name) db.prepare('UPDATE categories SET name=?, slug=?, description=?, icon=?, sort_order=?, parent_id=?, webhook_url=?, webhook_template=?, webhook_enabled=?, email_enabled=?, push_enabled=?, is_shorts_category=? WHERE id=?')
      .run(name, slug, description || '', icon || 'Film', sort_order || 0, parent_id || null, webhook_url || '', webhook_template || '', webhook_enabled ? 1 : 0, email_enabled ? 1 : 0, push_enabled ? 1 : 0, is_shorts_category ? 1 : 0, req.params.id);
    audit(req.session.user.id, "edit", "category", parseInt(req.params.id), name || "");
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete category (dev only)
router.delete('/api/categories/:id', requireDev, (req, res) => {
  try {
    const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
    if (cat) db.prepare('UPDATE categories SET parent_id = ? WHERE parent_id = ?').run(cat.parent_id || null, req.params.id);
    db.prepare('UPDATE videos SET category_id = NULL WHERE category_id = ?').run(req.params.id);
    db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
    audit(req.session.user.id, "delete", "category", parseInt(req.params.id), cat?.name || "");
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Set category access (dev only)
// New payload: { viewer_mode, editor_mode, viewers, editors, rank_viewers, rank_editors, viewer_user_ids, editor_user_ids }
// viewer_mode: 'public' | 'roles' | 'custom'
// editor_mode: 'none' | 'roles' | 'custom'
router.post('/api/categories/:id/access', requireDev, (req, res) => {
  try {
    const { viewer_mode, editor_mode, viewers, editors, rank_viewers, rank_editors, viewer_user_ids, editor_user_ids } = req.body;
    const vm = viewer_mode || 'public';
    const em = editor_mode || 'none';
    const catId = req.params.id;

    db.prepare('UPDATE categories SET access_mode = ? WHERE id = ?').run(`${vm}:${em}`, catId);
    db.prepare('DELETE FROM category_access WHERE category_id = ?').run(catId);
    db.prepare('DELETE FROM category_rank_access WHERE category_id = ?').run(catId);
    db.prepare('DELETE FROM category_user_access WHERE category_id = ?').run(catId);

    if (vm === 'roles') {
      const stmtR = db.prepare('INSERT OR IGNORE INTO category_access (category_id, discord_role_id, access_type) VALUES (?, ?, ?)');
      const stmtRank = db.prepare('INSERT OR IGNORE INTO category_rank_access (category_id, rank_id, access_type) VALUES (?, ?, ?)');
      (viewers || []).forEach(r => stmtR.run(catId, r, 'viewer'));
      (rank_viewers || []).forEach(rid => stmtRank.run(catId, rid, 'viewer'));
    }
    if (em === 'roles') {
      const stmtR = db.prepare('INSERT OR IGNORE INTO category_access (category_id, discord_role_id, access_type) VALUES (?, ?, ?)');
      const stmtRank = db.prepare('INSERT OR IGNORE INTO category_rank_access (category_id, rank_id, access_type) VALUES (?, ?, ?)');
      (editors || []).forEach(r => stmtR.run(catId, r, 'editor'));
      (rank_editors || []).forEach(rid => stmtRank.run(catId, rid, 'editor'));
    }
    if (vm === 'custom') {
      const stmt = db.prepare('INSERT OR IGNORE INTO category_user_access (category_id, user_id, access_type) VALUES (?, ?, ?)');
      (viewer_user_ids || []).forEach(uid => stmt.run(catId, uid, 'viewer'));
    }
    if (em === 'custom') {
      const stmt = db.prepare('INSERT OR IGNORE INTO category_user_access (category_id, user_id, access_type) VALUES (?, ?, ?)');
      (editor_user_ids || []).forEach(uid => stmt.run(catId, uid, 'editor'));
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get category user access list (dev only)
router.get('/api/categories/:id/user-access', requireDev, (req, res) => {
  try {
    const cat = db.prepare('SELECT access_mode FROM categories WHERE id = ?').get(req.params.id);
    if (!cat) return res.status(404).json({ error: 'Not found' });
    const viewerUsers = db.prepare("SELECT u.id, u.username, u.display_name FROM category_user_access cua JOIN users u ON cua.user_id = u.id WHERE cua.category_id = ? AND cua.access_type = 'viewer'").all(req.params.id);
    const editorUsers = db.prepare("SELECT u.id, u.username, u.display_name FROM category_user_access cua JOIN users u ON cua.user_id = u.id WHERE cua.category_id = ? AND cua.access_type = 'editor'").all(req.params.id);
    res.json({ access_mode: cat.access_mode || 'public:none', viewer_users: viewerUsers, editor_users: editorUsers });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
