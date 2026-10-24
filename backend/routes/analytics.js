const express = require('express');
const db = require('../db');
const { audit } = require('../lib/helpers');
const { requireAuth } = require('../lib/auth');

const router = express.Router();

// ============ VIDEO ANALYTICS ============
const SOURCE_KEY_RE = /^(main|mirror[1-5])$/;
const SESSION_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

// Label and "alternative version" flag come from the video row, never from the client — the
// client only says which key it was playing.
function describeSource(video, key) {
  if (key === 'main') return { label: video.main_source_title || 'Główne źródło', isAlt: false };
  const n = key.slice(6);
  return { label: video[`mirror${n}_name`] || `Mirror ${n}`, isAlt: !!video[`mirror${n}_is_alt`] };
}

function finiteOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// Batched sampled player events — the frontend buffers play/pause/seek and flushes every ~15s /
// on source switch / on unload, never one request per raw event. Each event carries the source
// it was played on (Watch Party sends none: it always plays the main source). The optional
// `session` is the running total for one stretch of viewing on one source, upserted by its
// client-generated id: watched_delta is added, positions are overwritten with the latest.
router.post('/api/videos/:id/playback-events', requireAuth, (req, res) => {
  try {
    const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(req.params.id);
    if (!video) return res.status(404).json({ error: 'Nie znaleziono filmu.' });
    const userId = req.session.user.id;
    const events = Array.isArray(req.body.events) ? req.body.events.slice(0, 200) : [];
    const context = req.body.context === 'watch_party' ? 'watch_party' : 'solo';
    const session = req.body.session && typeof req.body.session === 'object' ? req.body.session : null;

    const insert = db.prepare('INSERT INTO video_playback_events (video_id, user_id, event_type, position, from_position, context, source_key, is_alt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    // WHERE on the upsert: a session id belongs to whoever created it — someone else's id just
    // doesn't update anything instead of overwriting their numbers.
    const upsertSession = db.prepare(`INSERT INTO video_source_sessions
        (session_id, view_id, video_id, user_id, source_key, source_label, is_alt, context, start_position, end_position, max_position, duration, watched_seconds)
      VALUES (@session_id, @view_id, @video_id, @user_id, @source_key, @source_label, @is_alt, @context, @start_position, @end_position, @max_position, @duration, @watched)
      ON CONFLICT(session_id) DO UPDATE SET
        end_position = COALESCE(excluded.end_position, end_position),
        max_position = MAX(COALESCE(max_position, 0), COALESCE(excluded.max_position, 0)),
        duration = COALESCE(excluded.duration, duration),
        watched_seconds = watched_seconds + excluded.watched_seconds,
        updated_at = datetime('now')
      WHERE video_source_sessions.user_id = excluded.user_id AND video_source_sessions.video_id = excluded.video_id`);

    db.transaction(() => {
      for (const e of events) {
        if (!['play', 'pause', 'seek'].includes(e.event_type)) continue;
        const position = finiteOrNull(e.position);
        if (position === null) continue;
        const sourceKey = SOURCE_KEY_RE.test(e.source_key) ? e.source_key : null;
        const isAlt = sourceKey ? describeSource(video, sourceKey).isAlt : false;
        insert.run(video.id, userId, e.event_type, position, finiteOrNull(e.from_position), context, sourceKey, isAlt ? 1 : 0);
      }
      if (session && SESSION_ID_RE.test(session.id) && SESSION_ID_RE.test(session.view_id) && SOURCE_KEY_RE.test(session.source_key)) {
        const src = describeSource(video, session.source_key);
        upsertSession.run({
          session_id: session.id, view_id: session.view_id, video_id: video.id, user_id: userId,
          source_key: session.source_key, source_label: src.label, is_alt: src.isAlt ? 1 : 0, context,
          start_position: finiteOrNull(session.start_position),
          end_position: finiteOrNull(session.end_position),
          max_position: finiteOrNull(session.max_position),
          duration: finiteOrNull(session.duration) || null,
          // One flush covers ~15s (a throttled background tab: about a minute) — anything far
          // beyond that is a broken or forged client, not real viewing.
          watched: Math.min(3600, finiteOrNull(session.watched_delta) || 0),
        });
      }
    })();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Which events/sessions belong to the selected version: the film itself is everything not
// marked as an alternative version (main + regular mirrors + pre-migration rows), an
// alternative version is exactly its own source key.
function buildVersionFilter(version) {
  if (version.isAlt) return { sql: 'AND is_alt = 1 AND source_key = ?', params: [version.key] };
  return { sql: 'AND is_alt = 0', params: [] };
}

// videos.* has no canonical duration column (only ever reported client-side) — the longest
// duration any viewer's player has reported for this version is the best approximation available.
// watch_progress only counts for the film itself: alternative versions never write it.
function getVersionDuration(videoId, version) {
  const vf = buildVersionFilter(version);
  const ss = db.prepare(`SELECT MAX(duration) AS d FROM video_source_sessions WHERE video_id = ? ${vf.sql}`).get(videoId, ...vf.params);
  if (!version.isAlt) {
    const wp = db.prepare('SELECT MAX(duration) AS d FROM watch_progress WHERE video_id = ?').get(videoId);
    const best = Math.max(ss?.d || 0, wp?.d || 0);
    if (best > 0) return best;
  } else if (ss?.d > 0) {
    return ss.d;
  }
  const pe = db.prepare(`SELECT MAX(position) AS d FROM video_playback_events WHERE video_id = ? ${vf.sql}`).get(videoId, ...vf.params);
  return pe?.d || 0;
}

// The selectable versions on the analytics page: the film itself plus each mirror currently
// marked as an alternative version.
function listVersions(video) {
  const versions = [{ key: 'main', label: 'Film', isAlt: false }];
  for (let i = 1; i <= 5; i++) {
    if (video[`mirror${i}_url`] && video[`mirror${i}_is_alt`]) {
      versions.push({ key: `mirror${i}`, label: video[`mirror${i}_name`] || `Mirror ${i}`, isAlt: true });
    }
  }
  return versions;
}

const MAX_TIMELINE_VISITS = 100;

// Source usage for the "Źródła odtwarzania" card: per-source totals, the most common switches,
// and the latest visits as a per-viewer timeline. Covers every version at once — it's about
// which source people pick, not about one version's content.
function buildSourceUsage(video, rows) {
  const bySource = new Map();
  const visits = new Map();
  for (const r of rows) {
    const current = SOURCE_KEY_RE.test(r.source_key) ? describeSource(video, r.source_key) : null;
    const label = r.source_label || current?.label || r.source_key;
    if (!bySource.has(r.source_key)) {
      bySource.set(r.source_key, { key: r.source_key, label, isAlt: !!r.is_alt, sessions: 0, users: new Set(), watchedSeconds: 0 });
    }
    const s = bySource.get(r.source_key);
    s.sessions++;
    s.users.add(r.user_id);
    s.watchedSeconds += r.watched_seconds || 0;

    if (!visits.has(r.view_id)) {
      visits.set(r.view_id, {
        viewId: r.view_id, userId: r.user_id, userName: r.display_name || r.username || `#${r.user_id}`,
        startedAt: r.started_at, segments: [],
      });
    }
    visits.get(r.view_id).segments.push({
      sourceKey: r.source_key, label, isAlt: !!r.is_alt, startedAt: r.started_at,
      startPosition: r.start_position, endPosition: r.end_position, maxPosition: r.max_position,
      watchedSeconds: r.watched_seconds || 0,
    });
  }

  // rows come oldest-first, so each visit's segments are already in playback order.
  const switches = new Map();
  for (const v of visits.values()) {
    for (let i = 1; i < v.segments.length; i++) {
      const from = v.segments[i - 1], to = v.segments[i];
      const k = `${from.sourceKey}>${to.sourceKey}`;
      if (!switches.has(k)) switches.set(k, { from: from.label, to: to.label, count: 0 });
      switches.get(k).count++;
    }
  }

  return {
    sources: [...bySource.values()]
      .map(s => ({ ...s, users: s.users.size, watchedSeconds: Math.round(s.watchedSeconds) }))
      .sort((a, b) => b.watchedSeconds - a.watchedSeconds || b.sessions - a.sessions),
    switches: [...switches.values()].sort((a, b) => b.count - a.count),
    visits: [...visits.values()].reverse().slice(0, MAX_TIMELINE_VISITS),
  };
}

// Positions go out raw (0.1 s precision, clamped to the film, sorted), not pre-binned: the page
// bins them itself for whatever part of the film is on screen, so zooming in gets down to single
// seconds instead of being stuck at a fixed fraction of the film.
function sortedPositions(positions, duration) {
  return positions
    .map(p => Math.round(Math.min(duration, Math.max(0, p || 0)) * 10) / 10)
    .sort((a, b) => a - b);
}

// A player's last reported position rarely lands exactly on the reported duration (last
// timeupdate, rounding, the ended event firing first) — this close to the end counts as having
// watched it to the end.
const END_TOLERANCE_S = 1.5;

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
    const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(req.params.id);
    if (!video) return res.status(404).json({ error: 'Nie znaleziono filmu.' });
    const isOwner = video.author_id === req.session.user.id;
    const isAdmin = req.session.user.role === 'admin' || req.session.user.role === 'dev';
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Brak uprawnień.' });

    // Heatmap + retention are per version; anything unknown (or a mirror no longer marked as an
    // alternative version) falls back to the film itself.
    const versions = listVersions(video);
    const version = versions.find(v => v.key === req.query.version) || versions[0];
    const versionFilter = buildVersionFilter(version);

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
    const duration = getVersionDuration(video.id, version);
    const ctxParams = context === 'all' ? [] : [context];
    if (duration > 0) {
      const evParams = [video.id, ...ctxParams];
      const evDate = buildDateCond('created_at', after, before);
      const evCond = `${userFilter.sql}${evDate.sql} ${versionFilter.sql}`;
      const withExtra = (params) => [...params, ...userFilter.params, ...evDate.params, ...versionFilter.params];

      const pauses = db.prepare(`SELECT position FROM video_playback_events WHERE video_id = ? ${ctxCond} AND event_type = 'pause' ${evCond}`)
        .all(...withExtra(evParams)).map(r => r.position);
      const rewinds = db.prepare(`SELECT position FROM video_playback_events WHERE video_id = ? ${ctxCond} AND event_type = 'seek' AND from_position IS NOT NULL AND position < from_position ${evCond}`)
        .all(...withExtra(evParams)).map(r => r.position);
      const skips = db.prepare(`SELECT from_position AS position FROM video_playback_events WHERE video_id = ? ${ctxCond} AND event_type = 'seek' AND from_position IS NOT NULL AND position > from_position ${evCond}`)
        .all(...withExtra(evParams)).map(r => r.position);

      // Retention curve: for each bucket, the fraction of viewers whose furthest-ever position
      // reached at least that point — the standard simplified retention-graph definition (not
      // true frame-by-frame "were they actively watching" reconstruction). watch_progress has no
      // source, so it only feeds the film itself (alternative versions never write it).
      const progressDate = buildDateCond('updated_at', after, before);
      const progressPositions = (context === 'watch_party' || version.isAlt) ? [] : (() => {
        let sql = 'SELECT user_id, MAX(position) AS position FROM watch_progress WHERE video_id = ?';
        const params = [video.id];
        if (userFilter.sql) { sql += ' ' + userFilter.sql; params.push(...userFilter.params); }
        sql += progressDate.sql; params.push(...progressDate.params);
        return db.prepare(sql + ' GROUP BY user_id').all(...params);
      })();
      const eventPositions = db.prepare(`SELECT user_id, MAX(position) AS position FROM video_playback_events WHERE video_id = ? ${ctxCond} ${evCond} GROUP BY user_id`)
        .all(...withExtra(evParams));
      // Sessions catch the "pressed play once and watched on" case, where the furthest point
      // reached is in no event at all.
      const ssDate = buildDateCond('started_at', after, before);
      const sessionPositions = db.prepare(`SELECT user_id, MAX(max_position) AS position FROM video_source_sessions WHERE video_id = ? ${ctxCond} ${userFilter.sql}${ssDate.sql} ${versionFilter.sql} GROUP BY user_id`)
        .all(video.id, ...ctxParams, ...userFilter.params, ...ssDate.params, ...versionFilter.params);
      const furthestByUser = {};
      for (const r of [...progressPositions, ...eventPositions, ...sessionPositions]) {
        furthestByUser[r.user_id] = Math.max(furthestByUser[r.user_id] || 0, r.position || 0);
      }
      // One furthest position per viewer (anonymous) — the page computes the retention curve and
      // the drop-off strip from these at any resolution.
      const furthest = sortedPositions(
        Object.values(furthestByUser).map(p => (p >= duration - END_TOLERANCE_S ? duration : p)),
        duration,
      );

      heatmap = {
        duration,
        viewers: furthest.length,
        furthest,
        pauses: sortedPositions(pauses, duration),
        rewinds: sortedPositions(rewinds, duration),
        skips: sortedPositions(skips, duration),
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
        ? Math.round((heatmap.furthest.reduce((a, p) => a + p / heatmap.duration, 0) / heatmap.viewers) * 100)
        : null,
    };

    // Earliest recorded activity — informational only now (the views chart itself covers full
    // history and exposes its own drag-to-select range).
    const oldestEvent = db.prepare('SELECT MIN(created_at) AS d FROM video_playback_events WHERE video_id = ?').get(video.id)?.d;
    const oldestView = db.prepare('SELECT MIN(watched_at) AS d FROM watch_logs WHERE video_id = ?').get(video.id)?.d;
    const oldestActivity = [oldestEvent, oldestView].filter(Boolean).sort()[0] || null;

    // Ratings and favorites are not filtered by the viewer/context/date filters above.
    const ratingRows = db.prepare(`SELECT r.rating, r.updated_at, u.id AS user_id, u.username, u.display_name
      FROM video_ratings r LEFT JOIN users u ON u.id = r.user_id WHERE r.video_id = ? ORDER BY r.updated_at DESC`).all(video.id);
    const distribution = [1, 2, 3, 4, 5].map(star => ratingRows.filter(r => r.rating === star).length);
    const ratings = {
      count: ratingRows.length,
      average: ratingRows.length ? Math.round((ratingRows.reduce((a, r) => a + r.rating, 0) / ratingRows.length) * 100) / 100 : null,
      distribution,
      entries: ratingRows,
    };
    const favorites = db.prepare(`SELECT f.created_at, u.id AS user_id, u.username, u.display_name
      FROM favorites f LEFT JOIN users u ON u.id = f.user_id WHERE f.video_id = ? ORDER BY f.created_at DESC`).all(video.id);

    // Source usage follows the context/date/user filters, but not the version (see buildSourceUsage).
    const usageDate = buildDateCond('s.started_at', after, before);
    const usageRows = db.prepare(`SELECT s.*, u.username, u.display_name FROM video_source_sessions s
      LEFT JOIN users u ON u.id = s.user_id
      WHERE s.video_id = ? ${context === 'all' ? '' : 'AND s.context = ?'} ${userFilter.sql.replace('user_id', 's.user_id')}${usageDate.sql}
      ORDER BY s.started_at ASC, s.id ASC`)
      .all(video.id, ...ctxParams, ...userFilter.params, ...usageDate.params);
    const sourceUsage = buildSourceUsage(video, usageRows);

    res.json({
      ratings, favorites,
      dailyViews, heatmap, summary, viewers, context, oldestActivity,
      versions, version: version.key, sourceUsage,
      includeUserIds: includeIds, excludeUserIds: excludeIds, after, before,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Reset analytics source data for a video — optionally scoped to a time window and/or a single
// user. Only touches video_playback_events, video_source_sessions and watch_logs (the actual
// analytics-source tables), for every version at once;
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
    const sessionsInfo = db.prepare(`DELETE FROM video_source_sessions WHERE ${where.replace(/created_at/g, 'started_at')}`).run(...evParams);

    const userDesc = includeIds ? ` (tylko: ${includeIds.join(', ')})` : excludeIds ? ` (wszyscy oprócz: ${excludeIds.join(', ')})` : '';
    audit(req.session.user.id, 'delete', 'video_analytics', video.id,
      `usunięto ${evInfo.changes} zdarzeń, ${logsInfo.changes} wyświetleń i ${sessionsInfo.changes} sesji źródeł${userDesc}${after || before ? ` (okres: ${after || '...'} – ${before || '...'})` : ''}`);
    res.json({ success: true, deletedEvents: evInfo.changes, deletedViews: logsInfo.changes, deletedSessions: sessionsInfo.changes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
