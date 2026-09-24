const crypto = require('crypto');
const { SESSION_SECRET } = require('./config');

// ============ AUTH MIDDLEWARE ============
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  if (req.session.user.role !== 'admin' && req.session.user.role !== 'dev') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

function requireDev(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
  if (req.session.user.role !== 'dev') return res.status(403).json({ error: 'Forbidden - Dev only' });
  next();
}

// === Cast (Chromecast/AirPlay) token ===
// Chromecast/AirPlay receivers fetch the manifest, keys and segments themselves,
// device-side — they never see the viewer's session cookie. To let them through
// requireAuth on /stream/media and /stream/keys without weakening those routes for
// everyone, we mint a short-lived, video+user-scoped signed token (HMAC over
// SESSION_SECRET, distinct "cast:" namespace) that a request can present instead of
// a cookie. It expires quickly and only ever authorizes the one video it was minted for.
const CAST_TOKEN_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours — long enough for a movie + credits

function signCastToken(videoId, uid, expires) {
  return crypto.createHmac('sha256', SESSION_SECRET)
    .update(`cast:${videoId}:${uid}:${expires}`).digest('hex').slice(0, 32);
}

function verifyCastToken(videoId, uid, ct, cte) {
  if (!videoId || !uid || !ct || !cte) return false;
  const expires = parseInt(cte, 10);
  if (!Number.isFinite(expires) || Date.now() > expires) return false;
  const expected = signCastToken(videoId, uid, expires);
  const a = Buffer.from(ct);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Same as requireAuth, but also accepts a valid cast token (?ct=&cte=&uid=) in place
// of a session cookie — used only on the device-facing /stream/media and /stream/keys
// routes so Chromecast/AirPlay receivers can authenticate without one.
function requireAuthOrCastToken(req, res, next) {
  if (req.session.user) return next();
  const videoId = (req.params[0] || '').split('/')[0];
  if (verifyCastToken(videoId, req.query.uid, req.query.ct, req.query.cte)) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

module.exports = { requireAuth, requireAdmin, requireDev, CAST_TOKEN_TTL_MS, signCastToken, verifyCastToken, requireAuthOrCastToken };
