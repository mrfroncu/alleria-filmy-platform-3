const express = require('express');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { CAST_TOKEN_TTL_MS, requireAdmin, requireAuth, requireAuthOrCastToken, requireDev, signCastToken } = require('../lib/auth');
const { STREAM_SECRET, chunksDir } = require('../lib/config');
const { STREAM_URL, isStreamUnreachable, logStreamError, pullThumbnailLocally, streamErrorLog } = require('../lib/stream');
const { audit } = require('../lib/helpers');
const { chunkUpload } = require('../lib/uploads');
const { resolveStreamVideoForUser } = require('../lib/access');

const router = express.Router();

router.get('/api/debug/stream-errors', requireDev, (req, res) => {
  res.json({ errors: streamErrorLog.map(({ _ts, ...e }) => e) });
});

// Step 1: Initialize chunked upload — returns upload_id
router.post('/api/stream/upload/init', requireAdmin, (req, res) => {
  const { filename, filesize, total_chunks, drm_enhanced } = req.body;
  if (!filename || !total_chunks) return res.status(400).json({ error: 'Missing params' });
  const safeFilename = (filename || 'upload.mp4').replace(/[^a-zA-Z0-9._\-\s]/g, '_').replace(/\r|\n/g, '').slice(0, 255);
  const uploadId = uuidv4();
  const uploadDir = path.join(chunksDir, uploadId);
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.writeFileSync(path.join(uploadDir, 'meta.json'), JSON.stringify({
    filename: safeFilename, filesize: parseInt(filesize) || 0, total_chunks: parseInt(total_chunks),
    drm_enhanced: drm_enhanced === 'true' || drm_enhanced === true,
    received: [], created: Date.now()
  }));
  console.log(`[CHUNK] Upload init: ${uploadId} — ${safeFilename} (${total_chunks} chunks, ${(parseInt(filesize) / 1024 / 1024).toFixed(1)} MB)`);
  res.json({ success: true, upload_id: uploadId });
});

// Step 2: Upload individual chunk
router.post('/api/stream/upload/chunk', requireAdmin, chunkUpload.single('chunk'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No chunk data' });
  const { upload_id, chunk_index } = req.body;
  if (!upload_id || chunk_index === undefined) {
    try { fs.unlinkSync(req.file.path); } catch (e) {}
    return res.status(400).json({ error: 'Missing upload_id or chunk_index' });
  }

  // Validate upload_id is a safe UUID to prevent path traversal
  if (!upload_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(upload_id)) {
    try { fs.unlinkSync(req.file.path); } catch (e) {}
    return res.status(400).json({ error: 'Invalid upload_id' });
  }
  const resolvedUploadDir = path.resolve(chunksDir, upload_id);
  if (!resolvedUploadDir.startsWith(path.resolve(chunksDir) + path.sep)) {
    try { fs.unlinkSync(req.file.path); } catch (e) {}
    return res.status(400).json({ error: 'Invalid upload_id' });
  }

  const uploadDir = path.join(chunksDir, upload_id);
  const metaPath = path.join(uploadDir, 'meta.json');
  if (!fs.existsSync(metaPath)) {
    try { fs.unlinkSync(req.file.path); } catch (e) {}
    return res.status(404).json({ error: 'Upload not found' });
  }

  // Move chunk to upload dir
  const chunkPath = path.join(uploadDir, `chunk_${String(chunk_index).padStart(6, '0')}`);
  fs.renameSync(req.file.path, chunkPath);

  // Update meta
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  if (!meta.received.includes(parseInt(chunk_index))) {
    meta.received.push(parseInt(chunk_index));
  }
  fs.writeFileSync(metaPath, JSON.stringify(meta));

  console.log(`[CHUNK] ${upload_id}: chunk ${chunk_index}/${meta.total_chunks - 1} received (${meta.received.length}/${meta.total_chunks})`);
  res.json({ success: true, received: meta.received.length, total: meta.total_chunks });
});

// Step 3: Complete — assemble chunks and forward to streaming service
router.post('/api/stream/upload/complete', requireAdmin, async (req, res) => {
  const { upload_id } = req.body;
  if (!upload_id) return res.status(400).json({ error: 'Missing upload_id' });

  // Validate upload_id is a safe UUID to prevent path traversal
  if (!upload_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(upload_id)) {
    return res.status(400).json({ error: 'Invalid upload_id' });
  }
  const resolvedUploadDir = path.resolve(chunksDir, upload_id);
  if (!resolvedUploadDir.startsWith(path.resolve(chunksDir) + path.sep)) {
    return res.status(400).json({ error: 'Invalid upload_id' });
  }

  const uploadDir = path.join(chunksDir, upload_id);
  const metaPath = path.join(uploadDir, 'meta.json');
  if (!fs.existsSync(metaPath)) return res.status(404).json({ error: 'Upload not found' });

  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  if (meta.received.length < meta.total_chunks) {
    return res.status(400).json({ error: `Missing chunks: got ${meta.received.length}/${meta.total_chunks}` });
  }

  // Assemble chunks into single file
  const assembledPath = path.join(chunksDir, `${upload_id}_assembled`);
  console.log(`[CHUNK] Assembling ${meta.total_chunks} chunks for ${upload_id}...`);

  try {
    await new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(assembledPath);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);

      let i = 0;
      const pipeNext = () => {
        if (i >= meta.total_chunks) { writeStream.end(); return; }
        const chunkPath = path.join(uploadDir, `chunk_${String(i).padStart(6, '0')}`);
        if (!fs.existsSync(chunkPath)) { writeStream.destroy(new Error(`Chunk ${i} missing`)); return; }
        const readStream = fs.createReadStream(chunkPath);
        readStream.on('error', err => writeStream.destroy(err));
        readStream.on('end', () => { i++; pipeNext(); });
        readStream.pipe(writeStream, { end: false });
      };
      pipeNext();
    });

    const fileSize = fs.statSync(assembledPath).size;
    console.log(`[CHUNK] Assembled: ${(fileSize / 1024 / 1024).toFixed(1)} MB — forwarding to streaming service in background...`);

    // Pre-generate video_id so we can respond immediately without waiting for the transfer
    const { v4: uuidv4 } = require('uuid');
    const videoId = uuidv4();

    // Respond to the frontend immediately — transfer to streaming service happens in background
    res.json({ success: true, video_id: videoId, status: 'uploading' });

    // Background upload to streaming service
    setImmediate(async () => {
      try {
        const { PassThrough } = require('stream');
        const boundary = '----AlleriaBoundary' + Date.now();
        const safeFilename = (meta.filename || 'upload.mp4').replace(/[^a-zA-Z0-9._\-\s]/g, '_').replace(/\r|\n/g, '').slice(0, 255);
        const preamble = Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="video"; filename="${safeFilename}"\r\nContent-Type: video/mp4\r\n\r\n`
        );
        const epilogue = Buffer.from(
          `\r\n--${boundary}\r\nContent-Disposition: form-data; name="drm_enhanced"\r\n\r\n${meta.drm_enhanced ? 'true' : 'false'}\r\n--${boundary}\r\nContent-Disposition: form-data; name="video_id"\r\n\r\n${videoId}\r\n--${boundary}--\r\n`
        );

        const bodyStream = new PassThrough();
        bodyStream.write(preamble);
        const fileStream = fs.createReadStream(assembledPath);
        fileStream.on('data', chunk => bodyStream.write(chunk));
        fileStream.on('end', () => { bodyStream.write(epilogue); bodyStream.end(); });
        fileStream.on('error', err => bodyStream.destroy(err));

        const streamRes = await fetch(`${STREAM_URL}/upload`, {
          method: 'POST',
          headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'X-Stream-Token': STREAM_SECRET,
          },
          body: bodyStream,
          duplex: 'half',
        });

        const data = await streamRes.json();
        console.log(`[CHUNK] ✅ Transfer complete: ${upload_id} → stream ${data.video_id || 'error'}`);
      } catch (err) {
        console.error(`[CHUNK] ❌ Background transfer failed: ${upload_id}:`, err.message);
      } finally {
        try { fs.rmSync(uploadDir, { recursive: true }); } catch (e) {}
        try { fs.unlinkSync(assembledPath); } catch (e) {}
      }
    });
  } catch (err) {
    console.error(`[CHUNK] Error completing ${upload_id}:`, err);
    try { fs.rmSync(uploadDir, { recursive: true }); } catch (e) {}
    try { fs.unlinkSync(assembledPath); } catch (e) {}
    res.status(500).json({ error: 'Assembly/upload failed: ' + err.message });
  }
});

// Get transcode status
router.get('/api/stream/status/:videoId', requireAdmin, async (req, res) => {
  try {
    const r = await fetch(`${STREAM_URL}/status/${req.params.videoId}`, {
      headers: { 'X-Stream-Token': STREAM_SECRET }
    });
    res.json(await r.json());
  } catch (err) {
    logStreamError('status', err);
    res.status(500).json({ error: err.message });
  }
});

// Manually re-derives a self-hosted video's thumbnail from its own encrypted HLS output (the raw
// upload is long gone by now) and immediately pulls the fresh copy down locally — for videos whose
// auto-thumbnail generation failed originally, or that just need a different frame.
router.post('/api/videos/:id/regenerate-thumbnail', requireAdmin, async (req, res) => {
  try {
    const video = db.prepare('SELECT id, title, stream_video_id, main_source_type FROM videos WHERE id = ?').get(req.params.id);
    if (!video) return res.status(404).json({ error: 'Nie znaleziono filmu.' });
    if (video.main_source_type !== 'selfhosted' || !video.stream_video_id) {
      return res.status(400).json({ error: 'Regeneracja miniaturki dostępna tylko dla filmów hostowanych na własnym serwerze.' });
    }
    const r = await fetch(`${STREAM_URL}/regenerate-thumbnail/${video.stream_video_id}`, {
      method: 'POST', headers: { 'X-Stream-Token': STREAM_SECRET },
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);

    const pulled = await pullThumbnailLocally(video);
    if (!pulled) return res.status(500).json({ error: 'Miniaturka wygenerowana, ale nie udało się jej pobrać lokalnie. Spróbuj ponownie za chwilę.' });

    audit(req.session.user.id, 'edit', 'video', video.id, `zregenerowano miniaturkę filmu "${video.title}"`);
    const updated = db.prepare('SELECT thumbnail FROM videos WHERE id = ?').get(video.id);
    res.json({ success: true, thumbnail: updated.thumbnail });
  } catch (err) {
    logStreamError('regenerate-thumbnail', err);
    res.status(500).json({ error: 'Nie udało się zregenerować miniaturki. Spróbuj ponownie.' });
  }
});

// Generate playback token for user
router.get('/api/stream/token/:videoId', requireAuth, async (req, res) => {
  try {
    const check = resolveStreamVideoForUser(req.params.videoId, req.session.user);
    if (!check.ok) return res.status(check.status).json({ error: check.error });

    // A mirror can be published (and pass the access check above) while its own
    // self-hosted encode is still running — surface that as a distinct "not ready" state
    // instead of letting the player fail on a manifest that doesn't exist yet, so the
    // frontend can show a real "still transcoding, check back later" panel.
    try {
      const statusRes = await fetch(`${STREAM_URL}/status/${req.params.videoId}`, {
        headers: { 'X-Stream-Token': STREAM_SECRET },
      });
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        if (statusData.status === 'error') {
          // A real, terminal failure — never going to become "ready" on its own, so this
          // must NOT go through the "still transcoding, check back later" path below (that
          // would poll forever showing a bogus progress bar). Falls into SecurePlayer's
          // normal error panel instead, which already offers a mirror switcher.
          console.error(`[STREAM] Video ${req.params.videoId} transcode error: ${statusData.error}`);
          return res.status(500).json({ error: 'Przetwarzanie tego źródła nie powiodło się. Spróbuj innego mirrora lub skontaktuj się z administratorem.' });
        }
        if (statusData.status && statusData.status !== 'ready' && statusData.status !== 'not_found') {
          return res.status(202).json({
            ready: false,
            status: statusData.status,
            progress: statusData.progress || 0,
            quality: statusData.quality || null,
          });
        }
      }
    } catch (_) { /* best-effort — fall through and let the token/playback path surface any real error */ }

    const r = await fetch(`${STREAM_URL}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Stream-Token': STREAM_SECRET },
      body: JSON.stringify({ video_id: req.params.videoId, user_id: String(req.session.user.id) })
    });
    const tokenData = await r.json();
    res.json({ ready: true, ...tokenData });
  } catch (err) {
    logStreamError('token', err);
    if (isStreamUnreachable(err)) return res.status(503).json({ error: 'Odtwarzacz jest tymczasowo niedostępny. Spróbuj ponownie za chwilę.' });
    res.status(500).json({ error: 'Nie udało się przygotować odtwarzania. Spróbuj ponownie.' });
  }
});

// Mint a short-lived cast token for Chromecast/AirPlay — lets the receiver device
// fetch /stream/media and /stream/keys directly without the viewer's session cookie.
router.get('/api/stream/cast-token/:videoId', requireAuth, (req, res) => {
  const check = resolveStreamVideoForUser(req.params.videoId, req.session.user);
  if (!check.ok) return res.status(check.status).json({ error: check.error });
  const uid = String(req.session.user.id);
  const expires = Date.now() + CAST_TOKEN_TTL_MS;
  const castToken = signCastToken(req.params.videoId, uid, expires);
  res.json({ castToken, uid, expires });
});

// Proxy stream media & keys (so streaming container is never exposed publicly).
// requireAuthOrCastToken lets a request through either with a live session, or with a
// cast token minted by /api/stream/cast-token above (already access-checked at mint time,
// and scoped to one videoId+uid+short expiry) — so we only need to re-check category/
// custom access here for the session-cookie path; a valid cast token is proof enough.
router.get('/stream/keys/*', requireAuthOrCastToken, async (req, res) => {
  try {
    const streamVideoId = (req.params[0] || '').split('/')[0];
    if (req.session.user) {
      const check = resolveStreamVideoForUser(streamVideoId, req.session.user);
      if (!check.ok) return res.status(check.status).send(check.error);
    }
    const url = `${STREAM_URL}/keys/${req.params[0]}?t=${req.query.t || ''}&uid=${req.query.uid || ''}`;
    const r = await fetch(url);
    // Explicit no-store on the miss path — Cloudflare caches by file extension when no
    // Cache-Control is present at all, including error responses, so a key requested one
    // second before it exists would otherwise 404 at the edge for hours afterward too.
    if (!r.ok) { res.set('Cache-Control', 'no-store'); return res.status(r.status).send('Key error'); }
    const buf = await r.arrayBuffer();
    res.set({ 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.send(Buffer.from(buf));
  } catch (err) {
    logStreamError('keys', err);
    res.status(500).send('Key proxy error');
  }
});

router.get('/stream/media/*', requireAuthOrCastToken, async (req, res) => {
  try {
    const streamVideoId = (req.params[0] || '').split('/')[0];
    if (req.session.user) {
      const check = resolveStreamVideoForUser(streamVideoId, req.session.user);
      if (!check.ok) return res.status(check.status).send(check.error);
    }
    const url = `${STREAM_URL}/media/${req.params[0]}`;
    const r = await fetch(url);
    // Explicit no-store on the miss path — without ANY Cache-Control, Cloudflare falls back to
    // caching by file extension at the edge, including error responses. A thumbnail/segment
    // requested one second before ffmpeg finishes writing it would 404 there forever after —
    // this is exactly the "no thumbnail after upload" bug: generation succeeds, but the very
    // first (premature) request for thumb.jpg gets cached as a 404 for hours, masking the real,
    // now-ready file for everyone since the CDN never revalidates.
    if (!r.ok) { res.set('Cache-Control', 'no-store'); return res.status(r.status).send('Media error'); }

    const contentType = r.headers.get('content-type') || 'application/octet-stream';
    const isPlaylist = req.params[0].endsWith('.m3u8');

    if (isPlaylist) {
      // Rewrite m3u8 key URIs to ensure they work correctly.
      // FFmpeg writes the key URI from keyinfo file into each playlist's EXT-X-KEY line.
      // The URI must be absolute or correctly rooted so HLS.js can resolve it from any
      // playlist depth (e.g. /stream/media/{id}/480p/index.m3u8).
      let body = await r.text();

      // Get the host from request to build absolute URL
      const proto = req.protocol;
      const host = req.get('host');
      const origin = `${proto}://${host}`;

      // Cast (Chromecast/AirPlay) support: the receiver device fetches every playlist,
      // key and segment itself, so unlike hls.js's xhrSetup interception (which only
      // patches key requests in-browser) any auth the request carries must be baked
      // directly into the manifest text. When the incoming request carries the key
      // token (t/uid, normally injected client-side) and/or a cast token (ct/cte), we
      // resolve the EXT-X-KEY placeholders here and propagate the same auth onto every
      // relative playlist/segment reference so the device can fetch them unauthenticated
      // otherwise. Regular in-browser playback never sends these params, so this is a
      // pure no-op for the existing playback path.
      const carry = new URLSearchParams();
      for (const p of ['t', 'uid', 'ct', 'cte']) if (req.query[p]) carry.set(p, req.query[p]);
      const carryQs = carry.toString();

      // Replace any key URI — match the EXT-X-KEY line and rewrite the URI to be absolute
      body = body.replace(
        /URI="([^"]*keys\/[^"]*enc\.key\?[^"]*)"/g,
        (match, uri) => {
          // Already absolute with http/https — just pass through
          let abs = uri;
          if (!(uri.startsWith('http://') || uri.startsWith('https://'))) {
            // Relative or root-relative — make absolute
            const cleanPath = uri.startsWith('/') ? uri : `/stream/keys/${uri.replace(/^.*?keys\//, '')}`;
            abs = `${origin}${cleanPath}`;
          }
          // Resolve the TOKEN_PLACEHOLDER/UID_PLACEHOLDER that ffmpeg baked in, using the
          // real key token carried on this request (device-side casting only — hls.js's
          // xhrSetup already handles this for normal in-browser key fetches).
          if (req.query.t) abs = abs.replace('TOKEN_PLACEHOLDER', req.query.t);
          if (req.query.uid) abs = abs.replace('UID_PLACEHOLDER', String(req.query.uid));
          // Append the cast token so the device's key request clears requireAuthOrCastToken.
          if (carryQs) abs += (abs.includes('?') ? '&' : '?') + carryQs;
          return `URI="${abs}"`;
        }
      );

      // Also handle edge case: URI that has STREAM_HOST placeholder leftover
      body = body.replace(/STREAM_HOST/g, origin);

      // Propagate auth to relative sub-playlist (quality variants) and segment references
      // so a Chromecast/AirPlay receiver's own fetches for them stay authenticated too.
      if (carryQs) {
        const dir = req.params[0].includes('/') ? req.params[0].slice(0, req.params[0].lastIndexOf('/') + 1) : '';
        body = body.split('\n').map(line => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) return line;
          if (!/\.(m3u8|ts)$/i.test(trimmed)) return line;
          if (/^https?:\/\//i.test(trimmed)) return `${trimmed}${trimmed.includes('?') ? '&' : '?'}${carryQs}`;
          const cleanRel = trimmed.startsWith('/') ? trimmed.slice(1) : `${dir}${trimmed}`;
          return `${origin}/stream/media/${cleanRel}?${carryQs}`;
        }).join('\n');
      }

      res.set({ 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-cache' });
      res.send(body);
    } else {
      res.set({ 'Content-Type': contentType, 'Cache-Control': 'public, max-age=3600' });
      const buf = await r.arrayBuffer();
      res.send(Buffer.from(buf));
    }
  } catch (err) {
    logStreamError('media', err);
    res.status(500).send('Media proxy error');
  }
});

// Delete streaming video
router.delete('/api/stream/video/:videoId', requireAdmin, async (req, res) => {
  try {
    const r = await fetch(`${STREAM_URL}/video/${req.params.videoId}`, {
      method: 'DELETE',
      headers: { 'X-Stream-Token': STREAM_SECRET }
    });
    res.json(await r.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Check transcode status for a DB video and update stream_status
router.get('/api/stream/check/:dbVideoId', requireAdmin, async (req, res) => {
  try {
    const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(req.params.dbVideoId);
    if (!video || !video.stream_video_id) return res.json({ status: 'no_stream' });

    const r = await fetch(`${STREAM_URL}/status/${video.stream_video_id}`, {
      headers: { 'X-Stream-Token': STREAM_SECRET }
    });
    const data = await r.json();

    // Update DB status if it changed
    if (data.status === 'ready' && video.stream_status !== 'ready') {
      db.prepare(`UPDATE videos SET stream_status = 'ready' WHERE id = ?`).run(video.id);
      console.log(`[STREAM] Video ${video.id} transcode complete → ready`);
    } else if (data.status === 'error' && video.stream_status !== 'error') {
      db.prepare(`UPDATE videos SET stream_status = 'error' WHERE id = ?`).run(video.id);
    }

    res.json({ ...data, db_status: video.stream_status });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// List all streaming files with DB cross-reference
function buildStreamDbMap() {
  const rows = db.prepare(`
    SELECT id, title, stream_video_id,
      mirror1_url, mirror2_url, mirror3_url, mirror4_url, mirror5_url
    FROM videos
    WHERE stream_video_id IS NOT NULL
      OR mirror1_url LIKE 'self-hosted:%' OR mirror2_url LIKE 'self-hosted:%'
      OR mirror3_url LIKE 'self-hosted:%' OR mirror4_url LIKE 'self-hosted:%'
      OR mirror5_url LIKE 'self-hosted:%'
  `).all();
  const map = new Map();
  for (const v of rows) {
    if (v.stream_video_id) map.set(v.stream_video_id, { id: v.id, title: v.title });
    for (const url of [v.mirror1_url, v.mirror2_url, v.mirror3_url, v.mirror4_url, v.mirror5_url]) {
      if (url) { const m = url.match(/^self-hosted:(.+)$/); if (m) map.set(m[1], { id: v.id, title: v.title }); }
    }
  }
  return map;
}

router.get('/api/stream/files', requireDev, async (req, res) => {
  try {
    const r = await fetch(`${STREAM_URL}/videos`, { headers: { 'X-Stream-Token': STREAM_SECRET } });
    if (!r.ok) throw new Error('Streaming server unreachable');
    const streamVideos = await r.json();
    const dbMap = buildStreamDbMap();
    res.json(streamVideos.map(sv => ({
      video_id: sv.video_id,
      status: sv.status,
      qualities: sv.qualities || [],
      qualityDetails: sv.qualityDetails || [],
      sizeBytes: sv.sizeBytes || 0,
      db_video: dbMap.get(sv.video_id) || null,
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Cleanup orphaned/failed streaming videos
router.get('/api/stream/cleanup', requireDev, async (req, res) => {
  try {
    const r = await fetch(`${STREAM_URL}/videos`, { headers: { 'X-Stream-Token': STREAM_SECRET } });
    if (!r.ok) throw new Error('Streaming server unreachable');
    const streamVideos = await r.json();
    const dbMap = buildStreamDbMap();
    const dbIds = new Set(dbMap.keys());
    const orphans = streamVideos
      .filter(sv => sv.status === 'error' || sv.status === 'unknown' || !dbIds.has(sv.video_id))
      .map(sv => ({ video_id: sv.video_id, status: sv.status, orphaned_from_db: !dbIds.has(sv.video_id) }));
    const dbOrphans = db.prepare("SELECT id, title, stream_video_id, stream_status FROM videos WHERE stream_video_id IS NOT NULL AND (stream_status = 'error' OR stream_status = 'transcoding')").all();
    res.json({ orphans, dbOrphans });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/api/stream/cleanup', requireDev, async (req, res) => {
  try {
    const r = await fetch(`${STREAM_URL}/cleanup/purge`, {
      method: 'POST',
      headers: { 'X-Stream-Token': STREAM_SECRET, 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_ids: req.body.video_ids || [], force: req.body.force }),
    });
    const data = await r.json();
    if (req.body.clean_db) {
      const info = db.prepare("UPDATE videos SET stream_video_id = NULL, stream_status = NULL WHERE stream_status = 'error'").run();
      data.dbCleaned = info.changes;
    }
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Active transcoding jobs from streaming server
router.get('/api/stream/transcoding', requireAdmin, async (req, res) => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const r = await fetch(`${STREAM_URL}/transcoding`, { headers: { 'X-Stream-Token': STREAM_SECRET }, signal: controller.signal });
    clearTimeout(timeout);
    const jobs = await r.json();
    if (!jobs.length) return res.json([]);
    const placeholders = jobs.map(() => '?').join(',');
    const ids = jobs.map(j => j.video_id);
    // Mirror URLs are stored as "self-hosted:<streamId>" (see VideoModal's self-hosted mirror
    // save path), not the bare stream id — comparing mirrorN_url IN (bare ids) never matched,
    // so a transcoding MIRROR (as opposed to the main source) always showed up as "not in DB"
    // in the Dev Tools transcoding panel. Match the mirror columns against the prefixed form.
    const prefixedIds = ids.map(id => `self-hosted:${id}`);
    const dbRows = db.prepare(`
      SELECT id, title, stream_video_id,
        mirror1_url, mirror2_url, mirror3_url, mirror4_url, mirror5_url
      FROM videos
      WHERE stream_video_id IN (${placeholders})
        OR mirror1_url IN (${placeholders}) OR mirror2_url IN (${placeholders})
        OR mirror3_url IN (${placeholders}) OR mirror4_url IN (${placeholders})
        OR mirror5_url IN (${placeholders})
    `).all(...ids, ...prefixedIds, ...prefixedIds, ...prefixedIds, ...prefixedIds, ...prefixedIds);
    const dbMap = new Map();
    for (const v of dbRows) {
      const check = (url) => { if (url) { const m = url.match(/^self-hosted:(.+)$/); if (m) dbMap.set(m[1], { id: v.id, title: v.title }); } };
      if (v.stream_video_id) dbMap.set(v.stream_video_id, { id: v.id, title: v.title });
      [v.mirror1_url, v.mirror2_url, v.mirror3_url, v.mirror4_url, v.mirror5_url].forEach(check);
    }
    res.json(jobs.map(j => ({ ...j, db_video: dbMap.get(j.video_id) || null })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
