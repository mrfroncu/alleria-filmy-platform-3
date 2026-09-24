const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const db = require('../db');
const { uploadsDir } = require('./config');

// ============ STREAMING PROXY ============
const STREAM_URL = process.env.STREAM_URL || 'http://streaming:4000';

// Recent streaming-service connection errors, surfaced in Dev Tools so a "player unavailable"
// report can be cross-checked without digging through container logs. In-memory only (resets on
// restart) and capped so it can't grow unbounded. Rapid repeats of the same context (e.g. every
// HLS segment failing during an outage) collapse into one entry every few seconds instead of
// flooding the list.
const STREAM_ERROR_LOG_MAX = 50;
const STREAM_ERROR_DEDUPE_MS = 5000;
const streamErrorLog = [];
function logStreamError(context, err) {
  const now = Date.now();
  const last = streamErrorLog[0];
  if (last && last.context === context && now - last._ts < STREAM_ERROR_DEDUPE_MS) return;
  streamErrorLog.unshift({ time: new Date().toISOString(), context, message: err?.message || String(err), _ts: now });
  if (streamErrorLog.length > STREAM_ERROR_LOG_MAX) streamErrorLog.length = STREAM_ERROR_LOG_MAX;
}

// Network-level failure (service down/unreachable) vs. an application error response from the
// streaming service itself — lets the token endpoint respond with a generic, friendly "temporarily
// unavailable" message instead of leaking connection internals like ECONNREFUSED/host/port.
function isStreamUnreachable(err) {
  const code = err?.cause?.code || err?.code;
  return code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT' || err?.name === 'AbortError';
}

// Copies a self-hosted video's auto-generated thumb.jpg from the streaming server down to this
// server's own uploads dir (same place a manually-uploaded thumbnail already lives) and repoints
// the DB at the local copy — so the thumbnail keeps working even if the streaming server later
// goes offline, instead of staying a live proxy fetch to it forever. No-op (silently) if the
// streaming service doesn't have the file yet, or is unreachable — just retried on a later tick.
// Top-level (not nested in the listen() callback) so both the poll loop below and the manual
// regenerate-thumbnail route can call it.
async function pullThumbnailLocally(video) {
  try {
    const r = await fetch(`${STREAM_URL}/media/${video.stream_video_id}/thumb.jpg`);
    if (!r.ok) return false;
    const buf = Buffer.from(await r.arrayBuffer());
    const filename = `thumb-${video.stream_video_id}.jpg`;
    fs.writeFileSync(path.join(uploadsDir, filename), buf);
    db.prepare("UPDATE videos SET thumbnail = ? WHERE id = ?").run(`/api/uploads/${filename}`, video.id);
    console.log(`[THUMB] Copied local thumbnail for video ${video.id} "${video.title}"`);
    return true;
  } catch (e) { return false; }
}

module.exports = { STREAM_URL, STREAM_ERROR_LOG_MAX, STREAM_ERROR_DEDUPE_MS, streamErrorLog, logStreamError, isStreamUnreachable, pullThumbnailLocally };
