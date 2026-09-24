const path = require('path');

// Try loading .env from multiple possible locations
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config(); // cwd fallback

const http = require('http');
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const fs = require('fs');
const { setupWatchPartyWS } = require('./watchParty');
const { setupNotificationsWS } = require('./notifications');

// Config first: it validates secrets/env and creates data dirs before anything else loads.
const { PORT, SESSION_SECRET, IFRAME_ORIGIN_RE, behindHttps, uploadsDir } = require('./lib/config');
const db = require('./db');
const { apiLimiter } = require('./lib/rateLimits');
const { sessionStore } = require('./lib/sessions');
const { getSetting } = require('./lib/settings');
const { resolveWatchPartyVideo } = require('./lib/access');
const { startBackgroundJobs } = require('./jobs');

const app = express();

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Increase timeout for large video uploads (30 min)
app.use('/api/stream/upload', (req, res, next) => {
  req.setTimeout(30 * 60 * 1000);
  res.setTimeout(30 * 60 * 1000);
  next();
});

// CRITICAL: trust reverse proxy (nginx, traefik, etc.) so req.protocol / req.ip work
app.set('trust proxy', 1);

// DRM security headers — restrict screen capture APIs
app.use((req, res, next) => {
  // Permissions-Policy: deny display capture for the whole page
  res.set('Permissions-Policy', 'display-capture=(), screen-wake-lock=()');
  // X-Frame-Options does not support allowlists; rely on CSP frame-ancestors for modern browsers
  res.set('X-Frame-Options', 'SAMEORIGIN');
  // Read fresh each request (DB-backed settings, toggleable from Dev Tools without a restart)
  const iframeEnabled = getSetting('iframe_embed_enabled', '0') === '1';
  const iframeAllowedOrigins = getSetting('iframe_allowed_origins', '')
    .split(',')
    .map(o => o.trim())
    .filter(o => IFRAME_ORIGIN_RE.test(o));
  if (iframeEnabled && iframeAllowedOrigins.length > 0) {
    // Allow embedding from same origin and the configured allowed origins
    res.set('Content-Security-Policy', `frame-ancestors 'self' ${iframeAllowedOrigins.join(' ')}`);
  } else {
    // Block all cross-origin embedding
    res.set('Content-Security-Policy', "frame-ancestors 'self'");
  }
  next();
});

app.use(session({
  // SQLite-backed (lib/sessions.js); in test mode the default in-memory store is used
  store: sessionStore,
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    secure: behindHttps,       // true when behind HTTPS reverse proxy
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax'
  }
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || false,
  credentials: true,
}));

// Global API rate limit
app.use(apiLimiter);

// === CSRF protection ===
// Require a custom header on all state-changing API requests. Browsers do not allow
// setting custom headers on cross-origin requests without a CORS preflight, and our
// CORS policy does not whitelist other origins — so a malicious site cannot forge
// these requests with the victim's cookies. Safe (GET/HEAD/OPTIONS) methods and the
// GET-based Discord OAuth redirects are unaffected.
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (!req.path.startsWith('/api/')) return next();
  if (req.get('X-Requested-With') !== 'XMLHttpRequest') {
    return res.status(403).json({ error: 'Brak nagłówka X-Requested-With (ochrona CSRF).' });
  }
  next();
});

// Serve uploaded thumbnails
app.use('/api/uploads', express.static(uploadsDir));

// ============ API ROUTES ============
// Each file in routes/ is an express.Router holding the full /api/... paths it serves. They're
// mounted in the order their routes appeared in the old single-file server.js, so
// first-match-wins resolution between overlapping patterns is unchanged.
const ROUTES = [
  'system', 'watchParty', 'notifications', 'auth', 'teamspeak', 'tos', 'setup', 'videos', 'tags',
  'categories', 'ranks', 'authors', 'users', 'logs', 'favorites', 'analytics', 'stats', 'profile',
  'push', 'gdpr', 'debug', 'settings', 'stream', 'comments', 'progress',
];
for (const name of ROUTES) app.use(require(`./routes/${name}`));

// ============ DASHBOARD INTEGRATION (dash.alleria.pl) ============
require('./integrations')(app, db);

// ============ SERVE FRONTEND ============
const frontendPath = path.join(__dirname, '..', 'frontend', 'dist');
if (!fs.existsSync(frontendPath)) {
  console.warn(`⚠️  Frontend build not found at ${frontendPath}`);
  console.warn('   Run "cd frontend && npm run build" first, or use Docker.\n');
}
app.use(express.static(frontendPath));
app.get('*', (req, res) => {
  const indexPath = path.join(frontendPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.sendFile(indexPath);
  } else {
    res.status(503).send('<h1>ALLERIA FILMY</h1><p>Frontend not built. Run <code>cd frontend && npm run build</code></p>');
  }
});

const httpServer = http.createServer(app);
// Both WSS instances are created with `noServer: true` (see their setup functions) — a single
// shared 'upgrade' listener here dispatches by pathname instead of each attaching its own,
// which would otherwise fight over the same event (see the comment in watchParty.js).
const watchPartyWss = setupWatchPartyWS(db, resolveWatchPartyVideo);
const notificationsWss = setupNotificationsWS(db);
httpServer.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname === '/ws/watch-party') {
    watchPartyWss.handleUpgrade(req, socket, head, (ws) => watchPartyWss.emit('connection', ws, req));
  } else if (pathname === '/ws/notifications') {
    notificationsWss.handleUpgrade(req, socket, head, (ws) => notificationsWss.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

// Export for the API test suite (tests/) — supertest drives `app` directly.
// The server only starts listening when this file is run directly (node server.js).
module.exports = { app, db, httpServer };

if (require.main === module) httpServer.listen(PORT, '0.0.0.0', () => {
  const rUri = process.env.DISCORD_REDIRECT_URI || '';
  const rUriOk = rUri.includes('/auth/discord/callback');
  console.log('\n========================================');
  console.log('  ALLERIA FILMY');
  console.log('========================================');
  console.log(`  Port:              ${PORT}`);
  console.log(`  Environment:       ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Frontend:          ${fs.existsSync(frontendPath) ? '✅ Built' : '❌ Not found'}`);
  console.log(`  HTTPS detected:    ${behindHttps ? '✅ Yes (secure cookies ON)' : '⚪ No (local/HTTP)'}`);
  console.log(`  Trust proxy:       ✅ Enabled`);
  console.log('  ─────────────────────────────────────');
  console.log(`  Discord OAuth:     ${process.env.DISCORD_CLIENT_ID ? '✅ Configured' : '❌ Missing DISCORD_CLIENT_ID'}`);
  console.log(`  Discord Bot:       ${process.env.DISCORD_BOT_TOKEN ? '✅ Configured' : '❌ Missing DISCORD_BOT_TOKEN'}`);
  console.log(`  Discord Guild:     ${process.env.DISCORD_GUILD_ID ? '✅ Configured' : '❌ Missing DISCORD_GUILD_ID'}`);
  console.log(`  Redirect URI:      ${rUri || '❌ Not set'} ${rUri && !rUriOk ? '🚨 WRONG! Must include /api/' : rUri ? '✅' : ''}`);
  console.log(`  Member Role ID:    ${process.env.DISCORD_MEMBER_ROLE_ID || '❌ Not set'}`);
  console.log(`  Admin Role ID:     ${process.env.DISCORD_ADMIN_ROLE_ID || '❌ Not set'}`);
  console.log(`  Dev Role ID:       ${process.env.DISCORD_DEV_ROLE_ID || '❌ Not set'}`);
  if (rUri && !rUriOk) {
    console.log('  ─────────────────────────────────────');
    console.log(`  🚨 REDIRECT URI does not contain /auth/discord/callback`);
    console.log(`     Make sure it matches what is set in Discord Developer Portal`);
  }
  console.log('========================================');
  console.log(`  http://localhost:${PORT}`);
  console.log('========================================\n');

  startBackgroundJobs();
});
