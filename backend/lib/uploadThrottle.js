const { Transform } = require('stream');
const { getSetting } = require('./settings');

// Upload bandwidth cap (Mbit/s, 0 = unlimited) for the video-upload pass-through. One bucket is
// shared by every concurrent upload, so the *total* stays under the cap — the point is to leave
// headroom on the VPS's uplink for other services (TeamSpeak etc.). The setting is re-read on
// every chunk of data, so changing it in the panel takes effect mid-upload.
function getUploadLimitMbps() {
  const n = parseFloat(getSetting('upload_limit_mbps', '0'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

let nextFreeAt = 0; // ms timestamp at which the shared link is free to carry the next byte

// Returns how long (ms) the caller must wait before forwarding `bytes`, and reserves that slot.
function reserve(bytes) {
  const mbps = getUploadLimitMbps();
  if (!mbps) return 0;
  const bytesPerMs = (mbps * 1e6) / 8 / 1000;
  const now = Date.now();
  const start = Math.max(now, nextFreeAt);
  nextFreeAt = start + bytes / bytesPerMs;
  return start - now;
}

function createThrottle() {
  return new Transform({
    highWaterMark: 256 * 1024,
    transform(chunk, _enc, cb) {
      const wait = reserve(chunk.length);
      if (wait > 0) setTimeout(() => cb(null, chunk), wait);
      else cb(null, chunk);
    },
  });
}

module.exports = { createThrottle, getUploadLimitMbps };
