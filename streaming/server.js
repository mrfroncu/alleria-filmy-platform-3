const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');
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

  const videoId = req.body.video_id || uuidv4();
  const enableDrm = req.body.drm_enhanced === 'true';
  const wantsTranscription = req.body.transcribe === 'true';

  console.log(`[STREAM] Upload received: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`[STREAM] Video ID: ${videoId}, Enhanced DRM: ${enableDrm}, Transcribe: ${wantsTranscription}`);

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
    // The raw upload is still needed as the transcription source when the checkbox was checked —
    // handed off to the queue, which deletes it once done (success or error) instead of here.
    if (wantsTranscription) {
      enqueueTranscription(videoId, req.file.path);
    } else {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
  }
});

// ============ TRANSCODE STATUS ============
app.get('/status/:videoId', requireToken, (req, res) => {
  const statusPath = path.join(MEDIA_DIR, req.params.videoId, 'status.json');
  if (!fs.existsSync(statusPath)) return res.json({ status: 'not_found' });
  res.json(JSON.parse(fs.readFileSync(statusPath, 'utf8')));
});

// ============ TRANSCRIPTION (offline speech-to-text via whisper.cpp, PL/EN auto-detect) ============
// Runs entirely on this server — no external API, no per-minute cost. Sequential in-memory queue
// (transcoding itself has zero concurrency control today; this at least keeps transcription jobs
// from all fighting each other — and a live transcode — for CPU at once).
const WHISPER_BIN = process.env.WHISPER_BIN || '/opt/whisper/bin/whisper-cli';
const WHISPER_MODEL_PATH = process.env.WHISPER_MODEL_PATH || '/opt/whisper/model.bin';

function readStatus(videoId) {
  const statusPath = path.join(MEDIA_DIR, videoId, 'status.json');
  if (!fs.existsSync(statusPath)) return {};
  try { return JSON.parse(fs.readFileSync(statusPath, 'utf8')); } catch (e) { return {}; }
}
// Merges into the existing status.json rather than overwriting wholesale — transcoding's own
// writes (progress/quality) happen sequentially before transcription ever starts for a given
// video, so there's no concurrent-writer race, but merging keeps this safe regardless.
function patchStatus(videoId, patch) {
  const dir = path.join(MEDIA_DIR, videoId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'status.json'), JSON.stringify({ ...readStatus(videoId), ...patch }));
}

const transcriptionQueue = [];
let transcriptionBusy = false;

function enqueueTranscription(videoId, audioSourcePath) {
  patchStatus(videoId, { transcript_status: 'pending' });
  transcriptionQueue.push({ videoId, audioSourcePath });
  processTranscriptionQueue();
}

async function processTranscriptionQueue() {
  if (transcriptionBusy) return;
  const job = transcriptionQueue.shift();
  if (!job) return;
  transcriptionBusy = true;
  try {
    await runTranscription(job.videoId, job.audioSourcePath);
    console.log(`[STREAM] ✅ Transcription complete: ${job.videoId}`);
  } catch (err) {
    console.error(`[STREAM] ❌ Transcription failed: ${job.videoId}`, err.message);
    patchStatus(job.videoId, { transcript_status: 'error', transcript_error: err.message });
  } finally {
    // audioSourcePath is either the raw upload (large video file — must not leak disk space) or
    // the retroactive path's rewritten index.decrypt.m3u8 (small, but sits inside MEDIA_DIR which
    // is statically served under /media — it embeds a local file:// path to the decryption key,
    // so leaving it in place would expose that path). Both must be removed either way.
    try { fs.unlinkSync(job.audioSourcePath); } catch (e) {}
    transcriptionBusy = false;
    processTranscriptionQueue();
  }
}

function extractAudio(inputPath, wavPath) {
  // protocol_whitelist/allowed_extensions are needed for the retroactive path's rewritten m3u8
  // (its file:// key URI won't open otherwise — verified via a real encode+decrypt round-trip).
  // NOT harmless to apply universally as once assumed: verified with a real run that ffmpeg
  // rejects -allowed_extensions outright ("Option not found") against a plain video file, since
  // it's an HLS-demuxer-specific option the mov/mp4 demuxer doesn't recognize at all.
  const isHls = inputPath.endsWith('.m3u8');
  const hlsFlags = isHls ? '-protocol_whitelist file,crypto,data,http,https,tcp,tls -allowed_extensions ALL ' : '';
  execSync(
    `ffmpeg -y ${hlsFlags}-i "${inputPath}" -ar 16000 -ac 1 -c:a pcm_s16le -vn "${wavPath}"`,
    { stdio: 'pipe' }
  );
}

function runTranscription(videoId, audioSourcePath) {
  return new Promise((resolve, reject) => {
    patchStatus(videoId, { transcript_status: 'processing' });
    const dir = path.join(MEDIA_DIR, videoId);
    fs.mkdirSync(dir, { recursive: true });
    const wavPath = path.join(dir, 'transcript_audio.wav');
    // MUST NOT be "transcript" — whisper-cli's -of appends .json itself, and the final clean
    // output below is written to dir/transcript.json too; same name meant the cleanup unlink
    // right after deleted the very file we'd just written (confirmed with a real end-to-end
    // run: transcript_status ended up 'ready' with the file physically gone, 404 on fetch,
    // silently coerced into 0 segments by the panel poll loop — no error surfaced anywhere).
    const outBase = path.join(dir, 'transcript_raw');

    try {
      extractAudio(audioSourcePath, wavPath);
    } catch (e) {
      return reject(new Error('Audio extraction failed: ' + e.message));
    }

    const wavStat = fs.statSync(wavPath);
    console.log(`[TRANSCRIPT] ${videoId}: extracted audio ${(wavStat.size / 1024 / 1024).toFixed(2)} MB, running whisper-cli...`);

    const args = ['-m', WHISPER_MODEL_PATH, '-f', wavPath, '-l', 'auto', '-np', '-oj', '-of', outBase];
    const proc = spawn(WHISPER_BIN, args);
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('error', err => { try { fs.unlinkSync(wavPath); } catch (e) {} reject(err); });
    proc.on('close', (code) => {
      try { fs.unlinkSync(wavPath); } catch (e) {}
      if (code !== 0) return reject(new Error(`whisper-cli exited ${code}: ${stderr.slice(-500)}`));
      try {
        const raw = JSON.parse(fs.readFileSync(`${outBase}.json`, 'utf8'));
        const segments = (raw.transcription || [])
          .map(t => ({ start: t.offsets.from / 1000, end: t.offsets.to / 1000, text: (t.text || '').trim() }))
          .filter(s => s.text);
        // Logged unconditionally (not just on failure) — a "succeeded but empty" run previously
        // left zero visibility into what whisper actually saw, which is exactly the case that
        // needs diagnosing (silence/VAD-filtered audio vs. a real pipeline bug look identical
        // from the outside otherwise).
        console.log(`[TRANSCRIPT] ${videoId}: whisper detected language=${raw.result?.language || '?'}, ${segments.length} segment(s)`);
        if (segments.length === 0) console.log(`[TRANSCRIPT] ${videoId}: whisper stderr tail: ${stderr.slice(-500)}`);
        fs.writeFileSync(path.join(dir, 'transcript.json'), JSON.stringify({ language: raw.result?.language || null, segments }));
        try { fs.unlinkSync(`${outBase}.json`); } catch (e) {}
        patchStatus(videoId, { transcript_status: 'ready' });
        resolve();
      } catch (e) {
        reject(new Error('Failed to parse whisper output: ' + e.message));
      }
    });
  });
}

// Rewrites an HLS rendition's #EXT-X-KEY URI (and every segment reference) to absolute local
// file:// paths so ffmpeg can decrypt it directly from disk — needed for the retroactive path
// below, where the original raw upload is long gone and the only remaining source is this
// server's own encrypted HLS output. Written to os.tmpdir(), NOT under MEDIA_DIR — that directory
// is statically served at /media, and this rewritten file embeds a local filesystem path to the
// decryption key, so it must never sit anywhere web-reachable even briefly. Verified against this
// exact key/keyinfo generation (see transcodeToHLS above) with a real encode+decrypt round-trip,
// including from a location outside the served directory: ffmpeg needs -protocol_whitelist
// including "file" and -allowed_extensions ALL to accept the rewritten URIs, or it refuses to
// open them.
function decryptedM3u8Path(videoId, qualityName) {
  const qDir = path.join(MEDIA_DIR, videoId, qualityName);
  const original = fs.readFileSync(path.join(qDir, 'index.m3u8'), 'utf8');
  const keyFileAbs = path.join(KEYS_DIR, videoId, 'enc.key');
  const lines = original
    .replace(/URI="[^"]*"/, `URI="file://${keyFileAbs}"`)
    .split('\n')
    .map(line => (line && !line.startsWith('#')) ? `file://${path.join(qDir, line.trim())}` : line);
  const outPath = path.join(os.tmpdir(), `transcribe-${videoId}.m3u8`);
  fs.writeFileSync(outPath, lines.join('\n'));
  return outPath;
}

// Kick off transcription — either for a fresh upload (raw file still on disk, POSTed here by the
// /upload handler below with the checkbox checked) or retroactively for an already-transcoded
// video (reconstructs a local-decryptable audio source from its own smallest HLS rendition, since
// the raw source no longer exists by then).
app.post('/transcribe/:videoId', requireToken, (req, res) => {
  const videoId = req.params.videoId;
  const status = readStatus(videoId);
  if (!status.status) return res.status(404).json({ error: 'Video not found' });
  if (status.status !== 'ready') return res.status(409).json({ error: 'Video is not ready yet' });
  if (status.transcript_status === 'pending' || status.transcript_status === 'processing') {
    return res.json({ success: true, status: status.transcript_status }); // already in flight
  }

  const lowestQuality = (status.qualities || [])[(status.qualities || []).length - 1];
  if (!lowestQuality) return res.status(500).json({ error: 'No renditions available to transcribe from' });

  try {
    const localM3u8 = decryptedM3u8Path(videoId, lowestQuality);
    enqueueTranscription(videoId, localM3u8);
    res.json({ success: true, status: 'pending' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/transcript/:videoId', requireToken, (req, res) => {
  const transcriptPath = path.join(MEDIA_DIR, req.params.videoId, 'transcript.json');
  if (!fs.existsSync(transcriptPath)) return res.status(404).json({ error: 'Transcript not found' });
  res.sendFile(transcriptPath);
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
  const { video_ids, force } = req.body;
  if (!fs.existsSync(MEDIA_DIR)) return res.json({ deleted: 0 });
  const dirs = fs.readdirSync(MEDIA_DIR);
  let deleted = 0;
  for (const d of dirs) {
    if (video_ids && video_ids.length > 0 && !video_ids.includes(d)) continue;
    if (!force) {
      let status = { status: 'unknown' };
      try { status = JSON.parse(fs.readFileSync(path.join(MEDIA_DIR, d, 'status.json'), 'utf8')); } catch (_) {}
      if (status.status !== 'error' && status.status !== 'unknown') continue;
    }
    try {
      fs.rmSync(path.join(MEDIA_DIR, d), { recursive: true });
      const keyPath = path.join(KEYS_DIR, d);
      if (fs.existsSync(keyPath)) fs.rmSync(keyPath, { recursive: true });
      deleted++;
      console.log(`[CLEANUP] Deleted: ${d}${force ? ' (forced)' : ''}`);
    } catch (_) {}
  }
  res.json({ deleted });
});

// ============ LIST VIDEOS ============
app.get('/videos', requireToken, (req, res) => {
  if (!fs.existsSync(MEDIA_DIR)) return res.json([]);
  const dirs = fs.readdirSync(MEDIA_DIR).filter(d => {
    return fs.existsSync(path.join(MEDIA_DIR, d, 'status.json'));
  });

  const getDirSize = (dir) => {
    let size = 0;
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        size += e.isDirectory() ? getDirSize(p) : fs.statSync(p).size;
      }
    } catch (_) {}
    return size;
  };

  const videos = dirs.map(d => {
    const status = JSON.parse(fs.readFileSync(path.join(MEDIA_DIR, d, 'status.json'), 'utf8'));
    const sizeBytes = getDirSize(path.join(MEDIA_DIR, d)) + getDirSize(path.join(KEYS_DIR, d));
    return { video_id: d, ...status, sizeBytes };
  });
  res.json(videos);
});

// ============ ACTIVE TRANSCODING ============
app.get('/transcoding', requireToken, (req, res) => {
  if (!fs.existsSync(MEDIA_DIR)) return res.json([]);
  const result = [];
  for (const d of fs.readdirSync(MEDIA_DIR)) {
    const statusPath = path.join(MEDIA_DIR, d, 'status.json');
    if (!fs.existsSync(statusPath)) continue;
    try {
      const s = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
      if (s.status === 'transcoding')
        result.push({ video_id: d, progress: s.progress || 0, quality: s.quality || null });
    } catch (_) {}
  }
  res.json(result);
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

  // Generate master playlist with fps info — also collect the same per-quality bandwidth/fps
  // numbers into qualityDetails so Dev Tools can show them too (this is the only place these are
  // computed; the ffmpeg -b:v/-maxrate target is never re-measured against the actual output).
  let master = '#EXTM3U\n#EXT-X-VERSION:3\n';
  const qualityDetails = [];
  for (const q of applicableQualities) {
    const bw = parseInt(q.bitrate) * 1000;
    const w = q.width || Math.round(q.height * 16 / 9);
    const keepHighFps = is60fps && q.height >= 720;
    // Mirrors the fpsArgs logic above: fps is only ever forced down to 30 when the source is
    // ≥50fps AND this variant is below 720p (keepHighFps=false); every other variant — including
    // ALL variants of a normal 24/25/30fps source — keeps the untouched source fps, since fpsArgs
    // is [] for them (no -r flag passed to ffmpeg at all). Previously this hardcoded 30 for any
    // non-keepHighFps variant, mislabeling e.g. a 24fps film's segments as FRAME-RATE=30.
    const fps = (is60fps && !keepHighFps) ? 30 : sourceFps;
    const label = q.isSource ? `source (${q.height}p${keepHighFps ? ` ${sourceFps}fps` : ''})` : `${q.name}${keepHighFps ? ` ${sourceFps}fps` : ''}`;
    master += `#EXT-X-STREAM-INF:BANDWIDTH=${bw},RESOLUTION=${w}x${q.height},FRAME-RATE=${fps},NAME="${label}"\n`;
    master += `${q.name}/index.m3u8\n`;
    qualityDetails.push({ name: q.name, height: q.height, width: w, bitrate: bw, fps });
  }
  fs.writeFileSync(path.join(outputDir, 'master.m3u8'), master);

  // Generate thumbnail from source — try a few timestamps before giving up. A short clip (or one
  // with an unreadable frame at a given offset) can fail every attempt except 0:00, which grabs
  // the very first decodable frame and is about as close to "always works" as ffmpeg gets; the
  // final catch logs instead of swallowing, so a total failure is at least visible in the logs
  // rather than silently leaving the video with no thumbnail forever.
  let thumbOk = false;
  let lastThumbErr = null;
  for (const ts of ['00:00:05', '00:00:01', '00:00:00']) {
    try {
      execSync(`ffmpeg -i "${inputPath}" -ss ${ts} -vframes 1 -q:v 3 "${path.join(outputDir, 'thumb.jpg')}" -y`, { stdio: 'pipe' });
      thumbOk = true;
      break;
    } catch (e) { lastThumbErr = e; }
  }
  if (!thumbOk) {
    console.log(`[STREAM] Thumbnail generation failed for ${videoId} at every attempted timestamp: ${lastThumbErr?.message}`);
  }

  // Generate hover-scrub preview sprite (storyboard), like YouTube's thumbnail hover preview.
  // Skipped for very short clips — a handful of seconds isn't worth scrubbing through.
  if (totalDuration >= 30) {
    try {
      const PREVIEW_INTERVAL_TARGET = 10; // seconds between frames, before the frame cap below
      const PREVIEW_MAX_FRAMES = 100; // caps sprite size/ffmpeg cost for very long films
      const frameCount = Math.min(PREVIEW_MAX_FRAMES, Math.max(1, Math.ceil(totalDuration / PREVIEW_INTERVAL_TARGET)));
      const interval = totalDuration / frameCount;
      const cols = Math.ceil(Math.sqrt(frameCount));
      const rows = Math.ceil(frameCount / cols);
      // Individual frames scaled to a fixed width, tiled into one grid image — the frontend reads
      // cells back by percentage (cols/rows), so exact pixel size of the sprite doesn't matter.
      execSync(
        `ffmpeg -i "${inputPath}" -vf "fps=1/${interval},scale=160:-2,tile=${cols}x${rows}" -frames:v 1 -q:v 4 "${path.join(outputDir, 'preview.jpg')}" -y`,
        { stdio: 'pipe' }
      );
      fs.writeFileSync(path.join(outputDir, 'preview.json'), JSON.stringify({ frames: frameCount, cols, rows, interval }));
    } catch (e) {
      console.log(`[STREAM] Preview sprite generation failed for ${videoId}: ${e.message}`);
    }
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
    qualityDetails,
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
