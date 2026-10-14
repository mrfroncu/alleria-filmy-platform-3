const fetch = require('node-fetch');
const { logLogin } = require('./helpers');

// ============ CLOUDFLARE TURNSTILE (CAPTCHA) ============
// Guards the START of a TeamSpeak login (POST /api/auth/teamspeak[3]) — that step makes the
// ServerQuery bot walk every connected client and message a code to each one on the caller's IP,
// so it's the expensive, spammable part. Discord and Authentik don't need it: their own login
// pages already sit in front of us.
//
// The browser renders the widget with TURNSTILE_SITE_KEY and sends the token it gets back as
// `turnstileToken`; we check it once against Cloudflare's siteverify endpoint with
// TURNSTILE_SECRET_KEY. Tokens are single-use and expire after 5 minutes, so the login page
// resets the widget after every attempt.
//   https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
//
// Env-only, read on every request (like Authentik): TURNSTILE_ENABLED=true plus both keys.
// The flag on with a key missing counts as off — a half-configured captcha would otherwise
// lock everyone out of TS login — and logs a warning at boot.

const DEFAULT_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const VERIFY_TIMEOUT_MS = 10000;
const MAX_TOKEN_LENGTH = 2048; // Cloudflare's documented upper bound

const flagOn = () => /^(1|true|yes)$/i.test(String(process.env.TURNSTILE_ENABLED || '').trim());
const siteKey = () => (process.env.TURNSTILE_SITE_KEY || '').trim();
const secretKey = () => (process.env.TURNSTILE_SECRET_KEY || '').trim();

function isTurnstileEnabled() {
  return flagOn() && !!siteKey() && !!secretKey();
}

// Public — the login page needs it to render the widget. null when the captcha is off.
function turnstileSiteKey() {
  return isTurnstileEnabled() ? siteKey() : null;
}

if (flagOn() && !isTurnstileEnabled()) {
  console.warn('\n⚠️  WARNING: TURNSTILE_ENABLED=true, but TURNSTILE_SITE_KEY or TURNSTILE_SECRET_KEY is missing.');
  console.warn('   TeamSpeak login runs WITHOUT a captcha until both keys are set.\n');
}

// Returns { ok: true } or { ok: false, status, error, codes? }.
async function verifyTurnstileToken(token, remoteIp) {
  if (typeof token !== 'string' || !token.trim()) {
    return { ok: false, status: 400, error: 'Potwierdź, że nie jesteś botem (captcha), i spróbuj ponownie.' };
  }
  if (token.length > MAX_TOKEN_LENGTH) {
    return { ok: false, status: 400, error: 'Nieprawidłowy token captcha. Odśwież stronę i spróbuj ponownie.' };
  }
  const body = new URLSearchParams({ secret: secretKey(), response: token });
  if (remoteIp) body.set('remoteip', remoteIp);
  let data;
  try {
    const r = await fetch((process.env.TURNSTILE_VERIFY_URL || '').trim() || DEFAULT_VERIFY_URL, {
      method: 'POST', body, timeout: VERIFY_TIMEOUT_MS,
    });
    data = await r.json();
  } catch (e) {
    console.log(`[Turnstile] siteverify failed: ${e.message}`);
    return { ok: false, status: 503, error: 'Nie udało się sprawdzić captchy. Spróbuj ponownie za chwilę.' };
  }
  if (data && data.success === true) return { ok: true };
  const codes = Array.isArray(data?.['error-codes']) ? data['error-codes'] : [];
  // A wrong/missing secret is our misconfiguration, not the user's fault — say so in the log.
  if (codes.some(c => c === 'invalid-input-secret' || c === 'missing-input-secret')) {
    console.error('[Turnstile] Cloudflare rejected TURNSTILE_SECRET_KEY — check .env');
  }
  const expired = codes.includes('timeout-or-duplicate');
  return {
    ok: false, status: 403, codes,
    error: expired
      ? 'Captcha wygasła. Potwierdź ją jeszcze raz i spróbuj ponownie.'
      : 'Weryfikacja captcha nie powiodła się. Spróbuj ponownie.',
  };
}

// Express middleware for the TS login start routes. Skipped when the captcha is off, and for
// account linking from the profile page (`linkMode` + an existing session) — that caller is
// already logged in. `captcha: true` in the error body lets the frontend show the message as-is
// instead of running it through the TS-specific error parser.
function requireTurnstile(method) {
  return async (req, res, next) => {
    if (!isTurnstileEnabled()) return next();
    if (req.body?.linkMode === true && req.session?.user) return next();
    const clientIp = req.ip || req.socket.remoteAddress;
    const result = await verifyTurnstileToken(req.body?.turnstileToken, clientIp.replace('::ffff:', ''));
    if (result.ok) return next();
    logLogin(null, 'unknown', method, clientIp, 0, `Captcha failed${result.codes?.length ? ` (${result.codes.join(', ')})` : ''}`);
    res.status(result.status).json({ error: result.error, captcha: true });
  };
}

module.exports = { isTurnstileEnabled, turnstileSiteKey, verifyTurnstileToken, requireTurnstile };
