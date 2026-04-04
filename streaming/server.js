const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { execSync, spawn } = require('child_process');

const app = express();
app.use(express.json());

// Configurable storage paths — allows hosting files on a separate volume/NFS/Tailscale mount
const DATA_ROOT = process.env.STREAM_DATA_DIR || '/data';
const MEDIA_DIR = process.env.STREAM_MEDIA_DIR || path.join(DATA_ROOT, 'media');
const KEYS_DIR = process.env.STREAM_KEYS_DIR || path.join(DATA_ROOT, 'keys');
const UPLOAD_DIR = process.env.STREAM_UPLOAD_DIR || path.join(DATA_ROOT, 'uploads');

console.log(`[STREAM] Storage paths:`);
console.log(`  Media: ${MEDIA_DIR}`);
console.log(`  Keys:  ${KEYS_DIR}`);
console.log(`  Upload: ${UPLOAD_DIR}`);

[MEDIA_DIR, KEYS_DIR, UPLOAD_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 20 * 1024 * 1024 * 1024 }, // 20GB
  fileFilter: (req, file, cb) => {
    const allowed = /\.(mp4|mkv|avi|mov|webm|wmv|flv|m4v|ts)$/i;
    if (allowed.test(path.extname(file.originalname))) cb(null, true);
    else cb(new Error('Unsupported video format'));
  }
});

// Auth token check — must match the backend's session token
function requireToken(req, res, next) {
  const token = req.headers['x-stream-token'] || req.query.token;
  if (!token || token !== process.env.STREAM_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

// ============ KEY SERVER (AES-128 for HLS) ============
// Keys are only served with valid user token — prevents direct download
app.get('/keys/:videoId/:keyFile', (req, res) => {
  const userToken = req.query.t;
  if (!userToken) return res.status(403).send('Forbidden');

  // Validate token (simple HMAC check)
  const expected = crypto.createHmac('sha256', process.env.STREAM_SECRET || 'secret')
    .update(req.params.videoId + ':' + (req.query.uid || '')).digest('hex').slice(0, 32);

  if (userToken !== expected) return res.status(403).send('Invalid token');

  const keyPath = path.join(KEYS_DIR, req.params.videoId, req.params.keyFile);
  if (!fs.existsSync(keyPath)) return res.status(404).send('Key not found');

  res.set({
    'Content-Type': 'application/octet-stream',
    'Cache-Control': 'no-store, no-cache',
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
  });
  res.sendFile(keyPath);
});

// ============ HLS SEGMENT SERVING ============
app.use('/media', (req, res, next) => {
  res.set({
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Range, X-Stream-Token',
    'Cache-Control': 'public, max-age=3600',
  });
  next();
}, express.static(MEDIA_DIR));

// ============ UPLOAD & TRANSCODE ============
app.post('/upload', requireToken, upload.single('video'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const videoId = uuidv4();
  const enableDrm = req.body.drm_enhanced === 'true';

  console.log(`[STREAM] Upload received: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`[STREAM] Video ID: ${videoId}, Enhanced DRM: ${enableDrm}`);

  // Start transcoding in background
  res.json({
    success: true,
    video_id: videoId,
    status: 'transcoding',
    message: 'Transcode started. Check /status/:videoId for progress.'
  });

  try {
    await transcodeToHLS(req.file.path, videoId, enableDrm);
    console.log(`[STREAM] ✅ Transcode complete: ${videoId}`);
  } catch (err) {
    console.error(`[STREAM] ❌ Transcode failed: ${videoId}`, err.message);
    // Write error status
    const statusPath = path.join(MEDIA_DIR, videoId, 'status.json');
    fs.writeFileSync(statusPath, JSON.stringify({ status: 'error', error: err.message }));
  } finally {
    // Clean up uploaded file
    try { fs.unlinkSync(req.file.path); } catch (e) {}
  }
});

// ============ TRANSCODE STATUS ============
app.get('/status/:videoId', requireToken, (req, res) => {
  const statusPath = path.join(MEDIA_DIR, req.params.videoId, 'status.json');
  if (!fs.existsSync(statusPath)) return res.json({ status: 'not_found' });
  res.json(JSON.parse(fs.readFileSync(statusPath, 'utf8')));
});

// ============ DELETE VIDEO ============
app.delete('/video/:videoId', requireToken, (req, res) => {
  const mediaPath = path.join(MEDIA_DIR, req.params.videoId);
  const keyPath = path.join(KEYS_DIR, req.params.videoId);
  try {
    if (fs.existsSync(mediaPath)) fs.rmSync(mediaPath, { recursive: true });
    if (fs.existsSync(keyPath)) fs.rmSync(keyPath, { recursive: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ GENERATE PLAYBACK TOKEN ============
app.post('/token', requireToken, (req, res) => {
  const { video_id, user_id } = req.body;
  if (!video_id) return res.status(400).json({ error: 'video_id required' });
  const token = crypto.createHmac('sha256', process.env.STREAM_SECRET || 'secret')
    .update(video_id + ':' + (user_id || '')).digest('hex').slice(0, 32);
  res.json({ token, video_id, user_id });
});

// ============ CLEANUP ORPHANED/FAILED VIDEOS ============
app.get('/cleanup/list', requireToken, (req, res) => {
  if (!fs.existsSync(MEDIA_DIR)) return res.json({ orphans: [] });
  const dirs = fs.readdirSync(MEDIA_DIR);
  const orphans = [];
  for (const d of dirs) {
    const statusPath = path.join(MEDIA_DIR, d, 'status.json');
    let status = { status: 'unknown' };
    try { status = JSON.parse(fs.readFileSync(statusPath, 'utf8')); } catch (e) {}
    if (status.status === 'error' || status.status === 'unknown') {
      const stat = fs.statSync(path.join(MEDIA_DIR, d));
      orphans.push({ video_id: d, status: status.status, created: stat.mtime });
    }
  }
  res.json({ orphans });
});

app.post('/cleanup/purge', requireToken, (req, res) => {
  const { video_ids } = req.body; // array of video_ids to delete, or empty = delete all failed
  if (!fs.existsSync(MEDIA_DIR)) return res.json({ deleted: 0 });
  const dirs = fs.readdirSync(MEDIA_DIR);
  let deleted = 0;
  for (const d of dirs) {
    if (video_ids && video_ids.length > 0 && !video_ids.includes(d)) continue;
    const statusPath = path.join(MEDIA_DIR, d, 'status.json');
    let status = { status: 'unknown' };
    try { status = JSON.parse(fs.readFileSync(statusPath, 'utf8')); } catch (e) {}
    if (status.status === 'error' || status.status === 'unknown') {
      try {
        fs.rmSync(path.join(MEDIA_DIR, d), { recursive: true });
        const keyPath = path.join(KEYS_DIR, d);
        if (fs.existsSync(keyPath)) fs.rmSync(keyPath, { recursive: true });
        deleted++;
        console.log(`[CLEANUP] Deleted orphan: ${d}`);
      } catch (e) {}
    }
  }
  res.json({ deleted });
});

// ============ LIST VIDEOS ============
app.get('/videos', requireToken, (req, res) => {
  if (!fs.existsSync(MEDIA_DIR)) return res.json([]);
  const dirs = fs.readdirSync(MEDIA_DIR).filter(d => {
    const statusPath = path.join(MEDIA_DIR, d, 'status.json');
    return fs.existsSync(statusPath);
  });
  const videos = dirs.map(d => {
    const status = JSON.parse(fs.readFileSync(path.join(MEDIA_DIR, d, 'status.json'), 'utf8'));
    return { video_id: d, ...status };
  });
  res.json(videos);
});

// ============ HEALTH & VERSION ============
const { STREAM_VERSION } = require('./versions');
app.get('/health', (req, res) => {
  let ffmpegOk = false;
  try { execSync('ffmpeg -version', { stdio: 'pipe' }); ffmpegOk = true; } catch (e) {}
  res.json({ status: 'ok', ffmpeg: ffmpegOk });
});
app.get('/version', (req, res) => {
  res.json({ version: STREAM_VERSION, component: 'alleria-streaming' });
});

// Storage statistics
app.get('/stats', requireToken, (req, res) => {
  try {
    let totalSize = 0, fileCount = 0, videoCount = 0;
    if (fs.existsSync(MEDIA_DIR)) {
      const dirs = fs.readdirSync(MEDIA_DIR);
      videoCount = dirs.length;
      const countDir = (dir) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) countDir(p);
          else { totalSize += fs.statSync(p).size; fileCount++; }
        }
      };
      countDir(MEDIA_DIR);
    }
    let keysSize = 0;
    if (fs.existsSync(KEYS_DIR)) {
      const countDir = (dir) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          const p = path.join(dir, e.name);
          if (e.isDirectory()) countDir(p);
          else keysSize += fs.statSync(p).size;
        }
      };
      countDir(KEYS_DIR);
    }
    res.json({
      totalSizeBytes: totalSize + keysSize,
      totalSizeGB: ((totalSize + keysSize) / (1024 * 1024 * 1024)).toFixed(2),
      mediaSizeGB: (totalSize / (1024 * 1024 * 1024)).toFixed(2),
      fileCount,
      videoCount,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ TRANSCODE FUNCTION ============
async function transcodeToHLS(inputPath, videoId, enhancedDrm) {
  const outputDir = path.join(MEDIA_DIR, videoId);
  const keyDir = path.join(KEYS_DIR, videoId);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(keyDir, { recursive: true });

  // Write initial status
  const statusPath = path.join(outputDir, 'status.json');
  fs.writeFileSync(statusPath, JSON.stringify({ status: 'transcoding', progress: 0 }));

  // Generate AES-128 encryption key
  const encKey = crypto.randomBytes(16);
  const encIV = crypto.randomBytes(16);
  fs.writeFileSync(path.join(keyDir, 'enc.key'), encKey);

  const keyInfoPath = path.join(keyDir, 'enc.keyinfo');
  // CRITICAL: Key URI in HLS manifests MUST be absolute (https://...) because HLS.js
  // resolves EXT-X-KEY URIs relative to the playlist URL. Without absolute URL,
  // a playlist at /stream/media/{id}/480p/index.m3u8 would resolve a relative key path
  // to /stream/media/{id}/480p/{key-path} which is wrong.
  // The public URL points to the main backend which proxies /stream/keys/* to this service.
  const publicBase = process.env.STREAM_PUBLIC_URL || process.env.ALLOWED_ORIGIN || 'http://localhost:3000';
  // Remove trailing /stream if present — we add our own path
  const baseUrl = publicBase.replace(/\/stream\/?$/, '');
  const keyUri = `${baseUrl}/stream/keys/${videoId}/enc.key?t=TOKEN_PLACEHOLDER&uid=UID_PLACEHOLDER`;
  fs.writeFileSync(keyInfoPath, `${keyUri}\n${path.join(keyDir, 'enc.key')}\n${encIV.toString('hex')}`);

  // Quality presets — from highest to lowest
  const qualities = [
    { name: '2160p', height: 2160, bitrate: '15000k', maxrate: '17000k', bufsize: '25000k' },
    { name: '1440p', height: 1440, bitrate: '9000k', maxrate: '10000k', bufsize: '13500k' },
    { name: '1080p', height: 1080, bitrate: '5000k', maxrate: '5500k', bufsize: '7500k' },
    { name: '720p', height: 720, bitrate: '2800k', maxrate: '3000k', bufsize: '4200k' },
    { name: '480p', height: 480, bitrate: '1400k', maxrate: '1600k', bufsize: '2100k' },
    { name: '360p', height: 360, bitrate: '800k', maxrate: '900k', bufsize: '1200k' },
  ];

  // Detect source resolution, fps, duration, bitrate
  let sourceHeight = 1080, sourceWidth = 1920, sourceFps = 30, totalDuration = 0;
  try {
    const probeJson = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=height,width,r_frame_rate,bit_rate -show_entries format=duration -of json "${inputPath}"`,
      { encoding: 'utf8' }
    );
    const probe = JSON.parse(probeJson);
    const stream = probe.streams?.[0] || {};
    sourceHeight = parseInt(stream.height) || 1080;
    sourceWidth = parseInt(stream.width) || 1920;
    // Parse frame rate: "60/1" or "30000/1001" format
    if (stream.r_frame_rate) {
      const [num, den] = stream.r_frame_rate.split('/');
      sourceFps = Math.round(parseInt(num) / (parseInt(den) || 1));
    }
    totalDuration = parseFloat(probe.format?.duration) || 0;
    console.log(`[STREAM] Source: ${sourceWidth}x${sourceHeight} @ ${sourceFps}fps, duration: ${Math.round(totalDuration)}s`);
  } catch (e) {
    console.log(`[STREAM] Probe failed, using defaults: ${e.message}`);
  }

  const is60fps = sourceFps >= 50; // 50+ = treat as high fps (50/59.94/60)
  const fpsLabel = is60fps ? `${sourceFps}` : '';

  // Build applicable qualities — only at or below source height
  let applicableQualities = qualities.filter(q => q.height <= sourceHeight);
  if (applicableQualities.length === 0) applicableQualities.push(qualities[qualities.length - 1]);

  // Add "source" quality if source is higher than highest preset
  if (sourceHeight > applicableQualities[0].height) {
    applicableQualities.unshift({
      name: 'source',
      height: sourceHeight,
      width: sourceWidth,
      bitrate: '20000k',
      maxrate: '22000k',
      bufsize: '30000k',
      isSource: true,
    });
  }

  // Transcode each quality with live progress
  const progressPerQuality = Math.floor(90 / applicableQualities.length);

  for (let i = 0; i < applicableQualities.length; i++) {
    const q = applicableQualities[i];
    const qDir = path.join(outputDir, q.name);
    fs.mkdirSync(qDir, { recursive: true });

    const progressBase = Math.round((i / applicableQualities.length) * 90);
    const qualityLabel = q.isSource ? `source (${q.height}p)` : q.name;
    fs.writeFileSync(statusPath, JSON.stringify({ status: 'transcoding', progress: progressBase, quality: qualityLabel }));

    // 60fps: keep original fps for source through 720p, force 30fps for 480p and below
    const keepHighFps = is60fps && q.height >= 720;
    const fpsArgs = keepHighFps ? [] : (is60fps ? ['-r', '30'] : []);

    // Use faster preset for higher resolutions (4K software encoding is very slow)
    const preset = q.height >= 2160 ? 'veryfast' : (q.height >= 1080 ? 'fast' : 'medium');

    const args = [
      '-i', inputPath,
      ...(q.isSource ? [] : ['-vf', `scale=-2:${q.height}`]),
      ...fpsArgs,
      '-c:v', 'libx264', '-preset', preset,
      // Use CRF for source quality (faster, better adaptive bitrate), bitrate for presets
      ...(q.isSource ? ['-crf', '18'] : ['-b:v', q.bitrate, '-maxrate', q.maxrate, '-bufsize', q.bufsize]),
      '-c:a', 'aac', '-b:a', keepHighFps ? '192k' : '128k', '-ac', '2',
      '-af', 'alimiter=limit=0.9:attack=5:release=50',
      '-hls_time', '6',
      '-hls_list_size', '0',
      '-hls_segment_filename', path.join(qDir, 'seg_%04d.ts'),
      '-hls_key_info_file', keyInfoPath,
      '-hls_flags', 'independent_segments',
      '-f', 'hls',
      path.join(qDir, 'index.m3u8'),
      '-y'
    ];

    await runFFmpeg(args, statusPath, progressBase, progressPerQuality, totalDuration);
    console.log(`[STREAM] ✅ ${qualityLabel} done for ${videoId}${keepHighFps ? ' (60fps)' : ''}`);
  }

  // Generate master playlist with fps info
  let master = '#EXTM3U\n#EXT-X-VERSION:3\n';
  for (const q of applicableQualities) {
    const bw = parseInt(q.bitrate) * 1000;
    const w = q.width || Math.round(q.height * 16 / 9);
    const keepHighFps = is60fps && q.height >= 720;
    const fps = keepHighFps ? sourceFps : 30;
    const label = q.isSource ? `source (${q.height}p${keepHighFps ? ` ${sourceFps}fps` : ''})` : `${q.name}${keepHighFps ? ` ${sourceFps}fps` : ''}`;
    master += `#EXT-X-STREAM-INF:BANDWIDTH=${bw},RESOLUTION=${w}x${q.height},FRAME-RATE=${fps},NAME="${label}"\n`;
    master += `${q.name}/index.m3u8\n`;
  }
  fs.writeFileSync(path.join(outputDir, 'master.m3u8'), master);

  // Generate thumbnail from source
  try {
    execSync(`ffmpeg -i "${inputPath}" -ss 00:00:05 -vframes 1 -q:v 3 "${path.join(outputDir, 'thumb.jpg')}" -y`, { stdio: 'pipe' });
  } catch (e) {
    try {
      execSync(`ffmpeg -i "${inputPath}" -ss 00:00:01 -vframes 1 -q:v 3 "${path.join(outputDir, 'thumb.jpg')}" -y`, { stdio: 'pipe' });
    } catch (e2) {}
  }

  // Get duration
  let duration = 0;
  try {
    const d = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${inputPath}"`, { encoding: 'utf8' });
    duration = parseFloat(d.trim()) || 0;
  } catch (e) {}

  // Final status
  fs.writeFileSync(statusPath, JSON.stringify({
    status: 'ready',
    progress: 100,
    qualities: applicableQualities.map(q => q.name),
    encrypted: true,
    enhanced_drm: !!enhancedDrm,
    duration: Math.round(duration),
    has_thumbnail: fs.existsSync(path.join(outputDir, 'thumb.jpg')),
    created_at: new Date().toISOString(),
  }));
}

function runFFmpeg(args, statusPath, progressBase, progressRange, totalDuration) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', d => {
      stderr += d.toString();
      // Parse FFmpeg progress from stderr: time=HH:MM:SS.ss
      if (statusPath && totalDuration > 0) {
        const match = d.toString().match(/time=(\d+):(\d+):(\d+\.\d+)/);
        if (match) {
          const secs = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseFloat(match[3]);
          const pct = Math.min(progressBase + Math.round((secs / totalDuration) * progressRange), progressBase + progressRange);
          try {
            const cur = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
            cur.progress = pct;
            fs.writeFileSync(statusPath, JSON.stringify(cur));
          } catch (e) {}
        }
      }
    });
    proc.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exit ${code}: ${stderr.slice(-500)}`));
    });
    proc.on('error', reject);
  });
}

const PORT = process.env.STREAM_PORT || 4000;
app.listen(PORT, '0.0.0.0', () => {
  let ffmpegOk = false;
  try { execSync('ffmpeg -version', { stdio: 'pipe' }); ffmpegOk = true; } catch (e) {}
  console.log(`\n[STREAM] Alleria Streaming Service on port ${PORT}`);
  console.log(`[STREAM] FFmpeg: ${ffmpegOk ? '✅' : '❌ NOT FOUND'}`);
  console.log(`[STREAM] Media dir: ${MEDIA_DIR}`);
  console.log(`[STREAM] Auth: ${process.env.STREAM_SECRET ? '✅' : '⚠️  STREAM_SECRET not set'}\n`);
});
