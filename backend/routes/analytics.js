const express = require('express');
const db = require('../db');
const { audit } = require('../lib/helpers');
const { requireAuth } = require('../lib/auth');

const router = express.Router();

// ============ VIDEO ANALYTICS ============
// Batched sampled player events (self-hosted only) — the frontend buffers play/pause/seek and
// flushes every ~15s / on pause / on unload, never one request per raw event.
router.post('/api/videos/:id/playback-events', requireAuth, (req, res) => {
  try {
    const events = Array.isArray(req.body.events) ? req.body.events.slice(0, 200) : [];
    const context = req.body.context === 'watch_party' ? 'watch_party' : 'solo';
    if (events.length > 0) {
      const insert = db.prepare('INSERT INTO video_playback_events (video_id, user_id, event_type, position, from_position, context) VALUES (?, ?, ?, ?, ?, ?)');
      const insertMany = db.transaction((rows) => {
        for (const e of rows) {
          if (!['play', 'pause', 'seek'].includes(e.event_type)) continue;
          const position = Number(e.position);
          if (!Number.isFinite(position) || position < 0) continue;
          const fromPosition = Number(e.from_position);
          insert.run(req.params.id, req.session.user.id, e.event_type, position, Number.isFinite(fromPosition) ? fromPosition : null, context);
        }
      });
      insertMany(events);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// videos.* has no canonical duration column (only ever reported client-side) — the longest
// duration any viewer's player has reported is the best approximation available.
function getVideoDuration(videoId) {
  const wp = db.prepare('SELECT MAX(duration) AS d FROM watch_progress WHERE video_id = ?').get(videoId);
  if (wp?.d > 0) return wp.d;
  const pe = db.prepare('SELECT MAX(position) AS d FROM video_playback_events WHERE video_id = ?').get(videoId);
  return pe?.d || 0;
}

function bucketPositions(positions, duration, bucketCount) {
  const buckets = new Array(bucketCount).fill(0);
  if (!duration || duration <= 0) return buckets;
  const bucketSize = duration / bucketCount;
  for (const pos of positions) {
    const idx = Math.min(bucketCount - 1, Math.max(0, Math.floor(pos / bucketSize)));
    buckets[idx]++;
  }
  return buckets;
}

const ANALYTICS_BUCKETS = 50;

// Parses a "1,2,3" query-string param into an int array, or null if absent/empty.
function parseIdListParam(raw) {
  if (!raw) return null;
  const ids = String(raw).split(',').map(s => parseInt(s.trim(), 10)).filter(Number.isInteger);
  return ids.length ? ids : null;
}

// Same, but for a JSON body value that may already be an array.
function sanitizeIdList(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const ids = raw.map(n => parseInt(n, 10)).filter(Number.isInteger);
  return ids.length ? ids : null;
}

// Builds a "AND user_id ..." SQL fragment + its params for an include-list or exclude-list of
// users. The two modes are mutually exclusive radio choices on the frontend; if both somehow
// arrive, include wins.
function buildUserIdFilter(includeIds, excludeIds) {
  if (includeIds) return { sql: `AND user_id IN (${includeIds.map(() => '?').join(',')})`, params: includeIds };
  if (excludeIds) return { sql: `AND user_id NOT IN (${excludeIds.map(() => '?').join(',')})`, params: excludeIds };
  return { sql: '', params: [] };
}

function buildDateCond(column, after, before) {
  let sql = '';
  const params = [];
  if (after) { sql += ` AND ${column} >= ?`; params.push(after); }
  if (before) { sql += ` AND ${column} <= ?`; params.push(before); }
  return { sql, params };
}

// Distinct viewers for a video under a given context+date-range filter — powers both the per-user
// picker and the unique-viewers summary stat. Deliberately NOT filtered by the include/exclude
// user selection itself — this list is what that picker is built FROM, so filtering it by the
// picker's own state would be circular. watch_progress is solo-only by construction (Watch Party
// never writes to it), so it's excluded entirely once 'watch_party' is asked for specifically.
function getVideoViewerUsers(videoId, context, after, before) {
  const ids = new Set();
  if (context !== 'watch_party') {
    const d = buildDateCond('updated_at', after, before);
    for (const r of db.prepare(`SELECT DISTINCT user_id FROM watch_progress WHERE video_id = ?${d.sql}`).all(videoId, ...d.params)) ids.add(r.user_id);
  }
  const ctxCond = context === 'all' ? '' : 'AND context = ?';
  const ctxParams = context === 'all' ? [] : [context];
  const dLogs = buildDateCond('watched_at', after, before);
  const dEvents = buildDateCond('created_at', after, before);
  for (const r of db.prepare(`SELECT DISTINCT user_id FROM watch_logs WHERE video_id = ? ${ctxCond}${dLogs.sql}`).all(videoId, ...ctxParams, ...dLogs.params)) ids.add(r.user_id);
  for (const r of db.prepare(`SELECT DISTINCT user_id FROM video_playback_events WHERE video_id = ? ${ctxCond}${dEvents.sql}`).all(videoId, ...ctxParams, ...dEvents.params)) ids.add(r.user_id);
  if (ids.size === 0) return [];
  const placeholders = [...ids].map(() => '?').join(',');
  return db.prepare(`SELECT id, username, display_name FROM users WHERE id IN (${placeholders})`).all(...ids);
}

router.get('/api/videos/:id/analytics', requireAuth, (req, res) => {
  try {
    const video = db.prepare('SELECT id, author_id FROM videos WHERE id = ?').get(req.params.id);
    if (!video) return res.status(404).json({ error: 'Nie znaleziono filmu.' });
    const isOwner = video.author_id === req.session.user.id;
    const isAdmin = req.session.user.role === 'admin' || req.session.user.role === 'dev';
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Brak uprawnień.' });

    const context = ['solo', 'watch_party'].includes(req.query.context) ? req.query.context : 'all';
    const includeIds = parseIdListParam(req.query.user_ids);
    const excludeIds = includeIds ? null : parseIdListParam(req.query.exclude_user_ids);
    const userFilter = buildUserIdFilter(includeIds, excludeIds);
    const after = req.query.after || null;
    const before = req.query.before || null;
    const ctxCond = context === 'all' ? '' : 'AND context = ?';

    // Watch-time-over-time — daily view count. Unbounded by default (full history, so the chart's
    // own drag-to-select brush has the whole picture to narrow from); after/before scope it to the
    // range selected via that brush.
    const dailyParams = [video.id];
    let dailySql = `SELECT DATE(watched_at) AS day, COUNT(*) AS views FROM watch_logs WHERE video_id = ?`;
    if (context !== 'all') { dailySql += ' AND context = ?'; dailyParams.push(context); }
    if (after) { dailySql += ' AND watched_at >= ?'; dailyParams.push(after); }
    if (before) { dailySql += ' AND watched_at <= ?'; dailyParams.push(before); }
    if (userFilter.sql) { dailySql += ' ' + userFilter.sql; dailyParams.push(...userFilter.params); }
    dailySql += ' GROUP BY DATE(watched_at) ORDER BY day ASC';
    const dailyViews = db.prepare(dailySql).all(...dailyParams);

    let heatmap = null;
    const duration = getVideoDuration(video.id);
    if (duration > 0) {
      const evParams = context === 'all' ? [video.id] : [video.id, context];
      const evDate = buildDateCond('created_at', after, before);
      const withExtra = (params) => [...params, ...userFilter.params, ...evDate.params];

      const pauses = db.prepare(`SELECT position FROM video_playback_events WHERE video_id = ? ${ctxCond} AND event_type = 'pause' ${userFilter.sql}${evDate.sql}`)
        .all(...withExtra(evParams)).map(r => r.position);
      const rewinds = db.prepare(`SELECT position FROM video_playback_events WHERE video_id = ? ${ctxCond} AND event_type = 'seek' AND from_position IS NOT NULL AND position < from_position ${userFilter.sql}${evDate.sql}`)
        .all(...withExtra(evParams)).map(r => r.position);
      const skips = db.prepare(`SELECT from_position AS position FROM video_playback_events WHERE video_id = ? ${ctxCond} AND event_type = 'seek' AND from_position IS NOT NULL AND position > from_position ${userFilter.sql}${evDate.sql}`)
        .all(...withExtra(evParams)).map(r => r.position);

      // Retention curve: for each bucket, the fraction of viewers whose furthest-ever position
      // reached at least that point — the standard simplified retention-graph definition (not
      // true frame-by-frame "were they actively watching" reconstruction).
      const progressDate = buildDateCond('updated_at', after, before);
      const progressPositions = context === 'watch_party' ? [] : (() => {
        let sql = 'SELECT user_id, MAX(position) AS position FROM watch_progress WHERE video_id = ?';
        const params = [video.id];
        if (userFilter.sql) { sql += ' ' + userFilter.sql; params.push(...userFilter.params); }
        sql += progressDate.sql; params.push(...progressDate.params);
        return db.prepare(sql + ' GROUP BY user_id').all(...params);
      })();
      const eventPositions = db.prepare(`SELECT user_id, MAX(position) AS position FROM video_playback_events WHERE video_id = ? ${ctxCond} ${userFilter.sql}${evDate.sql} GROUP BY user_id`)
        .all(...withExtra(evParams));
      const furthestByUser = {};
      for (const r of [...progressPositions, ...eventPositions]) {
        furthestByUser[r.user_id] = Math.max(furthestByUser[r.user_id] || 0, r.position || 0);
      }
      const furthestValues = Object.values(furthestByUser);
      const bucketSize = duration / ANALYTICS_BUCKETS;
      const retention = new Array(ANALYTICS_BUCKETS).fill(0);
      if (furthestValues.length > 0) {
        for (let i = 0; i < ANALYTICS_BUCKETS; i++) {
          const bucketStart = i * bucketSize;
          retention[i] = furthestValues.filter(p => p >= bucketStart).length / furthestValues.length;
        }
      }

      heatmap = {
        duration,
        buckets: ANALYTICS_BUCKETS,
        viewers: furthestValues.length,
        retention,
        pauses: bucketPositions(pauses, duration, ANALYTICS_BUCKETS),
        rewinds: bucketPositions(rewinds, duration, ANALYTICS_BUCKETS),
        skips: bucketPositions(skips, duration, ANALYTICS_BUCKETS),
      };
    }

    // Full, unfiltered-by-user-selection viewer list — this is what the include/exclude picker is
    // built from, so it only respects context+date range, not the user selection itself.
    const viewers = getVideoViewerUsers(video.id, context, after, before);
    // uniqueViewers reflects the applied user filter too, computed directly against the id set
    // rather than re-querying.
    const filteredViewerCount = includeIds
      ? viewers.filter(v => includeIds.includes(v.id)).length
      : excludeIds
        ? viewers.filter(v => !excludeIds.includes(v.id)).length
        : viewers.length;
    const summary = {
      uniqueViewers: filteredViewerCount,
      avgCompletionPct: (heatmap && heatmap.viewers > 0)
        ? Math.round((heatmap.retention.reduce((a, b) => a + b, 0) / ANALYTICS_BUCKETS) * 100)
        : null,
    };

    // Earliest recorded activity — informational only now (the views chart itself covers full
    // history and exposes its own drag-to-select range).
    const oldestEvent = db.prepare('SELECT MIN(created_at) AS d FROM video_playback_events WHERE video_id = ?').get(video.id)?.d;
    const oldestView = db.prepare('SELECT MIN(watched_at) AS d FROM watch_logs WHERE video_id = ?').get(video.id)?.d;
    const oldestActivity = [oldestEvent, oldestView].filter(Boolean).sort()[0] || null;

    res.json({
      dailyViews, heatmap, summary, viewers, context, oldestActivity,
      includeUserIds: includeIds, excludeUserIds: excludeIds, after, before,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Reset analytics source data for a video — optionally scoped to a time window and/or a single
// user. Only touches video_playback_events and watch_logs (the actual analytics-source tables);
// deliberately leaves watch_progress alone since that's a viewer's own personal resume position
// for "Continue watching", not something an author/admin resetting analytics should be able to
// wipe out for someone else as a side effect.
router.delete('/api/videos/:id/analytics', requireAuth, (req, res) => {
  try {
    const video = db.prepare('SELECT id, author_id FROM videos WHERE id = ?').get(req.params.id);
    if (!video) return res.status(404).json({ error: 'Nie znaleziono filmu.' });
    const isOwner = video.author_id === req.session.user.id;
    const isAdmin = req.session.user.role === 'admin' || req.session.user.role === 'dev';
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Brak uprawnień.' });

    const { before, after, user_id, user_ids, exclude_user_ids } = req.body || {};
    const includeIds = sanitizeIdList(user_ids) || (user_id ? [parseInt(user_id, 10)] : null);
    const excludeIds = includeIds ? null : sanitizeIdList(exclude_user_ids);
    const userFilter = buildUserIdFilter(includeIds, excludeIds);

    const conds = ['video_id = ?'];
    const params = [video.id];
    if (after) { conds.push('created_at >= ?'); params.push(after); }
    if (before) { conds.push('created_at <= ?'); params.push(before); }
    const where = conds.join(' AND ') + (userFilter.sql ? ' ' + userFilter.sql : '');
    const evParams = [...params, ...userFilter.params];

    const evInfo = db.prepare(`DELETE FROM video_playback_events WHERE ${where}`).run(...evParams);
    // watch_logs uses watched_at, not created_at — same filter values, different column name.
    const logsWhere = where.replace(/created_at/g, 'watched_at');
    const logsInfo = db.prepare(`DELETE FROM watch_logs WHERE ${logsWhere}`).run(...evParams);

    const userDesc = includeIds ? ` (tylko: ${includeIds.join(', ')})` : excludeIds ? ` (wszyscy oprócz: ${excludeIds.join(', ')})` : '';
    audit(req.session.user.id, 'delete', 'video_analytics', video.id,
      `usunięto ${evInfo.changes} zdarzeń i ${logsInfo.changes} wyświetleń${userDesc}${after || before ? ` (okres: ${after || '...'} – ${before || '...'})` : ''}`);
    res.json({ success: true, deletedEvents: evInfo.changes, deletedViews: logsInfo.changes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
