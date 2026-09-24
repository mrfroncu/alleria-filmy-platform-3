const express = require('express');
const db = require('../db');
const { audit, extractYoutubeThumbnail } = require('../lib/helpers');
const { checkCatAccess, getUserRankIds, userCanViewVideo } = require('../lib/access');
const { notifyCategoryOfNewVideo, sendCategoryEmailNotifications, sendCategoryPushNotifications, sendDiscordWebhook } = require('../lib/notify');
const { requireAdmin, requireAuth } = require('../lib/auth');
const { upload } = require('../lib/uploads');

const router = express.Router();

// ============ VIDEOS API ============
// Hover-scrub preview sprite (YouTube-style filmstrip) — only ever generated for self-hosted
// videos once transcoding finishes (see streaming/server.js), so the URLs are only worth handing
// out once we know that file exists; the frontend still tolerates a 404 (skips the hover effect).
function attachPreviewUrl(v) {
  const hasPreview = v.main_source_type === 'selfhosted' && v.stream_status === 'ready' && v.stream_video_id;
  return {
    ...v,
    preview_sprite_url: hasPreview ? `/stream/media/${v.stream_video_id}/preview.jpg` : null,
    preview_meta_url: hasPreview ? `/stream/media/${v.stream_video_id}/preview.json` : null,
  };
}

router.get('/api/videos', requireAuth, (req, res) => {
  const { search, tags, author, sort = 'newest', include_transcoding, category } = req.query;
  const isAdminOrDev = req.session.user.role === 'admin' || req.session.user.role === 'dev';
  const isDev = req.session.user.role === 'dev';

  let sql = `
    SELECT v.*, u.username AS author_name, u.display_name AS author_display_name,
    c.name AS category_name, c.slug AS category_slug,
    GROUP_CONCAT(DISTINCT t.name) AS tag_names,
    GROUP_CONCAT(DISTINCT t.id) AS tag_ids
    FROM videos v
    LEFT JOIN users u ON v.author_id = u.id
    LEFT JOIN categories c ON v.category_id = c.id
    LEFT JOIN video_tags vt ON v.id = vt.video_id
    LEFT JOIN tags t ON vt.tag_id = t.id
  `;

  const conditions = [];
  const params = [];

  // Hide transcoding videos from regular users (admin+dev can see them)
  if (!isAdminOrDev || !include_transcoding) {
    conditions.push("(v.stream_status IS NULL OR v.stream_status = 'ready')");
  }

  // Access control — only dev bypasses category/content restrictions
  let editableCatIds = [];
  if (!isDev) {
    const userId = req.session.user.id;
    const userRoles = req.session.user.discord_roles || [];
    const userRankIds = getUserRankIds(userId);

    // Hide custom-access videos unless user is in video_access list
    conditions.push(`(v.access_mode IS NULL OR v.access_mode = 'category' OR (v.access_mode = 'custom' AND v.id IN (SELECT video_id FROM video_access WHERE user_id = ?)))`);
    params.push(userId);

    // Hide videos from categories the user doesn't have access to; separately collect
    // categories they can EDIT so a category editor still sees that category's own
    // scheduled (future publish_date) videos below, same as admin/dev already do everywhere.
    const allCats = db.prepare('SELECT id, access_mode FROM categories').all();
    const restrictedCatIds = [];
    for (const cat of allCats) {
      const { canView, canEdit } = checkCatAccess(cat.id, cat.access_mode, userId, userRoles, userRankIds);
      if (!canView) restrictedCatIds.push(cat.id);
      if (canEdit) editableCatIds.push(cat.id);
    }
    if (restrictedCatIds.length > 0) {
      conditions.push(`(v.category_id IS NULL OR v.category_id NOT IN (${restrictedCatIds.map(() => '?').join(',')}))`);
      params.push(...restrictedCatIds);
    }
  }

  // Hide scheduled (future) videos from regular users — admin/dev bypass everywhere, a
  // category editor bypasses only for their own category's videos (editableCatIds above),
  // everyone else only ever sees videos whose publish_date has passed.
  // publish_date is stored as an ISO string (toISOString(), "T"/"Z"/ms) — datetime('now') returns
  // SQLite's own "YYYY-MM-DD HH:MM:SS" format. Comparing those two TEXT formats directly is a raw
  // string comparison: at the date/time boundary "T" (0x54) sorts after " " (0x20), so ANY video
  // published earlier *today* still compares as "greater than" now and gets hidden all day.
  // Wrapping both sides in datetime(...) normalizes them to the same format before comparing.
  if (!isAdminOrDev) {
    if (editableCatIds.length > 0) {
      conditions.push(`(datetime(v.publish_date) <= datetime('now') OR v.category_id IN (${editableCatIds.map(() => '?').join(',')}))`);
      params.push(...editableCatIds);
    } else {
      conditions.push("datetime(v.publish_date) <= datetime('now')");
    }
  }

  if (search) {
    conditions.push(`(v.title LIKE ? OR v.description LIKE ? OR u.display_name LIKE ? OR u.username LIKE ?
      OR v.id IN (SELECT vt.video_id FROM video_tags vt JOIN tags t ON vt.tag_id = t.id WHERE t.name LIKE ?))`);
    const like = `%${search}%`;
    params.push(like, like, like, like, like);
  }

  if (author) {
    conditions.push('v.author_id = ?');
    params.push(parseInt(author));
  }

  if (tags) {
    const tagList = tags.split(',').map(Number);
    conditions.push(`v.id IN (SELECT video_id FROM video_tags WHERE tag_id IN (${tagList.map(() => '?').join(',')}))`);
    params.push(...tagList);
  }

  if (category) {
    if (!isDev) {
      const cat = db.prepare('SELECT id, access_mode FROM categories WHERE slug = ?').get(category);
      if (cat) {
        const uRoles = req.session.user.discord_roles || [];
        const uRankIds = getUserRankIds(req.session.user.id);
        const { canView } = checkCatAccess(cat.id, cat.access_mode, req.session.user.id, uRoles, uRankIds);
        if (!canView) return res.json([]);
      }
    }
    conditions.push('v.category_id = (SELECT id FROM categories WHERE slug = ?)');
    params.push(category);
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  sql += ' GROUP BY v.id';

  switch (sort) {
    case 'oldest': sql += ' ORDER BY v.publish_date ASC'; break;
    case 'title_asc': sql += ' ORDER BY v.title ASC'; break;
    case 'title_desc': sql += ' ORDER BY v.title DESC'; break;
    default: sql += ' ORDER BY v.publish_date DESC';
  }

  const limit = parseInt(req.query.limit);
  if (limit > 0 && limit <= 50) {
    sql += ' LIMIT ?';
    params.push(limit);
  }

  try {
    const videos = db.prepare(sql).all(...params);
    const watchedIds = new Set(
      db.prepare('SELECT video_id FROM video_watched WHERE user_id = ?').all(req.session.user.id).map(r => r.video_id)
    );
    res.json(videos.map(v => attachPreviewUrl({
      ...v,
      tags: v.tag_names ? v.tag_names.split(',').map((name, i) => ({
        id: parseInt(v.tag_ids.split(',')[i]),
        name
      })) : [],
      is_watched: watchedIds.has(v.id),
    })));
  } catch (err) {
    console.error('Error fetching videos:', err);
    res.status(500).json({ error: 'Failed to fetch videos' });
  }
});

router.get('/api/videos/:id', requireAuth, (req, res) => {
  try {
    const video = db.prepare(`
      SELECT v.*, u.username AS author_name, u.display_name AS author_display_name,
      c.name AS category_name, c.slug AS category_slug
      FROM videos v LEFT JOIN users u ON v.author_id = u.id
      LEFT JOIN categories c ON v.category_id = c.id WHERE v.id = ?
    `).get(req.params.id);
    
    if (!video) return res.status(404).json({ error: 'Video not found' });

    // Access enforcement (category/custom access + scheduling) — see userCanViewVideo.
    const user = req.session.user;
    const access = userCanViewVideo(video, user);
    if (!access.ok) {
      if (access.reason === 'not_published') {
        // Distinct from a real access-denied — lets the frontend show a friendly "not
        // published yet" panel instead of a blanket "brak dostępu" error page.
        return res.status(403).json({ error: 'Ten film nie został jeszcze opublikowany.', reason: 'not_published', publish_date: video.publish_date });
      }
      return res.status(403).json({ error: 'Brak dostępu do tego filmu.' });
    }

    const tags = db.prepare(`
      SELECT t.* FROM tags t JOIN video_tags vt ON t.id = vt.tag_id WHERE vt.video_id = ?
    `).all(req.params.id);

    // Log watch
    db.prepare('INSERT INTO watch_logs (user_id, video_id) VALUES (?, ?)').run(user.id, video.id);

    res.json({ ...video, tags });
  } catch (err) {
    console.error('Error fetching video:', err);
    res.status(500).json({ error: 'Failed to fetch video' });
  }
});

// Watch Party participants never call GET /api/videos/:id for the video playing in the party
// (they get it via the party's own WebSocket sync), so without this, watch-party viewership
// never reached watch_logs (and thus never showed up in the analytics daily-views chart) — one
// row per participant per video, logged when it becomes the party's current video.
router.post('/api/videos/:id/log-view', requireAuth, (req, res) => {
  try {
    const video = db.prepare('SELECT id, category_id, access_mode, publish_date FROM videos WHERE id = ?').get(req.params.id);
    if (!video) return res.status(404).json({ error: 'Video not found' });
    const user = req.session.user;
    if (!userCanViewVideo(video, user).ok) return res.status(403).json({ error: 'Brak dostępu do tego filmu.' });
    db.prepare(`INSERT INTO watch_logs (user_id, video_id, context) VALUES (?, ?, 'watch_party')`).run(user.id, video.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/videos', requireAdmin, upload.single('thumbnail_file'), (req, res) => {
  try {
    const { title, author_id, main_source, main_source_type, main_source_title,
      thumbnail, mirror1_name, mirror1_url, mirror1_is_embed, mirror1_type, mirror1_is_alt,
      mirror2_name, mirror2_url, mirror2_is_embed, mirror2_type, mirror2_is_alt,
      mirror3_name, mirror3_url, mirror3_type, mirror3_is_alt,
      mirror4_name, mirror4_url, mirror4_type, mirror4_is_alt,
      mirror5_name, mirror5_url, mirror5_type, mirror5_is_alt,
      description, publish_date, tags,
      stream_video_id, drm_enhanced, category_id } = req.body;

    if (!stream_video_id && !(main_source && main_source.trim())) {
      return res.status(400).json({ error: 'Musisz podać główne źródło (link lub przesłany plik).' });
    }

    let thumbUrl = thumbnail || extractYoutubeThumbnail(main_source);
    let customThumb = 0;

    if (req.file) {
      thumbUrl = `/api/uploads/${req.file.filename}`;
      customThumb = 1;
    } else if (thumbnail) {
      customThumb = 1;
    }

    // If self-hosted and has thumbnail from streaming
    if (stream_video_id && !thumbUrl) {
      thumbUrl = `/stream/media/${stream_video_id}/thumb.jpg`;
    }

    const m1t = mirror1_type || (mirror1_is_embed === 'true' || mirror1_is_embed === '1' ? 'embed' : 'link');
    const m2t = mirror2_type || (mirror2_is_embed === 'true' || mirror2_is_embed === '1' ? 'embed' : 'link');
    const m3t = mirror3_type || 'link';
    const m4t = mirror4_type || 'link';
    const m5t = mirror5_type || 'link';

    const result = db.prepare(`
      INSERT INTO videos (title, author_id, main_source, main_source_type, main_source_title, thumbnail, custom_thumbnail,
        mirror1_name, mirror1_url, mirror1_is_embed, mirror1_type, mirror1_is_alt,
        mirror2_name, mirror2_url, mirror2_is_embed, mirror2_type, mirror2_is_alt,
        mirror3_name, mirror3_url, mirror3_type, mirror3_is_alt,
        mirror4_name, mirror4_url, mirror4_type, mirror4_is_alt,
        mirror5_name, mirror5_url, mirror5_type, mirror5_is_alt,
        description, publish_date, stream_video_id, drm_enhanced, category_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(title, parseInt(author_id), main_source || '', main_source_type || 'youtube', main_source_title || '',
      thumbUrl, customThumb,
      mirror1_name || null, mirror1_url || null, m1t === 'embed' ? 1 : 0, m1t, mirror1_is_alt === 'true' || mirror1_is_alt === '1' ? 1 : 0,
      mirror2_name || null, mirror2_url || null, m2t === 'embed' ? 1 : 0, m2t, mirror2_is_alt === 'true' || mirror2_is_alt === '1' ? 1 : 0,
      mirror3_name || null, mirror3_url || null, m3t, mirror3_is_alt === 'true' || mirror3_is_alt === '1' ? 1 : 0,
      mirror4_name || null, mirror4_url || null, m4t, mirror4_is_alt === 'true' || mirror4_is_alt === '1' ? 1 : 0,
      mirror5_name || null, mirror5_url || null, m5t, mirror5_is_alt === 'true' || mirror5_is_alt === '1' ? 1 : 0,
      description || '', publish_date,
      stream_video_id || null, drm_enhanced === 'true' || drm_enhanced === '1' ? 1 : 0,
      category_id ? parseInt(category_id) : null);

    const videoId = result.lastInsertRowid;

    audit(req.session.user.id, "create", "video", videoId, title);
    // Mark self-hosted videos as transcoding
    if (stream_video_id) {
      db.prepare(`UPDATE videos SET stream_status = 'transcoding' WHERE id = ?`).run(videoId);
    }

    // Webhook logic:
    // - Self-hosted (transcoding) → webhook_sent stays NULL → background interval sends after transcode
    // - YouTube with future date → webhook_sent stays NULL → background interval sends when date arrives
    // - YouTube with current/past date → send webhook immediately
    if (!stream_video_id) {
      const pubDate = new Date(publish_date);
      if (pubDate.getTime() <= Date.now()) {
        const videoFull = db.prepare(`
          SELECT v.*, c.name AS category_name, c.webhook_url, c.webhook_template,
          c.webhook_enabled, c.email_enabled, c.push_enabled,
          u.display_name AS author_name FROM videos v
          LEFT JOIN categories c ON v.category_id = c.id
          LEFT JOIN users u ON v.author_id = u.id WHERE v.id = ?
        `).get(videoId);
        if (videoFull) {
          db.prepare("UPDATE videos SET webhook_sent = 1 WHERE id = ?").run(videoId);
          if (videoFull.webhook_enabled && videoFull.webhook_url) {
            console.log(`[WEBHOOK] Immediate send for "${title}" (cat: ${videoFull.category_name})`);
            sendDiscordWebhook(videoFull).catch(e => console.error('[WEBHOOK] Error:', e.message));
          } else {
            console.log(`[WEBHOOK] Disabled/no URL for "${title}" — skipped`);
          }
          if (videoFull.email_enabled) {
            sendCategoryEmailNotifications(videoFull).catch(e => console.error('[EMAIL] Error:', e.message));
          }
          if (videoFull.push_enabled) {
            sendCategoryPushNotifications(videoFull).catch(e => console.error('[PUSH] Error:', e.message));
          }
          notifyCategoryOfNewVideo(videoFull);
        }
      } else {
        console.log(`[WEBHOOK] Scheduled "${title}" for ${publish_date} — webhook will fire later`);
      }
    } else {
      console.log(`[WEBHOOK] Self-hosted "${title}" — webhook after transcoding completes`);
    }
    // Self-hosted/scheduled: webhook_sent stays NULL → picked up by background interval

    // Handle tags
    if (tags) {
      const tagList = JSON.parse(tags);
      for (const tag of tagList) {
        let tagId;
        if (tag.id) {
          tagId = tag.id;
        } else {
          const existing = db.prepare('SELECT id FROM tags WHERE name = ?').get(tag.name);
          if (existing) {
            tagId = existing.id;
          } else {
            const r = db.prepare('INSERT INTO tags (name) VALUES (?)').run(tag.name);
            tagId = r.lastInsertRowid;
          }
        }
        db.prepare('INSERT OR IGNORE INTO video_tags (video_id, tag_id) VALUES (?, ?)').run(videoId, tagId);
      }
    }

    res.json({ success: true, id: videoId });
  } catch (err) {
    console.error('Error creating video:', err);
    res.status(500).json({ error: 'Failed to create video' });
  }
});

router.put('/api/videos/:id', requireAdmin, upload.single('thumbnail_file'), (req, res) => {
  try {
    const { title, author_id, main_source, main_source_type, main_source_title,
      thumbnail, mirror1_name, mirror1_url, mirror1_is_embed, mirror1_type, mirror1_is_alt,
      mirror2_name, mirror2_url, mirror2_is_embed, mirror2_type, mirror2_is_alt,
      mirror3_name, mirror3_url, mirror3_type, mirror3_is_alt,
      mirror4_name, mirror4_url, mirror4_type, mirror4_is_alt,
      mirror5_name, mirror5_url, mirror5_type, mirror5_is_alt,
      description, publish_date, tags,
      category_id, stream_video_id, drm_enhanced, access_mode, allowed_users } = req.body;

    const existing = db.prepare('SELECT * FROM videos WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Video not found' });

    const effectiveStream = stream_video_id || existing.stream_video_id;
    if (!effectiveStream && !(main_source && main_source.trim())) {
      return res.status(400).json({ error: 'Musisz podać główne źródło (link lub przesłany plik).' });
    }

    let thumbUrl = thumbnail || existing.thumbnail;
    let customThumb = existing.custom_thumbnail;

    if (req.file) {
      thumbUrl = `/api/uploads/${req.file.filename}`;
      customThumb = 1;
    } else if (thumbnail && thumbnail !== existing.thumbnail) {
      customThumb = thumbnail ? 1 : 0;
      if (!thumbnail) thumbUrl = extractYoutubeThumbnail(main_source || existing.main_source);
    }

    const m1type = mirror1_type || (mirror1_is_embed === 'true' || mirror1_is_embed === '1' ? 'embed' : 'link');
    const m2type = mirror2_type || (mirror2_is_embed === 'true' || mirror2_is_embed === '1' ? 'embed' : 'link');
    const m3type = mirror3_type || 'link';
    const m4type = mirror4_type || 'link';
    const m5type = mirror5_type || 'link';

    db.prepare(`
      UPDATE videos SET title=?, author_id=?, main_source=?, main_source_type=?, main_source_title=?, thumbnail=?, custom_thumbnail=?,
        mirror1_name=?, mirror1_url=?, mirror1_is_embed=?, mirror1_type=?, mirror1_is_alt=?,
        mirror2_name=?, mirror2_url=?, mirror2_is_embed=?, mirror2_type=?, mirror2_is_alt=?,
        mirror3_name=?, mirror3_url=?, mirror3_type=?, mirror3_is_alt=?,
        mirror4_name=?, mirror4_url=?, mirror4_type=?, mirror4_is_alt=?,
        mirror5_name=?, mirror5_url=?, mirror5_type=?, mirror5_is_alt=?,
        description=?, publish_date=?, category_id=?, stream_video_id=?, drm_enhanced=?, access_mode=?,
        updated_at=datetime('now') WHERE id=?
    `).run(title, parseInt(author_id), main_source, main_source_type || 'youtube', main_source_title || '',
      thumbUrl, customThumb,
      mirror1_name || null, mirror1_url || null, m1type === 'embed' ? 1 : 0, m1type, mirror1_is_alt === 'true' || mirror1_is_alt === '1' ? 1 : 0,
      mirror2_name || null, mirror2_url || null, m2type === 'embed' ? 1 : 0, m2type, mirror2_is_alt === 'true' || mirror2_is_alt === '1' ? 1 : 0,
      mirror3_name || null, mirror3_url || null, m3type, mirror3_is_alt === 'true' || mirror3_is_alt === '1' ? 1 : 0,
      mirror4_name || null, mirror4_url || null, m4type, mirror4_is_alt === 'true' || mirror4_is_alt === '1' ? 1 : 0,
      mirror5_name || null, mirror5_url || null, m5type, mirror5_is_alt === 'true' || mirror5_is_alt === '1' ? 1 : 0,
      description || '', publish_date,
      category_id ? parseInt(category_id) : null,
      stream_video_id || existing.stream_video_id || null,
      drm_enhanced === 'true' || drm_enhanced === '1' ? 1 : 0,
      access_mode || existing.access_mode || 'category',
      req.params.id);

    // Update per-video access if custom mode
    if (access_mode === 'custom' && allowed_users) {
      db.prepare('DELETE FROM video_access WHERE video_id = ?').run(req.params.id);
      const userIds = JSON.parse(allowed_users);
      const stmt = db.prepare('INSERT OR IGNORE INTO video_access (video_id, user_id) VALUES (?, ?)');
      userIds.forEach(uid => stmt.run(req.params.id, uid));
    } else if (access_mode === 'category') {
      db.prepare('DELETE FROM video_access WHERE video_id = ?').run(req.params.id);
    }

    // Update tags
    db.prepare('DELETE FROM video_tags WHERE video_id = ?').run(req.params.id);
    if (tags) {
      const tagList = JSON.parse(tags);
      for (const tag of tagList) {
        let tagId;
        if (tag.id) {
          tagId = tag.id;
        } else {
          const ex = db.prepare('SELECT id FROM tags WHERE name = ?').get(tag.name);
          if (ex) {
            tagId = ex.id;
          } else {
            const r = db.prepare('INSERT INTO tags (name) VALUES (?)').run(tag.name);
            tagId = r.lastInsertRowid;
          }
        }
        db.prepare('INSERT OR IGNORE INTO video_tags (video_id, tag_id) VALUES (?, ?)').run(req.params.id, tagId);
      }
    }

    // Build detailed audit diff
    const changes = [];
    if (title !== existing.title) changes.push(`tytuł: "${existing.title}" → "${title}"`);
    if (parseInt(author_id) !== existing.author_id) { const oldA = db.prepare('SELECT display_name,username FROM users WHERE id=?').get(existing.author_id); const newA = db.prepare('SELECT display_name,username FROM users WHERE id=?').get(parseInt(author_id)); changes.push(`autor: "${oldA?.display_name||oldA?.username||'?'}" → "${newA?.display_name||newA?.username||'?'}"`); }
    if (main_source !== existing.main_source) changes.push(`źródło: "${(existing.main_source||'').slice(0,60)}" → "${(main_source||'').slice(0,60)}"`);
    if ((main_source_type||'youtube') !== (existing.main_source_type||'youtube')) changes.push(`typ źródła: ${existing.main_source_type} → ${main_source_type}`);
    if ((description||'') !== (existing.description||'')) changes.push(`opis zmieniony`);
    if (publish_date !== existing.publish_date) changes.push(`data: ${existing.publish_date} → ${publish_date}`);
    if ((mirror1_url||'') !== (existing.mirror1_url||'')) changes.push(`mirror1: "${(existing.mirror1_url||'brak').slice(0,50)}" → "${(mirror1_url||'brak').slice(0,50)}"`);
    if ((mirror2_url||'') !== (existing.mirror2_url||'')) changes.push(`mirror2: "${(existing.mirror2_url||'brak').slice(0,50)}" → "${(mirror2_url||'brak').slice(0,50)}"`);
    if ((mirror3_url||'') !== (existing.mirror3_url||'')) changes.push(`mirror3: "${(existing.mirror3_url||'brak').slice(0,50)}" → "${(mirror3_url||'brak').slice(0,50)}"`);
    if ((mirror4_url||'') !== (existing.mirror4_url||'')) changes.push(`mirror4: "${(existing.mirror4_url||'brak').slice(0,50)}" → "${(mirror4_url||'brak').slice(0,50)}"`);
    if ((mirror5_url||'') !== (existing.mirror5_url||'')) changes.push(`mirror5: "${(existing.mirror5_url||'brak').slice(0,50)}" → "${(mirror5_url||'brak').slice(0,50)}"`);
    if ((mirror1_name||'') !== (existing.mirror1_name||'')) changes.push(`mirror1 nazwa: "${existing.mirror1_name||''}" → "${mirror1_name||''}"`);
    if ((mirror2_name||'') !== (existing.mirror2_name||'')) changes.push(`mirror2 nazwa: "${existing.mirror2_name||''}" → "${mirror2_name||''}"`);
    if ((mirror3_name||'') !== (existing.mirror3_name||'')) changes.push(`mirror3 nazwa: "${existing.mirror3_name||''}" → "${mirror3_name||''}"`);
    if ((mirror4_name||'') !== (existing.mirror4_name||'')) changes.push(`mirror4 nazwa: "${existing.mirror4_name||''}" → "${mirror4_name||''}"`);
    if ((mirror5_name||'') !== (existing.mirror5_name||'')) changes.push(`mirror5 nazwa: "${existing.mirror5_name||''}" → "${mirror5_name||''}"`);
    if (category_id && parseInt(category_id) !== existing.category_id) { const oldC = existing.category_id ? db.prepare('SELECT name FROM categories WHERE id=?').get(existing.category_id)?.name : 'brak'; const newC = db.prepare('SELECT name FROM categories WHERE id=?').get(parseInt(category_id))?.name || '?'; changes.push(`kategoria: "${oldC}" → "${newC}"`); }
    if (thumbUrl !== existing.thumbnail) changes.push(`miniatura zmieniona`);
    audit(req.session.user.id, "edit", "video", parseInt(req.params.id), changes.length ? changes.join('; ') : `edycja filmu "${title}"`);
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating video:', err);
    res.status(500).json({ error: 'Failed to update video' });
  }
});

// Swaps the main source with a mirror slot in place — e.g. promote a self-hosted mirror to main
// and demote the old YouTube main down to that mirror slot — without re-uploading anything.
// Only 'link' (YouTube) and 'streamer' (self-hosted) mirrors are eligible: those are the only two
// mirror types with a first-class main-source equivalent. 'embed'/'plex' mirrors have no main
// representation (the edit form's main-source toggle only offers YouTube/self-hosted, and would
// silently clobber main_source_type back to one of those on the next unrelated save), so promoting
// them would only work until someone next saves the edit form.
router.put('/api/videos/:id/promote-source', requireAdmin, (req, res) => {
  try {
    const slot = parseInt(req.body?.slot, 10);
    if (![1, 2, 3, 4, 5].includes(slot)) return res.status(400).json({ error: 'Nieprawidłowy slot mirrora.' });

    const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(req.params.id);
    if (!video) return res.status(404).json({ error: 'Nie znaleziono filmu.' });

    const mirrorUrl = video[`mirror${slot}_url`];
    const mirrorType = video[`mirror${slot}_type`] || (video[`mirror${slot}_is_embed`] ? 'embed' : 'link');
    const mirrorName = video[`mirror${slot}_name`];
    if (!mirrorUrl) return res.status(400).json({ error: 'Ten mirror jest pusty.' });
    if (mirrorType !== 'link' && mirrorType !== 'streamer') {
      return res.status(400).json({ error: 'Tylko mirrory typu Link/YouTube lub Upload można ustawić jako główne źródło.' });
    }

    const oldMain = {
      source: video.main_source, type: video.main_source_type || 'youtube',
      title: video.main_source_title, streamId: video.stream_video_id,
    };

    // New main takes over the mirror's content.
    const newMain = mirrorType === 'streamer'
      ? { source: mirrorUrl, type: 'selfhosted', title: mirrorName || 'Self-hosted', streamId: mirrorUrl.replace('self-hosted:', ''), status: 'ready' }
      : { source: mirrorUrl, type: 'youtube', title: mirrorName || 'YouTube', streamId: null, status: null };

    // The old main slides down into the vacated mirror slot.
    const newMirror = oldMain.type === 'selfhosted'
      ? { name: oldMain.title || 'Self-hosted', url: oldMain.source, type: 'streamer' }
      : { name: oldMain.title || 'YouTube', url: oldMain.source, type: 'link' };

    // Only mirror1/mirror2 carry the legacy _is_embed column (mirror3-5 were added later, with
    // just _type) — the UPDATE must omit that clause for slots 3-5 or SQLite errors on it.
    const hasIsEmbedColumn = slot === 1 || slot === 2;
    db.prepare(`
      UPDATE videos SET
        main_source = ?, main_source_type = ?, main_source_title = ?, stream_video_id = ?, stream_status = ?,
        mirror${slot}_name = ?, mirror${slot}_url = ?, mirror${slot}_type = ?${hasIsEmbedColumn ? `, mirror${slot}_is_embed = 0` : ''},
        updated_at = datetime('now')
      WHERE id = ?
    `).run(
      newMain.source, newMain.type, newMain.title, newMain.streamId, newMain.status,
      newMirror.name, newMirror.url, newMirror.type,
      req.params.id
    );

    audit(req.session.user.id, 'edit', 'video', parseInt(req.params.id),
      `zamieniono główne źródło (${oldMain.type}) z mirrorem ${slot} (${mirrorType})`);
    res.json({ success: true });
  } catch (err) {
    console.error('Error promoting mirror source:', err);
    res.status(500).json({ error: 'Failed to promote source' });
  }
});

router.delete('/api/videos/:id', requireAdmin, (req, res) => {
  try {
    const vid = db.prepare('SELECT title FROM videos WHERE id = ?').get(req.params.id);
    db.prepare('DELETE FROM videos WHERE id = ?').run(req.params.id);
    audit(req.session.user.id, "delete", "video", parseInt(req.params.id), vid?.title || "");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete video' });
  }
});

// ============ VIDEO ACCESS API ============
router.get('/api/videos/:id/access', requireAdmin, (req, res) => {
  try {
    const users = db.prepare('SELECT u.id, u.username, u.display_name FROM video_access va JOIN users u ON va.user_id = u.id WHERE va.video_id = ?').all(req.params.id);
    const video = db.prepare('SELECT access_mode FROM videos WHERE id = ?').get(req.params.id);
    res.json({ access_mode: video?.access_mode || 'category', users });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/videos/:id/access', requireAdmin, (req, res) => {
  try {
    const { access_mode, user_ids } = req.body;
    db.prepare('UPDATE videos SET access_mode = ? WHERE id = ?').run(access_mode || 'category', req.params.id);
    if (access_mode === 'custom') {
      db.prepare('DELETE FROM video_access WHERE video_id = ?').run(req.params.id);
      if (user_ids && user_ids.length > 0) {
        const stmt = db.prepare('INSERT OR IGNORE INTO video_access (video_id, user_id) VALUES (?, ?)');
        user_ids.forEach(uid => stmt.run(req.params.id, uid));
      }
    } else {
      db.prepare('DELETE FROM video_access WHERE video_id = ?').run(req.params.id);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ BULK ACTIONS API ============
router.post('/api/videos/bulk', requireAdmin, (req, res) => {
  try {
    const { action, video_ids, value } = req.body;
    if (!video_ids || !Array.isArray(video_ids) || video_ids.length === 0) {
      return res.status(400).json({ error: 'No videos selected' });
    }
    const safeIds = video_ids.map(id => parseInt(id, 10)).filter(id => Number.isInteger(id) && id > 0);
    if (safeIds.length === 0) return res.status(400).json({ error: 'No valid video IDs' });
    const placeholders = safeIds.map(() => '?').join(',');
    let changes = 0;

    switch (action) {
      case 'change_category':
        changes = db.prepare(`UPDATE videos SET category_id = ? WHERE id IN (${placeholders})`).run(value || null, ...safeIds).changes;
        break;
      case 'change_author':
        if (!value) return res.status(400).json({ error: 'Author ID required' });
        changes = db.prepare(`UPDATE videos SET author_id = ? WHERE id IN (${placeholders})`).run(parseInt(value), ...safeIds).changes;
        break;
      case 'change_access':
        changes = db.prepare(`UPDATE videos SET access_mode = ? WHERE id IN (${placeholders})`).run(value || 'category', ...safeIds).changes;
        break;
      case 'delete':
        changes = db.prepare(`DELETE FROM videos WHERE id IN (${placeholders})`).run(...safeIds).changes;
        break;
      default:
        return res.status(400).json({ error: 'Unknown action' });
    }
    res.json({ success: true, changes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
