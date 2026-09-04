/**
 * Alleria Filmy - integration endpoints for dash.alleria.pl.
 *
 * Install: copy this file to backend/integrations.js and add to backend/server.js
 * (anywhere after `app` and `db` exist, before app.listen):
 *
 *     require('./integrations')(app, db);
 *
 * Set INTEGRATION_API_KEY in .env (any long random string) and put the same
 * value in the dashboard: Admin → Settings → External services → Alleria Filmy
 * integration key.
 *
 * GET /api/integrations/latest-videos?per_category=3&include_restricted=0
 *   Header: X-Integration-Key: <INTEGRATION_API_KEY>
 *   → { generated_at, categories: [{ id, name, slug, icon, restricted, videos: [...] }] }
 *
 * Only published (publish_date <= now), ready (stream_status) videos with
 * category-level access are returned; custom-access videos are never listed.
 * Categories whose viewer mode is not "public" are marked restricted and
 * skipped unless include_restricted=1.
 */
module.exports = function registerIntegrations(app, db) {
  function requireIntegrationKey(req, res, next) {
    const expected = process.env.INTEGRATION_API_KEY;
    if (!expected) return res.status(503).json({ error: 'INTEGRATION_API_KEY not configured' });
    const given = req.get('X-Integration-Key') || '';
    if (given.length !== expected.length || !require('crypto').timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
  }

  app.get('/api/integrations/latest-videos', requireIntegrationKey, (req, res) => {
    const perCategory = Math.min(12, Math.max(1, parseInt(req.query.per_category, 10) || 3));
    const includeRestricted = req.query.include_restricted === '1';

    const categories = db.prepare('SELECT id, name, slug, icon, access_mode, sort_order FROM categories ORDER BY sort_order ASC, name ASC').all();
    const latest = db.prepare(`
      SELECT v.id, v.title, v.thumbnail, v.publish_date, v.main_source_type, u.display_name, u.username
      FROM videos v
      LEFT JOIN users u ON u.id = v.author_id
      WHERE v.category_id = ?
        AND (v.stream_status IS NULL OR v.stream_status = 'ready')
        AND datetime(v.publish_date) <= datetime('now')
        AND (v.access_mode IS NULL OR v.access_mode = 'category')
      ORDER BY datetime(v.publish_date) DESC
      LIMIT ?
    `);

    const out = [];
    for (const c of categories) {
      const viewerMode = String(c.access_mode || 'public').split(':')[0];
      const restricted = viewerMode !== 'public';
      if (restricted && !includeRestricted) continue;
      const videos = latest.all(c.id, perCategory).map((v) => ({
        id: v.id,
        title: v.title,
        thumbnail: v.thumbnail || null,
        publish_date: v.publish_date,
        author: v.display_name || v.username || null,
        source_type: v.main_source_type || null,
      }));
      out.push({ id: c.id, name: c.name, slug: c.slug, icon: c.icon, restricted, videos });
    }
    res.set('Cache-Control', 'private, max-age=60');
    res.json({ generated_at: new Date().toISOString(), categories: out });
  });
};
