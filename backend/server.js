const path = require('path');

// Try loading .env from multiple possible locations
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config(); // cwd fallback

const http = require('http');
const net = require('net');
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const fetch = require('node-fetch');
const multer = require('multer');
const nodemailer = require('nodemailer');
const webpush = require('web-push');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const crypto = require('crypto');
const { initDB, DB_PATH } = require('./database');
const { DEFAULT_TOS_MD, DEFAULT_TOS_UPDATED_AT } = require('./defaultTos');
const { createParty, getParty, deleteParty, listParties, createWsToken, setupWatchPartyWS, reassignUserIdInParties } = require('./watchParty');
const { createWsToken: createNotificationsWsToken, notifyUser, setupNotificationsWS } = require('./notifications');
const rateLimit = require('express-rate-limit');

// Test mode (set by the API test suite in tests/): disables rate limits and the
// SQLite session store so tests are deterministic and leave no files behind.
const IS_TEST = process.env.NODE_ENV === 'test';

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 80,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zbyt wiele prób logowania. Spróbuj ponownie za 15 minut.' },
  skip: () => IS_TEST,
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 2400,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Zbyt wiele żądań. Zwolnij.' },
  skip: (req) => IS_TEST || req.path.startsWith('/api/watch-party') || req.path.startsWith('/api/logs/watch-party'),
});

const app = express();
const db = initDB();
const PORT = process.env.PORT || 3000;

// === Session & stream secrets (must be set) ===
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) {
  console.error('FATAL: SESSION_SECRET environment variable is not set');
  process.exit(1);
}

const STREAM_SECRET = process.env.STREAM_SECRET;
if (!STREAM_SECRET) {
  console.warn('WARNING: STREAM_SECRET is not set — streaming token verification disabled');
}

// === Startup env validation ===
const REQUIRED_ENV = ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_BOT_TOKEN', 'DISCORD_GUILD_ID', 'DISCORD_MEMBER_ROLE_ID'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.warn('\n⚠️  WARNING: Missing environment variables:');
  missing.forEach(k => console.warn(`   - ${k}`));
  console.warn('   Discord login will NOT work until these are set.\n');
}

// Validate redirect URI
const redirectUri = process.env.DISCORD_REDIRECT_URI || '';
if (redirectUri && !redirectUri.includes('/auth/discord/callback')) {
  console.error('\n🚨 CRITICAL: DISCORD_REDIRECT_URI looks wrong!');
  console.error(`   Current:  ${redirectUri}`);
  console.error('   Expected path: /auth/discord/callback or /api/auth/discord/callback\n');
}

// Ensure uploads dir
const uploadsDir = path.join(__dirname, 'data', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// GDPR/RODO data-export files
const gdprDir = path.join(__dirname, 'data', 'gdpr');
if (!fs.existsSync(gdprDir)) fs.mkdirSync(gdprDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Dozwolone są tylko pliki graficzne (JPG, PNG, GIF, WebP).'), false);
    }
  },
});

// Session store using SQLite
const SQLiteStore = require('connect-sqlite3')(session);

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
const IFRAME_ORIGIN_RE = /^https?:\/\/[^;\s,]+$/;

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

const isProduction = process.env.NODE_ENV === 'production';
const behindHttps = (process.env.DISCORD_REDIRECT_URI || '').startsWith('https://');

// Named so account-merge logic can reach into the store to invalidate a merged-away
// account's live session(s) — see invalidateUserSessions.
const sessionStore = IS_TEST ? undefined : new SQLiteStore({ dir: path.join(__dirname, 'data'), db: 'sessions.db' });

app.use(session({
  // In test mode the default in-memory store is used (no sessions.db on disk)
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

// ============ HEALTH CHECK ============
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    discord_configured: !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET && process.env.DISCORD_BOT_TOKEN),
    discord_client_id_set: !!process.env.DISCORD_CLIENT_ID,
    discord_redirect_uri_set: !!process.env.DISCORD_REDIRECT_URI,
    guild_id_set: !!process.env.DISCORD_GUILD_ID,
    member_role_set: !!process.env.DISCORD_MEMBER_ROLE_ID,
    admin_role_set: !!process.env.DISCORD_ADMIN_ROLE_ID,
    dev_role_set: !!process.env.DISCORD_DEV_ROLE_ID,
  });
});

// Public config for frontend display settings
app.get('/api/config', requireAuth, (req, res) => {
  const s = settingsPayload();
  res.json({
    videosPerPage: s.videos_per_page,
    gridColumns: s.grid_columns,
    gridCardMinWidth: s.grid_card_min_width,
    logsPerPage: s.logs_per_page,
    limitDisplayName: s.limit_display_name,
    limitBio: s.limit_bio,
    limitComment: s.limit_comment,
    showTopBar: s.show_top_bar,
    customYoutubePlayer: s.youtube_custom_player,
    gdprRegion: s.gdpr_region,
  });
});

// Version info
const { VERSION, STREAM_MIN_VERSION } = require('./versions');
app.get('/api/version', requireAuth, (req, res) => {
  res.json({ version: VERSION, streamMinVersion: STREAM_MIN_VERSION, component: 'alleria-filmy' });
});

// === Watch Party ===
app.get('/api/watch-party/token', requireAuth, (req, res) => {
  const token = createWsToken(req.session.user);
  res.json({ token });
});

// ============ IN-APP NOTIFICATIONS ============
app.get('/api/notifications/token', requireAuth, (req, res) => {
  const token = createNotificationsWsToken(req.session.user);
  res.json({ token });
});

app.get('/api/notifications', requireAuth, (req, res) => {
  try {
    const before = parseInt(req.query.before, 10);
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    let where = 'user_id = ?';
    const params = [req.session.user.id];
    if (Number.isInteger(before)) { where += ' AND id < ?'; params.push(before); }
    const notifications = db.prepare(`SELECT * FROM notifications WHERE ${where} ORDER BY id DESC LIMIT ?`).all(...params, limit);
    const unreadCount = db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read = 0').get(req.session.user.id).c;
    res.json({ notifications, unreadCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/notifications/:id/read', requireAuth, (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.session.user.id);
  res.json({ success: true });
});

app.post('/api/notifications/read-all', requireAuth, (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0').run(req.session.user.id);
  res.json({ success: true });
});

app.post('/api/watch-party', requireAuth, (req, res) => {
  const party = createParty(req.session.user);
  res.json({ code: party.code, id: party.id });
});

app.get('/api/watch-party/:code', requireAuth, (req, res) => {
  const party = getParty(req.params.code.toUpperCase());
  if (!party) return res.status(404).json({ error: 'Party not found' });
  res.json({ id: party.id, code: party.code, hostId: party.hostId, memberCount: party.members.size });
});

app.delete('/api/watch-party/:code', requireAuth, (req, res) => {
  const party = getParty(req.params.code.toUpperCase());
  if (!party) return res.status(404).json({ error: 'Party not found' });
  if (party.hostId !== req.session.user.id) return res.status(403).json({ error: 'Not the host' });
  const u = req.session.user;
  deleteParty(req.params.code.toUpperCase(), u.id, u.display_name || u.username);
  res.json({ ok: true });
});

// Compares two "x.y.z" version strings numerically, segment by segment (returns <0, 0, >0).
// Plain string/">=" comparison is wrong here — e.g. "1.9.4" >= "1.10.1" is TRUE as a string
// compare (lexicographic: '9' > '1'), even though 1.9.4 is actually the OLDER version.
function compareVersions(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// Proxy streaming version with compatibility check
app.get('/api/version/streaming', requireAuth, async (req, res) => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const r = await fetch(`${STREAM_URL || 'http://streaming:4000'}/version`, { signal: controller.signal });
    clearTimeout(timeout);
    const data = await r.json();
    const sv = data.version || '0.0.0';
    const isCompat = compareVersions(sv, STREAM_MIN_VERSION) >= 0;
    res.json({ ...data, compatible: isCompat, minVersion: STREAM_MIN_VERSION, status: isCompat ? 'compatible' : 'deprecated' });
  } catch (e) { res.json({ version: 'unavailable', component: 'streaming', status: 'offline' }); }
});

// Streaming storage stats
app.get('/api/stream/stats', requireDev, async (req, res) => {
  try {
    const r = await fetch(`${STREAM_URL}/stats`, { headers: { 'X-Stream-Token': STREAM_SECRET } });
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

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

function getUserRankIds(userId) {
  return db.prepare('SELECT rank_id FROM user_rank_assignments WHERE user_id = ?').all(userId).map(r => r.rank_id);
}

// Parse compound access_mode string → { vm: viewer_mode, em: editor_mode }
// Format: 'viewer_mode:editor_mode'
// viewer_mode: 'public' | 'roles' | 'custom'
// editor_mode: 'none' | 'roles' | 'custom'
function parseCatModes(accessMode) {
  const mode = accessMode || '';
  if (mode.includes(':')) {
    const [vm, em] = mode.split(':');
    return { vm, em };
  }
  // Legacy fallback
  if (mode === 'custom') return { vm: 'custom', em: 'none' };
  if (mode === 'roles') return { vm: 'roles', em: 'roles' };
  return { vm: 'public', em: 'none' };
}

// Check if user has view access to a category (returns {canView, canEdit})
function checkCatAccess(catId, accessMode, userId, userRoles, userRankIds) {
  const { vm, em } = parseCatModes(accessMode);

  let canView = false;
  if (vm === 'public') {
    canView = true;
  } else if (vm === 'roles') {
    const vRoles = db.prepare("SELECT discord_role_id FROM category_access WHERE category_id = ? AND access_type = 'viewer'").all(catId).map(r => r.discord_role_id);
    const vRanks = db.prepare("SELECT rank_id FROM category_rank_access WHERE category_id = ? AND access_type = 'viewer'").all(catId).map(r => r.rank_id);
    canView = userRoles.some(r => vRoles.includes(r)) || userRankIds.some(r => vRanks.includes(r));
  } else if (vm === 'custom') {
    canView = !!db.prepare("SELECT 1 FROM category_user_access WHERE category_id = ? AND user_id = ? AND access_type = 'viewer'").get(catId, userId);
  }

  let canEdit = false;
  if (em === 'roles') {
    const eRoles = db.prepare("SELECT discord_role_id FROM category_access WHERE category_id = ? AND access_type = 'editor'").all(catId).map(r => r.discord_role_id);
    const eRanks = db.prepare("SELECT rank_id FROM category_rank_access WHERE category_id = ? AND access_type = 'editor'").all(catId).map(r => r.rank_id);
    canEdit = userRoles.some(r => eRoles.includes(r)) || userRankIds.some(r => eRanks.includes(r));
  } else if (em === 'custom') {
    canEdit = !!db.prepare("SELECT 1 FROM category_user_access WHERE category_id = ? AND user_id = ? AND access_type = 'editor'").get(catId, userId);
  }

  // Editors can always view
  if (canEdit) canView = true;
  return { canView, canEdit };
}

// ============ DISCORD AUTH ============
function discordRedirectHandler(req, res) {
  if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_REDIRECT_URI) {
    console.error('Discord auth failed: DISCORD_CLIENT_ID or DISCORD_REDIRECT_URI not set');
    return res.redirect('/login?error=config_missing');
  }
  // Save return URL so user gets redirected back after login (validate to prevent open redirect)
  if (req.query.returnTo) {
    const r = String(req.query.returnTo);
    if (r.startsWith('/') && !r.startsWith('//') && !r.includes('\n') && !r.includes('\r') && r.length < 500) {
      req.session.returnTo = r;
    }
  }
  // Track popup flow — used when the app is embedded in an iframe
  const isPopupFlow = req.query.popup === 'true';
  if (isPopupFlow) {
    req.session.popup = true;
  }
  // Account-linking mode: attach the Discord identity to the already-logged-in user on
  // callback instead of logging in as a (possibly different) Discord-origin account.
  // Silently ignored if there's no session to link onto.
  const isLinkMode = req.query.mode === 'link' && !!req.session.user;
  if (isLinkMode) {
    req.session.linkPrimaryUserId = req.session.user.id;
  }
  if (req.query.returnTo || isPopupFlow || isLinkMode) {
    req.session.save(() => {});
  }
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify guilds.members.read email'
  });
  const url = `https://discord.com/api/oauth2/authorize?${params}`;
  console.log('Redirecting to Discord OAuth:', url.replace(process.env.DISCORD_CLIENT_ID, '***'));
  res.redirect(url);
}

// Register on BOTH paths so it works with or without /api/ prefix
app.get('/api/auth/discord', authLimiter, discordRedirectHandler);
app.get('/auth/discord', authLimiter, discordRedirectHandler);

async function discordCallbackHandler(req, res) {
  const { code } = req.query;
  console.log('[AUTH] Discord callback received, code:', code ? 'present' : 'MISSING');
  if (!code) return res.redirect('/login?error=no_code');

  const clientIp = req.ip || req.socket.remoteAddress;

  try {
    // Exchange code for token
    console.log('[AUTH] Exchanging code for token...');
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.DISCORD_REDIRECT_URI
      })
    });
    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error('[AUTH] Token exchange failed:', JSON.stringify(tokenData));
      throw new Error('No access token: ' + (tokenData.error_description || tokenData.error || 'unknown'));
    }
    console.log('[AUTH] Token obtained successfully');

    // Get user info
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const discordUser = await userRes.json();
    console.log('[AUTH] Discord user:', discordUser.username, '(' + discordUser.id + ')');

    // Check guild membership and roles via bot
    const memberRes = await fetch(
      `https://discord.com/api/guilds/${process.env.DISCORD_GUILD_ID}/members/${discordUser.id}`,
      { headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` } }
    );

    if (!memberRes.ok) {
      const errBody = await memberRes.text();
      console.error('[AUTH] Guild member check failed:', memberRes.status, errBody);
      logLogin(null, discordUser.username, 'discord', clientIp, 0, 'Not a guild member');
      return res.redirect('/login?error=not_member');
    }

    const member = await memberRes.json();
    const roles = member.roles || [];
    console.log('[AUTH] User roles:', roles);

    // Check if user has required role — member/admin role IDs are optionally panel-managed
    // (DISCORD_ROLES_CONFIG_SOURCE); the dev role always comes straight from .env, no override.
    const memberRoleId = getDiscordRoleSetting('discord_member_role_id', process.env.DISCORD_MEMBER_ROLE_ID || '');
    const adminRoleId = getDiscordRoleSetting('discord_admin_role_id', process.env.DISCORD_ADMIN_ROLE_ID || '');
    const hasMemberRole = roles.includes(memberRoleId);
    const hasAdminRole = roles.includes(adminRoleId);
    const hasDevRole = roles.includes(process.env.DISCORD_DEV_ROLE_ID);

    console.log('[AUTH] Role check - member:', hasMemberRole, 'admin:', hasAdminRole, 'dev:', hasDevRole);

    if (!hasMemberRole && !hasAdminRole && !hasDevRole) {
      console.warn('[AUTH] User has none of the required roles');
      logLogin(null, discordUser.username, 'discord', clientIp, 0, 'Missing required role');
      return res.redirect('/login?error=no_role');
    }

    let role = 'member';
    if (hasDevRole) role = 'dev';
    else if (hasAdminRole) role = 'admin';

    // Discord avatar hashes — global (account) and per-server (guild, Nitro-only)
    const discordAvatarHash = discordUser.avatar || null;
    const discordGuildAvatarHash = member.avatar || null;
    const discordEmail = discordUser.email || null;

    // Upsert user
    const existing = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(discordUser.id);
    const rolesJson = JSON.stringify(roles);

    // Account-linking mode: attach this Discord identity to the already-logged-in primary
    // account instead of logging in as `existing` (or creating a new row). If `existing`
    // belongs to someone else, hand back a pending-merge token instead of linking directly.
    const linkPrimaryUserId = req.session.linkPrimaryUserId;
    if (linkPrimaryUserId) {
      delete req.session.linkPrimaryUserId;
      if (existing && existing.id !== linkPrimaryUserId) {
        const stats = getMergeStats(existing.id);
        const mergeId = createPendingMerge({
          primaryId: linkPrimaryUserId, secondaryId: existing.id,
          secondaryLabel: `Discord: ${discordUser.username}`, stats, identities: identityList(existing),
        });
        return req.session.save(() => res.redirect(`/profile?mergeId=${mergeId}`));
      }
      const primary = db.prepare('SELECT discord_id FROM users WHERE id = ?').get(linkPrimaryUserId);
      if (!primary) return req.session.save(() => res.redirect('/profile?error=link_failed'));
      if (primary.discord_id && primary.discord_id !== discordUser.id) {
        return req.session.save(() => res.redirect('/profile?error=already_linked_discord'));
      }
      db.prepare(`UPDATE users SET discord_id = ?, discord_roles = ?, discord_avatar_hash = ?, discord_guild_avatar_hash = ?, discord_email = ? WHERE id = ?`)
        .run(discordUser.id, rolesJson, discordAvatarHash, discordGuildAvatarHash, discordEmail, linkPrimaryUserId);
      if (req.session.user) req.session.user.discord_roles = roles;
      audit(linkPrimaryUserId, 'link_account', 'user', linkPrimaryUserId, `linked Discord (${discordUser.username})`);
      return req.session.save(() => res.redirect('/profile?linked=discord'));
    }

    const avatarSource = existing?.avatar_source || 'global';
    const avatarUrl = (avatarSource === 'guild' && discordGuildAvatarHash)
      ? `https://cdn.discordapp.com/guilds/${process.env.DISCORD_GUILD_ID}/users/${discordUser.id}/avatars/${discordGuildAvatarHash}.png`
      : (discordAvatarHash
        ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordAvatarHash}.png`
        : `https://cdn.discordapp.com/embed/avatars/${parseInt(discordUser.discriminator || '0') % 5}.png`);

    let userId;
    if (existing) {
      // Never let this login downgrade a role earned via a different linked identity
      // (e.g. admin/dev via a linked TS3/TS6 account) — see maxRole's comment.
      const finalRole = maxRole(existing.role, role);
      db.prepare(`UPDATE users SET username = ?, display_name = ?, avatar = ?, role = ?, discord_roles = ?, discord_avatar_hash = ?, discord_guild_avatar_hash = ?, discord_email = ?, last_login = datetime('now') WHERE discord_id = ?`)
        .run(discordUser.username, member.nick || discordUser.global_name || discordUser.username, avatarUrl, finalRole, rolesJson, discordAvatarHash, discordGuildAvatarHash, discordEmail, discordUser.id);
      userId = existing.id;
    } else {
      const result = db.prepare('INSERT INTO users (discord_id, username, display_name, avatar, role, auth_method, discord_roles, discord_avatar_hash, discord_guild_avatar_hash, discord_email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(discordUser.id, discordUser.username, member.nick || discordUser.global_name || discordUser.username, avatarUrl, role, 'discord', rolesJson, discordAvatarHash, discordGuildAvatarHash, discordEmail);
      userId = result.lastInsertRowid;
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

    logLogin(userId, discordUser.username, 'discord', clientIp, 1, null);
    console.log('[AUTH] ✅ Login successful:', user.display_name, '(role:', role, ')');
    console.log('[AUTH] Session ID:', req.sessionID);

    // Capture session values before regenerating
    const savedPopup = req.session.popup;
    const savedReturnTo = req.session.returnTo;

    // Regenerate session to prevent session fixation
    req.session.regenerate((err) => {
      if (err) {
        console.error('[AUTH] Session regenerate error:', err);
        return res.redirect('/login?error=auth_failed');
      }
      req.session.user = {
        id: user.id,
        discord_id: user.discord_id,
        username: user.username,
        display_name: user.display_name,
        avatar: user.avatar,
        role: user.role,
        auth_method: 'discord',
        discord_roles: roles
      };
      stampSessionMeta(req);
      // CRITICAL: explicitly save session before redirect to prevent race condition
      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('[AUTH] Session save error:', saveErr);
          return res.redirect('/login?error=auth_failed');
        }
        const isPopup = savedPopup;
        const rawReturnTo = savedReturnTo || '/';
        // Validate returnTo before redirecting
        const returnTo = (rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('//') && !rawReturnTo.includes('\n') && !rawReturnTo.includes('\r') && rawReturnTo.length < 500) ? rawReturnTo : '/';

        if (isPopup) {
          // Serve a minimal page that notifies the opener and closes the popup.
          // Using inline HTML avoids React's auth guards (GuestRoute redirects
          // authenticated users away from /login, preventing the postMessage effect
          // from ever running).
          console.log('[AUTH] Session saved, closing popup and notifying opener');
          return res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><script>try{if(window.opener){window.opener.postMessage({type:'discord_auth_success'},window.location.origin);}window.close();}catch(e){window.close();}</script></body></html>`);
        }

        console.log(`[AUTH] Session saved, redirecting to ${returnTo}`);
        res.redirect(returnTo);
      });
    });

  } catch (err) {
    console.error('[AUTH] Discord auth error:', err);
    logLogin(null, 'unknown', 'discord', clientIp, 0, err.message);
    res.redirect('/login?error=auth_failed');
  }
}

// Register callback on BOTH paths — works whether DISCORD_REDIRECT_URI has /api/ or not
app.get('/api/auth/discord/callback', discordCallbackHandler);
app.get('/auth/discord/callback', discordCallbackHandler);

// ============ ACCOUNT LINKING & MERGE ============
// A logged-in user can attach an additional auth identity (Discord/TeamSpeak) to their
// account from the profile page. If that identity already belongs to a DIFFERENT existing
// account with its own history, linking requires an explicit, irreversible merge: all of
// the secondary account's data moves onto the primary (the account the user was logged
// into when they started linking) and the secondary row is deleted. Like tsChallenges,
// the confirmation step is a short-lived in-memory token — there's no need to persist it.
const pendingMerges = new Map(); // mergeId -> { primaryId, secondaryId, secondaryLabel, stats, identities, expires }
const PENDING_MERGE_TTL_MS = 5 * 60 * 1000;

function createPendingMerge(data) {
  const id = uuidv4();
  pendingMerges.set(id, { ...data, expires: Date.now() + PENDING_MERGE_TTL_MS });
  const t = setTimeout(() => pendingMerges.delete(id), PENDING_MERGE_TTL_MS);
  if (t.unref) t.unref();
  return id;
}

function getPendingMerge(mergeId) {
  const m = pendingMerges.get(mergeId);
  if (!m) return null;
  if (Date.now() > m.expires) { pendingMerges.delete(mergeId); return null; }
  return m;
}

function consumePendingMerge(mergeId) {
  const m = getPendingMerge(mergeId);
  if (m) pendingMerges.delete(mergeId);
  return m;
}

function getMergeStats(userId) {
  return {
    videoCount: db.prepare('SELECT COUNT(*) c FROM watch_logs WHERE user_id = ?').get(userId).c,
    commentCount: db.prepare('SELECT COUNT(*) c FROM comments WHERE user_id = ? AND deleted = 0').get(userId).c,
    favCount: db.prepare('SELECT COUNT(*) c FROM favorites WHERE user_id = ?').get(userId).c,
    authoredCount: db.prepare('SELECT COUNT(*) c FROM videos WHERE author_id = ?').get(userId).c,
  };
}

function identityList(u) {
  return [
    u.discord_id ? 'discord' : null,
    u.ts3_uid ? 'teamspeak3' : null,
    u.ts6_uid ? 'teamspeak' : null,
  ].filter(Boolean);
}

// Regulamin (ToS) — content lives in app_settings (tos_content/tos_updated_at), acceptance is
// per-user (users.tos_accepted_at). Plain ISO-string comparison — both sides are always either
// SQLite's datetime('now') or JS's toISOString(), which sort correctly as strings.
function tosNeedsAcceptance(tosAcceptedAt) {
  const updatedAt = getSetting('tos_updated_at', DEFAULT_TOS_UPDATED_AT);
  return !tosAcceptedAt || tosAcceptedAt < updatedAt;
}

// A linked account can log in via multiple identities (Discord + TS3/TS6), each of which
// independently computes a role from its own source (Discord guild roles, TS server
// groups) every time it logs in. Without this, whichever method logs in LAST wins and
// blindly overwrites the account's role — so an admin-via-Discord account looks like a
// plain member the moment they log in via TS3, and vice versa. Higher privilege should
// carry over regardless of which linked method is used: the stored role only ever moves
// up to what the current login computes, never down. TS3/TS6 can only ever compute
// 'member'/'admin' (no dev group concept exists there), so 'dev' — once granted by an
// actual live Discord role check — is naturally preserved and can never be granted by a
// TS login; a later Discord login without the dev role also won't strip it here (role
// demotion is an explicit admin action elsewhere, not a side effect of logging in).
const ROLE_RANK = { member: 0, admin: 1, dev: 2 };
function maxRole(a, b) {
  return (ROLE_RANK[a] ?? 0) >= (ROLE_RANK[b] ?? 0) ? a : b;
}

// Destroys every live session belonging to userId (used after a merge deletes that user's
// row — sessions aren't re-validated against the DB per request, so without this a merged-away
// account's cookie would keep working with stale data until its natural 7-day expiry).
//
// connect-sqlite3's own `.all(fn)` returns only `JSON.parse(row.sess)` for each row — it
// discards `sid` entirely, so there is no public API that hands back sid+session together.
// We reach into the store's underlying sqlite3.Database connection (`sessionStore.db`,
// `sessionStore.table`) to run the same query connect-sqlite3 itself uses internally
// (see its `.all`/dbCleanup implementation) but keeping `sid` in the result.
function invalidateUserSessions(userId) {
  if (!sessionStore || !sessionStore.db || typeof sessionStore.db.all !== 'function') return;
  sessionStore.db.all(`SELECT sid, sess FROM ${sessionStore.table}`, (err, rows) => {
    if (err || !rows) return;
    for (const row of rows) {
      let sess;
      try { sess = JSON.parse(row.sess); } catch (_) { continue; }
      if (sess?.user?.id === userId) sessionStore.destroy(row.sid, () => {});
    }
  });
}

// Captures device context on the session at login time — express-session itself doesn't
// track this, so without it "Aktywne sesje" would have nothing to show besides a sid.
function stampSessionMeta(req) {
  req.session.ua = req.get('user-agent') || '';
  req.session.ip = req.ip || req.socket.remoteAddress || '';
  req.session.loggedInAt = new Date().toISOString();
}

// Good-enough device label from a raw User-Agent string — not a full parser, just enough
// to tell sessions apart in a list (e.g. "Chrome · Windows").
function parseUserAgent(ua) {
  if (!ua) return 'Nieznane urządzenie';
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Przeglądarka';
  // iPhone/iPad UAs contain "like Mac OS X" for compat, so they must be checked before macOS.
  const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS'
    : /Android/.test(ua) ? 'Android' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} · ${os}` : browser;
}

// Same sessionStore.db reach-around as invalidateUserSessions above, but returns the rows
// instead of destroying them — powers GET /api/profile/sessions.
function listUserSessions(userId) {
  return new Promise((resolve) => {
    if (!sessionStore || !sessionStore.db || typeof sessionStore.db.all !== 'function') return resolve([]);
    sessionStore.db.all(`SELECT sid, sess, expired FROM ${sessionStore.table}`, (err, rows) => {
      if (err || !rows) return resolve([]);
      const out = [];
      for (const row of rows) {
        let sess;
        try { sess = JSON.parse(row.sess); } catch (_) { continue; }
        if (sess?.user?.id !== userId) continue;
        out.push({
          sid: row.sid,
          device: parseUserAgent(sess.ua),
          ip: sess.ip || null,
          loggedInAt: sess.loggedInAt || null,
          expiresAt: row.expired ? new Date(row.expired).toISOString() : null,
        });
      }
      out.sort((a, b) => (b.loggedInAt || '').localeCompare(a.loggedInAt || ''));
      resolve(out);
    });
  });
}

// Moves all of secondaryId's data onto primaryId and deletes the secondary account row.
// Irreversible — callers must have already gotten explicit user confirmation.
function mergeUsers(primaryId, secondaryId, { performedBy } = {}) {
  if (primaryId === secondaryId) throw new Error('Cannot merge an account into itself');
  const primary = db.prepare('SELECT * FROM users WHERE id = ?').get(primaryId);
  const secondary = db.prepare('SELECT * FROM users WHERE id = ?').get(secondaryId);
  if (!primary || !secondary) throw new Error('User not found');

  const run = db.transaction(() => {
    // Append-only tables / simple FK — zero collision risk, blind reassignment.
    // videos.author_id must move before the users row is deleted (plain FK, no ON DELETE).
    for (const [table, col] of [
      ['videos', 'author_id'], ['watch_logs', 'user_id'], ['login_logs', 'user_id'],
      ['audit_logs', 'user_id'], ['comments', 'user_id'],
    ]) {
      db.prepare(`UPDATE ${table} SET ${col} = ? WHERE ${col} = ?`).run(primaryId, secondaryId);
    }
    db.prepare('UPDATE watch_party_logs SET user_id = ? WHERE user_id = ?').run(primaryId, secondaryId);
    db.prepare('UPDATE watch_party_logs SET target_user_id = ? WHERE target_user_id = ?').run(primaryId, secondaryId);

    // Composite-PK "membership" tables — the data is binary (has/doesn't have), so on
    // collision just drop the secondary's redundant row, then reassign what's left.
    for (const [table, keyCol] of [
      ['favorites', 'video_id'], ['video_access', 'video_id'],
      ['category_user_access', 'category_id'], ['user_rank_assignments', 'rank_id'],
    ]) {
      db.prepare(`DELETE FROM ${table} WHERE user_id = ? AND ${keyCol} IN (SELECT ${keyCol} FROM ${table} WHERE user_id = ?)`)
        .run(secondaryId, primaryId);
      db.prepare(`UPDATE ${table} SET user_id = ? WHERE user_id = ?`).run(primaryId, secondaryId);
    }

    // watch_progress isn't binary — position/duration differ meaningfully, so on collision
    // keep whichever row was updated more recently.
    for (const row of db.prepare('SELECT * FROM watch_progress WHERE user_id = ?').all(secondaryId)) {
      const existing = db.prepare('SELECT * FROM watch_progress WHERE user_id = ? AND video_id = ?').get(primaryId, row.video_id);
      if (!existing) {
        db.prepare('UPDATE watch_progress SET user_id = ? WHERE user_id = ? AND video_id = ?').run(primaryId, secondaryId, row.video_id);
      } else if (new Date(row.updated_at) > new Date(existing.updated_at)) {
        db.prepare('UPDATE watch_progress SET position = ?, duration = ?, updated_at = ? WHERE user_id = ? AND video_id = ?')
          .run(row.position, row.duration, row.updated_at, primaryId, row.video_id);
        db.prepare('DELETE FROM watch_progress WHERE user_id = ? AND video_id = ?').run(secondaryId, row.video_id);
      } else {
        db.prepare('DELETE FROM watch_progress WHERE user_id = ? AND video_id = ?').run(secondaryId, row.video_id);
      }
    }

    // Secondary must be gone BEFORE we copy its identity columns onto primary below — the
    // identity columns being copied (discord_id/ts3_uid/ts6_uid) are exactly what's UNIQUE
    // and still held by secondary's still-existing row would collide with, would violate
    // the UNIQUE index if primary were updated first (that ordering was the original bug:
    // "UNIQUE constraint failed: users.ts_uid").
    db.prepare('DELETE FROM users WHERE id = ?').run(secondaryId);

    // Identity columns — copy onto primary only what it doesn't already have. If primary
    // already has an identity of this type, secondary's is intentionally dropped (the user
    // saw this coming via `identities` in the merge confirmation payload).
    const patch = {};
    if (!primary.discord_id && secondary.discord_id) {
      Object.assign(patch, {
        discord_id: secondary.discord_id,
        discord_roles: secondary.discord_roles,
        discord_avatar_hash: secondary.discord_avatar_hash,
        discord_guild_avatar_hash: secondary.discord_guild_avatar_hash,
        discord_email: secondary.discord_email,
      });
    }
    if (!primary.ts3_uid && secondary.ts3_uid) {
      Object.assign(patch, { ts3_uid: secondary.ts3_uid, ts3_ip: secondary.ts3_ip });
    }
    if (!primary.ts6_uid && secondary.ts6_uid) {
      Object.assign(patch, { ts6_uid: secondary.ts6_uid, ts6_ip: secondary.ts6_ip });
    }
    // Contact email is a general field, not tied to one identity type — keep primary's own
    // if it already set one (manually or via Discord), otherwise inherit secondary's along
    // with whatever notification preference was attached to it.
    if (!primary.email && secondary.email) {
      Object.assign(patch, { email: secondary.email, email_notifications: secondary.email_notifications });
    }
    if (Object.keys(patch).length) {
      const cols = Object.keys(patch);
      db.prepare(`UPDATE users SET ${cols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`)
        .run(...cols.map(c => patch[c]), primaryId);
    }

    audit(performedBy ?? primaryId, 'merge_accounts', 'user', primaryId,
      `merged #${secondaryId} (${secondary.username}) into #${primaryId} (${primary.username})`);
  });
  run();

  reassignUserIdInParties(secondaryId, primaryId);
  invalidateUserSessions(secondaryId);

  return db.prepare('SELECT * FROM users WHERE id = ?').get(primaryId);
}

// ============ TEAMSPEAK LOGIN CHALLENGE ============
// After TS client(s) are matched by IP, the ServerQuery "bot" sends each candidate a
// distinct random 6-char code via private message. The user must type back whichever
// code they personally received to finish login. This is a second factor that closes
// the IP-based-auth weakness (shared NAT / spoofed X-Forwarded-For could otherwise
// impersonate another user) AND disambiguates which of several TS clients sharing one
// IP is the actual person logging in — the code the user types back identifies them.
const tsChallenges = new Map(); // challengeId -> { method, clientIp, cleanIp, attempts, expires, linkPrimaryUserId?, candidates: [{ tsNickname, tsUid, clid, tsDbId, role, code }] }
const TS_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const TS_CHALLENGE_MAX_ATTEMPTS = 5;

function genChallengeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
  const bytes = crypto.randomBytes(6);
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[bytes[i] % chars.length];
  return code;
}

// `data.candidates` must already be built (each with its own `code`) by the caller —
// codes are generated per-candidate before the message is sent, not here.
function createTsChallenge(data) {
  const id = uuidv4();
  tsChallenges.set(id, { ...data, attempts: 0, expires: Date.now() + TS_CHALLENGE_TTL_MS });
  const t = setTimeout(() => tsChallenges.delete(id), TS_CHALLENGE_TTL_MS);
  if (t.unref) t.unref();
  return { id };
}

// Matches the submitted code against ANY candidate on the challenge, then flattens that
// candidate's fields onto the returned object — callers (handleTsVerify) keep reading
// ch.tsNickname/ch.tsUid/ch.role exactly as before, unaware there was ever more than one.
function consumeTsChallenge(challengeId, code, clientIp) {
  const ch = tsChallenges.get(challengeId);
  if (!ch) return { error: 'Kod wygasł lub nie istnieje. Zaloguj się ponownie.' };
  if (Date.now() > ch.expires) { tsChallenges.delete(challengeId); return { error: 'Kod wygasł. Zaloguj się ponownie.' }; }
  if (ch.clientIp !== clientIp) return { error: 'Niezgodność adresu IP — zaloguj się ponownie.' };
  ch.attempts++;
  if (ch.attempts > TS_CHALLENGE_MAX_ATTEMPTS) { tsChallenges.delete(challengeId); return { error: 'Zbyt wiele prób. Zaloguj się ponownie.' }; }
  const normalized = String(code).trim().toUpperCase();
  const matched = ch.candidates.find(c => c.code === normalized);
  if (!matched) {
    return { error: 'Nieprawidłowy kod.', remaining: TS_CHALLENGE_MAX_ATTEMPTS - ch.attempts };
  }
  tsChallenges.delete(challengeId);
  const { candidates, ...rest } = ch;
  return { challenge: { ...rest, ...matched } };
}

// Build/refresh a TS user record and return the row. TS3 and TS6 are different servers
// with independent identities, so `method` selects which uid/ip column pair to use.
// Matches by uid ONLY — no IP fallback. By the time this runs, the caller already proved
// which specific TS identity is logging in via a per-candidate challenge code, so IP can't
// tell us anything uid doesn't (an IP-based fallback here is exactly the old bug where a
// shared IP let one TS identity silently overwrite another's account).
function upsertTsUser({ method, tsNickname, tsUid, cleanIp, role }) {
  const uidCol = method === 'teamspeak3' ? 'ts3_uid' : 'ts6_uid';
  const ipCol = method === 'teamspeak3' ? 'ts3_ip' : 'ts6_ip';
  const existing = db.prepare(`SELECT * FROM users WHERE ${uidCol} = ?`).get(tsUid);
  let userId;
  if (existing) {
    // Never let this login downgrade a role earned via a different linked identity
    // (e.g. admin/dev via a linked Discord account, or admin via the OTHER TS server) —
    // see maxRole's comment.
    const finalRole = maxRole(existing.role, role);
    db.prepare(`UPDATE users SET username=?, display_name=?, role=?, ${ipCol}=?, ${uidCol}=?, last_login=datetime('now') WHERE id=?`)
      .run(tsNickname, tsNickname, finalRole, cleanIp, tsUid, existing.id);
    userId = existing.id;
  } else {
    const result = db.prepare(`INSERT INTO users (username, display_name, role, auth_method, ${ipCol}, ${uidCol}) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(tsNickname, tsNickname, role, method, cleanIp, tsUid);
    userId = result.lastInsertRowid;
  }
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
}

function completeTsSession(req, res, user, method) {
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Session error' });
    req.session.user = {
      id: user.id, username: user.username, display_name: user.display_name,
      avatar: user.avatar, role: user.role, auth_method: method, discord_roles: []
    };
    stampSessionMeta(req);
    req.session.save((saveErr) => {
      if (saveErr) return res.status(500).json({ error: 'Session save error' });
      res.json({ success: true, user: req.session.user });
    });
  });
}

const challengeMessage = (code) =>
  `🔐 Alleria Filmy — Twój kod logowania: [b]${code}[/b]\nWpisz go na stronie, aby dokończyć logowanie. Kod ważny 5 minut. Jeśli to nie Ty — zignoruj tę wiadomość.`;

// Config-source flags — .env-only, boot-time (require a restart to flip), never editable from the panel.
// This is the escape hatch: if a panel-managed value ever breaks TS/Discord login, flipping the
// flag back to 'env' and restarting ignores whatever is in the DB and falls back to plain .env.
function tsConfigSource() {
  return (process.env.TS_CONFIG_SOURCE || 'env').toLowerCase() === 'panel' ? 'panel' : 'env';
}
function discordRolesConfigSource() {
  return (process.env.DISCORD_ROLES_CONFIG_SOURCE || 'env').toLowerCase() === 'panel' ? 'panel' : 'env';
}
// Effective value for a TS3/TS6 config field: in 'panel' mode, DB setting wins (falling back to the
// .env-derived value when no DB row exists yet — i.e. first save in the panel "copies" from .env);
// in 'env' mode, the DB is ignored entirely and the .env-derived value always wins.
function getTsSetting(dbKey, envValue) {
  return tsConfigSource() === 'panel' ? getSetting(dbKey, envValue) : envValue;
}
function getDiscordRoleSetting(dbKey, envValue) {
  return discordRolesConfigSource() === 'panel' ? getSetting(dbKey, envValue) : envValue;
}
function getTsBotNickname() {
  return getTsSetting('ts_bot_nickname', process.env.TS_BOT_NICKNAME || 'ALLERIA VIDEOS PLATFORM');
}

// TS6 ServerQuery HTTP API — send the code to the matched client via private message
async function sendTs6Code(tsBaseUrl, tsServerId, headers, clid, code) {
  try {
    const r = await fetch(`${tsBaseUrl}/${tsServerId}/sendtextmessage?targetmode=1&target=${clid}&msg=${encodeURIComponent(challengeMessage(code))}`, { headers });
    if (r.ok) return true;
    console.log(`[TS6] sendtextmessage HTTP ${r.status}`);
  } catch (e) { console.log(`[TS6] sendtextmessage failed: ${e.message}`); }
  return false;
}

// Completes a TS link-mode challenge — attaches the matched TS identity to the
// ALREADY-logged-in primary account instead of upserting/logging in as a separate row.
// If that identity already belongs to a different account, hands back a pending-merge
// token instead of linking. `ch.method` selects TS3 vs TS6's independent uid/ip columns.
function handleTsLinkCompletion(req, res, ch) {
  const primaryId = ch.linkPrimaryUserId;
  const uidCol = ch.method === 'teamspeak3' ? 'ts3_uid' : 'ts6_uid';
  const ipCol = ch.method === 'teamspeak3' ? 'ts3_ip' : 'ts6_ip';
  const tsLabel = ch.method === 'teamspeak3' ? 'TeamSpeak 3' : 'TeamSpeak 6';
  const existing = db.prepare(`SELECT * FROM users WHERE ${uidCol} = ?`).get(ch.tsUid);
  if (existing && existing.id !== primaryId) {
    const stats = getMergeStats(existing.id);
    const mergeId = createPendingMerge({
      primaryId, secondaryId: existing.id, secondaryLabel: `${tsLabel}: ${ch.tsNickname}`,
      stats, identities: identityList(existing),
    });
    return res.json({ mergeNeeded: true, mergeId, secondaryLabel: `${tsLabel}: ${ch.tsNickname}`, stats });
  }
  const primary = db.prepare(`SELECT ${uidCol} FROM users WHERE id = ?`).get(primaryId);
  if (!primary) return res.status(404).json({ error: 'Konto nie istnieje.' });
  if (primary[uidCol] && primary[uidCol] !== ch.tsUid) {
    return res.status(400).json({ error: `To konto ma już połączony ${tsLabel}.` });
  }
  db.prepare(`UPDATE users SET ${uidCol} = ?, ${ipCol} = ? WHERE id = ?`).run(ch.tsUid, ch.cleanIp, primaryId);
  audit(primaryId, 'link_account', 'user', primaryId, `linked ${tsLabel} (${ch.tsNickname})`);
  req.session.save(() => res.json({ success: true, linked: ch.method }));
}

// Checks a TS3 client's server groups by database id (persists across sessions — the
// client doesn't need to be online right now) and returns 'admin'/'member', or null if
// they hold neither required group. Opens its own short-lived connection.
async function computeTs3Role(tsDbId) {
  const tsHost = getTsSetting('ts3_host', process.env.TS3_HOST || '');
  const tsPort = getTsSetting('ts3_port', process.env.TS3_PORT || '10011');
  const tsUsername = getTsSetting('ts3_username', process.env.TS3_USERNAME || 'serveradmin');
  const tsPassword = getTsSetting('ts3_password', process.env.TS3_PASSWORD || '');
  const tsServerId = getTsSetting('ts3_server_id', process.env.TS3_SERVER_ID || '1');
  let ts3 = null;
  try {
    ts3 = await connectTS3(tsHost, tsPort);
    await ts3.send(`login ${tsUsername} ${tsPassword}`);
    await ts3.send(`use sid=${tsServerId}`);
    const sgLines = await ts3.send(`servergroupsbyclientid cldbid=${tsDbId}`);
    const groups = sgLines.length > 0 ? ts3ParseLine(sgLines[0]).map(g => String(g.sgid)).filter(Boolean) : [];
    const memberGroupId = getTsSetting('ts3_member_group_id', process.env.TS3_MEMBER_GROUP_ID || '');
    const adminGroupId = getTsSetting('ts3_admin_group_id', process.env.TS3_ADMIN_GROUP_ID || '');
    const hasMemberGroup = memberGroupId ? groups.includes(String(memberGroupId)) : true;
    const hasAdminGroup = adminGroupId ? groups.includes(String(adminGroupId)) : false;
    if (!hasMemberGroup && !hasAdminGroup) return null;
    return hasAdminGroup ? 'admin' : 'member';
  } finally {
    if (ts3) { try { ts3.close(); } catch (_) {} }
  }
}

// Same as computeTs3Role but over the TS6 HTTP ServerQuery API.
async function computeTs6Role(tsDbId) {
  const tsHost = getTsSetting('ts6_host', process.env.TS6_HOST || process.env.TS_SERVER_HOST || '');
  const tsQueryPort = getTsSetting('ts6_port', process.env.TS6_QUERY_PORT || process.env.TS_API_PORT || '10080');
  const tsUsername = getTsSetting('ts6_username', process.env.TS6_USERNAME || process.env.TS_USERNAME || 'serveradmin');
  const tsPassword = getTsSetting('ts6_password', process.env.TS6_PASSWORD || process.env.TS_PASSWORD || '');
  const tsApiKey = getTsSetting('ts6_api_key', process.env.TS6_API_KEY || process.env.TS_API_KEY || '');
  const tsServerId = getTsSetting('ts6_server_id', process.env.TS6_SERVER_ID || process.env.TS_SERVER_ID || '1');
  const tsBaseUrl = `http://${tsHost}:${tsQueryPort}`;
  const headers = { 'Content-Type': 'application/json' };
  if (tsUsername && tsPassword) headers['Authorization'] = 'Basic ' + Buffer.from(`${tsUsername}:${tsPassword}`).toString('base64');
  if (tsApiKey) headers['x-api-key'] = tsApiKey;

  let groups = [];
  try {
    const sgRes = await fetch(`${tsBaseUrl}/${tsServerId}/servergroupsbyclientid?cldbid=${tsDbId}`, { headers });
    if (sgRes.ok) {
      const sgData = await sgRes.json();
      const sgList = sgData.body || sgData || [];
      groups = (Array.isArray(sgList) ? sgList : [sgList]).map(g => String(g.sgid));
    }
  } catch (e) { console.log(`[TS6] Error getting groups: ${e.message}`); }

  const memberGroupId = getTsSetting('ts6_member_group_id', process.env.TS6_MEMBER_GROUP_ID || process.env.TS_MEMBER_GROUP_ID || '');
  const adminGroupId = getTsSetting('ts6_admin_group_id', process.env.TS6_ADMIN_GROUP_ID || process.env.TS_ADMIN_GROUP_ID || '');
  const hasMemberGroup = memberGroupId ? groups.includes(String(memberGroupId)) : true;
  const hasAdminGroup = adminGroupId ? groups.includes(String(adminGroupId)) : false;
  if (!hasMemberGroup && !hasAdminGroup) return null;
  return hasAdminGroup ? 'admin' : 'member';
}

// Verify handler shared by TS3/TS6 — checks the code, THEN checks the matched candidate's
// server group. Group membership is deliberately checked here (post-code) rather than
// before the code is sent: every candidate on a shared IP gets messaged regardless of
// their group, so someone without the required rank still gets a code and a clear "you
// don't have the required group" error once they try it — instead of being silently
// skipped while a sibling on the same IP gets the only message (which looked like the
// multi-candidate detection wasn't working at all).
function handleTsVerify(method) {
  return async (req, res) => {
    const clientIp = req.ip || req.socket.remoteAddress;
    const { challengeId, code } = req.body || {};
    if (!challengeId || !code) return res.status(400).json({ error: 'Brak identyfikatora wyzwania lub kodu.' });
    const result = consumeTsChallenge(challengeId, code, clientIp);
    if (result.error) {
      const body = { error: result.error };
      if (result.remaining !== undefined) body.remaining = result.remaining;
      // 400, not 401 — this endpoint is also called from ProfilePage while linking, by an
      // already-authenticated user. A 401 there would trip the frontend's global
      // "unauthenticated → redirect to /login" handling for what's really just a wrong or
      // expired code, silently bouncing them off the profile page with no error shown.
      return res.status(400).json(body);
    }
    const ch = result.challenge;
    if (ch.method !== method) return res.status(400).json({ error: 'Niezgodny typ wyzwania.' });

    try {
      const role = method === 'teamspeak3' ? await computeTs3Role(ch.tsDbId) : await computeTs6Role(ch.tsDbId);
      if (!role) {
        logLogin(null, ch.tsNickname, method, clientIp, 0, 'Missing group (checked after code verified)');
        return res.status(403).json({ error: `Nie posiadasz wymaganej grupy na serwerze ${method === 'teamspeak3' ? 'TeamSpeak 3' : 'TeamSpeak'}.` });
      }
      if (ch.linkPrimaryUserId) return handleTsLinkCompletion(req, res, { ...ch, role });
      const user = upsertTsUser({ method, tsNickname: ch.tsNickname, tsUid: ch.tsUid, cleanIp: ch.cleanIp, role });
      logLogin(user.id, ch.tsNickname, method, clientIp, 1, 'challenge OK');
      console.log(`[${method === 'teamspeak3' ? 'TS3' : 'TS6'}] ✅ Login (challenge OK): "${ch.tsNickname}" (role: ${role})`);
      completeTsSession(req, res, user, method);
    } catch (err) {
      console.error(`[${method}] verify error:`, err);
      res.status(500).json({ error: 'Błąd logowania: ' + err.message });
    }
  };
}

app.post('/api/auth/teamspeak/verify', authLimiter, handleTsVerify('teamspeak'));
app.post('/api/auth/teamspeak3/verify', authLimiter, handleTsVerify('teamspeak3'));

// ============ TEAMSPEAK 6 AUTH ============
// Uses TS ServerQuery HTTP API (port 10080)
// Auth: Basic Auth (username:password) + optional x-api-key
// Endpoints: /{serverId}/clientlist, /{serverId}/clientinfo, /{serverId}/servergroupsbyclientid
app.post('/api/auth/teamspeak', authLimiter, async (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress;
  const cleanIp = clientIp.replace('::ffff:', '');

  // Account-linking mode: attach the matched TS identity to the already-logged-in user
  // instead of logging in as a (possibly different) TS-origin account.
  const linkMode = req.body?.linkMode === true;
  if (linkMode && !req.session.user) {
    return res.status(401).json({ error: 'Musisz być zalogowany, aby połączyć konto.' });
  }

  const tsHost = getTsSetting('ts6_host', process.env.TS6_HOST || process.env.TS_SERVER_HOST || '');
  const tsQueryPort = getTsSetting('ts6_port', process.env.TS6_QUERY_PORT || process.env.TS_API_PORT || '10080');
  const tsUsername = getTsSetting('ts6_username', process.env.TS6_USERNAME || process.env.TS_USERNAME || 'serveradmin');
  const tsPassword = getTsSetting('ts6_password', process.env.TS6_PASSWORD || process.env.TS_PASSWORD || '');
  const tsApiKey = getTsSetting('ts6_api_key', process.env.TS6_API_KEY || process.env.TS_API_KEY || '');
  const tsServerId = getTsSetting('ts6_server_id', process.env.TS6_SERVER_ID || process.env.TS_SERVER_ID || '1');

  if (!tsHost) {
    logLogin(null, 'unknown', 'teamspeak', clientIp, 0, 'TS6 not configured');
    return res.status(500).json({ error: 'TeamSpeak nie jest skonfigurowany.' });
  }

  try {
    const tsBaseUrl = `http://${tsHost}:${tsQueryPort}`;

    // Build auth headers — Basic Auth + optional API key
    const headers = { 'Content-Type': 'application/json' };
    if (tsUsername && tsPassword) {
      headers['Authorization'] = 'Basic ' + Buffer.from(`${tsUsername}:${tsPassword}`).toString('base64');
    }
    if (tsApiKey) {
      headers['x-api-key'] = tsApiKey;
    }

    console.log(`[TS6] Attempting auth for IP: ${cleanIp} via ${tsBaseUrl}/${tsServerId}`);

    // Rename the ServerQuery bot so messages arrive from TS_BOT_NICKNAME, not the query login
    try {
      const nickRes = await fetch(`${tsBaseUrl}/${tsServerId}/clientupdate?client_nickname=${encodeURIComponent(getTsBotNickname())}`, { headers });
      if (!nickRes.ok) console.log(`[TS6] clientupdate nickname HTTP ${nickRes.status}`);
    } catch (e) { console.log(`[TS6] clientupdate nickname failed: ${e.message}`); }

    // Step 1: Get client list
    const clientListRes = await fetch(`${tsBaseUrl}/${tsServerId}/clientlist`, { headers });
    if (!clientListRes.ok) {
      const errText = await clientListRes.text();
      throw new Error(`TS6 clientlist failed (${clientListRes.status}): ${errText.slice(0, 200)}`);
    }
    const clientListData = await clientListRes.json();
    const clients = clientListData.body || clientListData || [];

    console.log(`[TS6] Got ${clients.length} clients, looking for IP ${cleanIp}`);

    // Step 2: Find ALL clients connected from this IP — need clientinfo for each to get IP.
    // A shared IP (NAT, dorm/office network) can have more than one legitimate TS client;
    // we collect every match instead of stopping at the first, and disambiguate via a
    // distinct challenge code per candidate below.
    const ipMatches = [];
    for (const client of clients) {
      // Skip ServerQuery clients
      if (client.client_type === 1) continue;

      const clid = client.clid;
      try {
        const infoRes = await fetch(`${tsBaseUrl}/${tsServerId}/clientinfo?clid=${clid}`, { headers });
        if (!infoRes.ok) continue;
        const infoData = await infoRes.json();
        const info = Array.isArray(infoData.body) ? infoData.body[0] : (infoData.body || infoData);

        const cIp = info.connection_client_ip || '';
        if (cIp === cleanIp || cIp === clientIp) {
          ipMatches.push({ ...client, ...info });
        }
      } catch (e) {
        console.log(`[TS6] Error getting info for clid ${clid}: ${e.message}`);
      }
    }

    if (ipMatches.length === 0) {
      logLogin(null, 'unknown', 'teamspeak', clientIp, 0, `No TS client with IP ${cleanIp}`);
      // 404, not 401 — see the comment on handleTsVerify's error response for why: this
      // endpoint doubles as the account-linking flow for an already-authenticated user.
      return res.status(404).json({ error: 'Nie znaleziono klienta TeamSpeak z Twoim IP. Upewnij się, że jesteś połączony z serwerem TS.' });
    }

    console.log(`[TS6] Found ${ipMatches.length} client(s) on IP ${cleanIp}`);

    // Step 3: Send EVERY IP match their own distinct code — group membership is
    // deliberately NOT checked here. It's checked after the code is verified (see
    // computeTs6Role/handleTsVerify), once we know exactly which specific person is
    // logging in. Filtering by group before sending would silently skip messaging anyone
    // without the required group, even though they're a real candidate on this IP — which
    // looked like multi-candidate detection wasn't working when it was really just an
    // unauthorized sibling never getting a message at all.
    const candidates = [];
    for (const m of ipMatches) {
      const code = genChallengeCode();
      const sent = await sendTs6Code(tsBaseUrl, tsServerId, headers, m.clid, code);
      if (sent) {
        candidates.push({
          clid: m.clid, tsNickname: m.client_nickname, tsUid: m.client_unique_identifier,
          tsDbId: m.client_database_id, code,
        });
      }
    }

    if (candidates.length === 0) {
      logLogin(null, ipMatches[0]?.client_nickname || 'unknown', 'teamspeak', clientIp, 0, 'Nie udało się wysłać kodu');
      return res.status(502).json({ error: 'Nie udało się wysłać kodu na TeamSpeak. Spróbuj ponownie.' });
    }

    const { id: challengeId } = createTsChallenge({
      method: 'teamspeak', clientIp, cleanIp, candidates,
      linkPrimaryUserId: linkMode ? req.session.user.id : undefined,
    });

    if (candidates.length === 1) {
      console.log(`[TS6] 🔐 Challenge sent to "${candidates[0].tsNickname}" (clid ${candidates[0].clid})`);
      res.json({ challenge: true, challengeId, method: 'teamspeak', nickname: candidates[0].tsNickname, expiresIn: TS_CHALLENGE_TTL_MS / 1000 });
    } else {
      console.log(`[TS6] 🔐 Challenge sent to ${candidates.length} candidates on IP ${cleanIp}`);
      res.json({ challenge: true, challengeId, method: 'teamspeak', multipleCandidates: true, count: candidates.length, expiresIn: TS_CHALLENGE_TTL_MS / 1000 });
    }

  } catch (err) {
    console.error('[TS6 AUTH] Error:', err);
    logLogin(null, 'unknown', 'teamspeak', clientIp, 0, err.message);
    res.status(500).json({ error: 'TeamSpeak auth failed: ' + err.message });
  }
});

// ============ TEAMSPEAK 3 AUTH ============
// Uses TS3 ServerQuery raw TCP protocol (default port 10011)

const { ts3Escape, ts3Unescape, ts3ParseLine } = require('./ts3proto');

function connectTS3(host, port, connectTimeoutMs = 10000, cmdTimeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port: parseInt(port) });
    socket.setEncoding('utf8');

    let buffer = '';
    let ready = false;
    let greetingLines = 0;
    const queue = []; // { resolve, reject, lines, timer }

    const destroy = (err) => {
      while (queue.length > 0) {
        const e = queue.shift();
        clearTimeout(e.timer);
        e.reject(err);
      }
      try { socket.destroy(); } catch (_) {}
    };

    // Connect / greeting timeout
    const connectTimer = setTimeout(() => {
      if (!ready) {
        socket.destroy();
        reject(new Error(`TS3 connect timeout to ${host}:${port}`));
      }
    }, connectTimeoutMs);

    socket.on('data', (chunk) => {
      buffer += chunk;
      let nl;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl).trim(); // trim both ends — strips \r and any leading whitespace
        buffer = buffer.slice(nl + 1);

        if (!ready) {
          console.log(`[TS3] greeting: "${line.slice(0, 80)}"`);
          // Resolve as soon as we see the TS3 identifier — don't count lines
          if (line === 'TS3' || line.startsWith('TS3')) {
            ready = true;
            clearTimeout(connectTimer);
            resolve(client);
          }
          continue;
        }

        if (line === '' || line.startsWith('notify')) continue;

        console.log(`[TS3] <<< "${line.slice(0, 120)}"`);

        if (line.startsWith('error ')) {
          const entry = queue.shift();
          if (!entry) { console.log(`[TS3] unexpected error line (no pending cmd): ${line}`); continue; }
          clearTimeout(entry.timer);
          const idM = line.match(/id=(\d+)/);
          const msgM = line.match(/msg=(\S+)/);
          const id = parseInt(idM?.[1] ?? '1');
          if (id === 0) {
            entry.resolve(entry.lines);
          } else {
            entry.reject(new Error(`TS3 error ${id}: ${ts3Unescape(msgM?.[1] ?? 'error')}`));
          }
        } else {
          if (queue[0]) queue[0].lines.push(line);
        }
      }
    });

    socket.on('error', (err) => {
      clearTimeout(connectTimer);
      console.log(`[TS3] socket error: ${err.message}`);
      if (!ready) { reject(err); return; }
      destroy(err);
    });

    socket.on('close', () => {
      clearTimeout(connectTimer);
      if (queue.length > 0) destroy(new Error('TS3 socket closed while waiting for response'));
    });

    const client = {
      send(cmd) {
        return new Promise((res, rej) => {
          const entry = { resolve: res, reject: rej, lines: [] };
          entry.timer = setTimeout(() => {
            const idx = queue.indexOf(entry);
            if (idx !== -1) queue.splice(idx, 1);
            rej(new Error(`TS3 command timed out: ${cmd.split(' ')[0]}`));
            destroy(new Error('TS3 command timeout — closing socket'));
          }, cmdTimeoutMs);
          queue.push(entry);
          console.log(`[TS3] >>> ${cmd.startsWith('login') ? 'login ***' : cmd}`);
          socket.write(cmd + '\r\n');
        });
      },
      close() {
        try { socket.write('quit\r\n'); } catch (_) {}
        setTimeout(() => { try { socket.destroy(); } catch (_) {} }, 300);
      },
    };
  });
}

app.post('/api/auth/teamspeak3', authLimiter, async (req, res) => {
  const clientIp = req.ip || req.socket.remoteAddress;
  const cleanIp = clientIp.replace('::ffff:', '');

  // Account-linking mode: attach the matched TS identity to the already-logged-in user
  // instead of logging in as a (possibly different) TS-origin account.
  const linkMode = req.body?.linkMode === true;
  if (linkMode && !req.session.user) {
    return res.status(401).json({ error: 'Musisz być zalogowany, aby połączyć konto.' });
  }

  const tsHost = getTsSetting('ts3_host', process.env.TS3_HOST || '');
  const tsPort = getTsSetting('ts3_port', process.env.TS3_PORT || '10011');
  const tsUsername = getTsSetting('ts3_username', process.env.TS3_USERNAME || 'serveradmin');
  const tsPassword = getTsSetting('ts3_password', process.env.TS3_PASSWORD || '');
  const tsServerId = getTsSetting('ts3_server_id', process.env.TS3_SERVER_ID || '1');

  if (!tsHost) {
    logLogin(null, 'unknown', 'teamspeak3', clientIp, 0, 'TS3 not configured');
    return res.status(500).json({ error: 'TeamSpeak 3 nie jest skonfigurowany.' });
  }

  let ts3 = null;
  try {
    console.log(`[TS3] Attempting auth for IP: ${cleanIp} via ${tsHost}:${tsPort}`);

    ts3 = await connectTS3(tsHost, tsPort);
    await ts3.send(`login ${tsUsername} ${tsPassword}`);
    await ts3.send(`use sid=${tsServerId}`);

    // Rename the ServerQuery bot so messages/pokes arrive from TS_BOT_NICKNAME, not the query login
    try {
      await ts3.send(`clientupdate client_nickname=${ts3Escape(getTsBotNickname())}`);
    } catch (e) { console.log(`[TS3] clientupdate nickname failed: ${e.message}`); }

    const clLines = await ts3.send('clientlist');
    const clients = clLines.length > 0 ? ts3ParseLine(clLines[0]) : [];

    console.log(`[TS3] Got ${clients.length} clients, checking IP individually for each (like TS6) — looking for ${cleanIp}`);

    // Collect ALL clients connected from this IP — a shared IP (NAT, dorm/office network)
    // can have more than one legitimate TS3 client; disambiguate via a distinct challenge
    // code per candidate below, exactly like the TS6 flow above. (An earlier version of
    // this tried to have the user reply to a bot over TS3 chat instead, using a single
    // shared code and a persistent ServerQuery connection registered for textprivate
    // events — TS3 servers reject that unless the specific connection sending the code is
    // ALSO the one registered, which broke in practice with two connections in play. The
    // per-candidate-code approach below needs no persistent connection at all.)
    //
    // IP is checked via a per-client `clientinfo` call rather than trusting `clientlist`'s
    // bulk `-ip` field — that field can be stale/empty for a client whose connection info
    // the server hasn't refreshed yet, which silently dropped them from `matches` here and
    // made multi-candidate detection miss real candidates (looked "random" which of two
    // people on the same IP got messaged). `clientinfo` forces a fresh per-client read,
    // exactly like the TS6 HTTP-query path already does for the same reason.
    const matches = [];
    for (const c of clients) {
      if (c.client_type === '1') continue; // skip ServerQuery clients
      try {
        const ciLines = await ts3.send(`clientinfo clid=${c.clid}`);
        if (ciLines.length === 0) continue;
        const info = ts3ParseLine(ciLines[0])[0] || {};
        const cIp = info.connection_client_ip || '';
        if (cIp === cleanIp || cIp === clientIp) {
          matches.push({ ...c, ...info });
        }
      } catch (e) {
        console.log(`[TS3] Error getting clientinfo for clid ${c.clid}: ${e.message}`);
      }
    }

    if (matches.length === 0) {
      ts3.close(); ts3 = null;
      logLogin(null, 'unknown', 'teamspeak3', clientIp, 0, `No TS3 client with IP ${cleanIp}`);
      // 404, not 401 — see the comment on handleTsVerify's error response for why: this
      // endpoint doubles as the account-linking flow for an already-authenticated user.
      return res.status(404).json({ error: 'Nie znaleziono klienta TeamSpeak 3 z Twoim IP. Upewnij się, że jesteś połączony z serwerem TS3.' });
    }

    console.log(`[TS3] Found ${matches.length} client(s) on IP ${cleanIp}`);

    // Send EVERY match their own distinct code over the still-open connection — group
    // membership is deliberately NOT checked here (see the equivalent comment in the TS6
    // route above). It's checked after the code is verified (computeTs3Role/handleTsVerify),
    // once we know exactly which specific person is logging in. Whichever code the user
    // types back on the site identifies exactly which of them that is; anyone the message
    // fails to reach is dropped, since they couldn't complete a code they never got.
    const delivery = getSetting('ts3_code_delivery', 'pm'); // 'pm' | 'poke' | 'both'
    const candidates = [];
    for (const m of matches) {
      const tsNickname = m.client_nickname;
      const code = genChallengeCode();
      let sent = false;
      if (delivery === 'pm' || delivery === 'both') {
        try {
          await ts3.send(`sendtextmessage targetmode=1 target=${m.clid} msg=${ts3Escape(challengeMessage(code))}`);
          sent = true;
        } catch (e) { console.log(`[TS3] sendtextmessage to "${tsNickname}" failed: ${e.message}`); }
      }
      if (delivery === 'poke' || delivery === 'both') {
        try {
          await ts3.send(`clientpoke clid=${m.clid} msg=${ts3Escape('Kod logowania: [b]' + code + '[/b]')}`);
          sent = true;
        } catch (e) { console.log(`[TS3] clientpoke to "${tsNickname}" failed: ${e.message}`); }
      }
      if (sent) {
        candidates.push({
          clid: m.clid, tsNickname, tsUid: m.client_unique_identifier,
          tsDbId: m.client_database_id, code,
        });
      }
    }
    ts3.close(); ts3 = null;

    if (candidates.length === 0) {
      logLogin(null, matches[0]?.client_nickname || 'unknown', 'teamspeak3', clientIp, 0, 'Nie udało się wysłać kodu');
      return res.status(502).json({ error: 'Nie udało się wysłać kodu na TeamSpeak 3. Spróbuj ponownie.' });
    }

    const { id: challengeId } = createTsChallenge({
      method: 'teamspeak3', clientIp, cleanIp, candidates,
      linkPrimaryUserId: linkMode ? req.session.user.id : undefined,
    });

    if (candidates.length === 1) {
      console.log(`[TS3] 🔐 Challenge sent to "${candidates[0].tsNickname}" (clid ${candidates[0].clid})`);
      res.json({ challenge: true, challengeId, method: 'teamspeak3', nickname: candidates[0].tsNickname, expiresIn: TS_CHALLENGE_TTL_MS / 1000 });
    } else {
      console.log(`[TS3] 🔐 Challenge sent to ${candidates.length} candidates on IP ${cleanIp}`);
      res.json({ challenge: true, challengeId, method: 'teamspeak3', multipleCandidates: true, count: candidates.length, expiresIn: TS_CHALLENGE_TTL_MS / 1000 });
    }

  } catch (err) {
    if (ts3) { try { ts3.close(); } catch (_) {} }
    console.error('[TS3 AUTH] Error:', err);
    logLogin(null, 'unknown', 'teamspeak3', clientIp, 0, err.message);
    res.status(500).json({ error: 'TeamSpeak 3 auth failed: ' + err.message });
  }
});

// ============ AUTH STATUS & LOGOUT ============
app.get('/api/auth/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  // Live DB lookup (not baked into the session at login) — so an admin editing the Regulamin
  // immediately re-gates everyone on their next page load, no fresh login required.
  const row = db.prepare('SELECT tos_accepted_at FROM users WHERE id = ?').get(req.session.user.id);
  let impersonatedBy = null;
  if (req.session.impersonatorId) {
    impersonatedBy = db.prepare('SELECT id, username, display_name FROM users WHERE id = ?').get(req.session.impersonatorId) || null;
  }
  res.json({
    ...req.session.user,
    tosAccepted: !tosNeedsAcceptance(row?.tos_accepted_at),
    tosPreviouslyAccepted: !!row?.tos_accepted_at,
    impersonatedBy,
  });
});

// Public — the Regulamin is a legal document meant to be readable pre-login too.
app.get('/api/tos', (req, res) => {
  res.json({
    content: getSetting('tos_content', DEFAULT_TOS_MD),
    updatedAt: getSetting('tos_updated_at', DEFAULT_TOS_UPDATED_AT),
  });
});

app.post('/api/tos/accept', requireAuth, (req, res) => {
  // Must be the same ISO string format JS produces (see tos_updated_at below) — SQLite's own
  // datetime('now') uses a space separator ("2026-08-11 14:23:07"), which sorts BEFORE any
  // ISO string at the same instant (' ' < 'T' in ASCII) and made tosNeedsAcceptance() always
  // return true, regardless of actual order — an infinite re-accept loop.
  db.prepare('UPDATE users SET tos_accepted_at = ? WHERE id = ?').run(new Date().toISOString(), req.session.user.id);
  audit(req.session.user.id, 'tos_accept', 'user', req.session.user.id, null);
  res.json({ success: true });
});

app.post('/api/debug/tos', requireDev, (req, res) => {
  const content = String(req.body.content || '').trim();
  if (!content) return res.status(400).json({ error: 'Treść regulaminu nie może być pusta.' });
  const current = getSetting('tos_content', DEFAULT_TOS_MD);
  if (content !== current) {
    setSetting('tos_content', content);
    setSetting('tos_updated_at', new Date().toISOString());
    audit(req.session.user.id, 'edit', 'settings', null, 'tos_content updated');
  }
  res.json({ content, updatedAt: getSetting('tos_updated_at', DEFAULT_TOS_UPDATED_AT) });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

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

app.get('/api/videos', requireAuth, (req, res) => {
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

  // Hide scheduled (future) videos from regular users (admin+dev can see them)
  // publish_date is stored as an ISO string (toISOString(), "T"/"Z"/ms) — datetime('now') returns
  // SQLite's own "YYYY-MM-DD HH:MM:SS" format. Comparing those two TEXT formats directly is a raw
  // string comparison: at the date/time boundary "T" (0x54) sorts after " " (0x20), so ANY video
  // published earlier *today* still compares as "greater than" now and gets hidden all day.
  // Wrapping both sides in datetime(...) normalizes them to the same format before comparing.
  if (!isAdminOrDev) {
    conditions.push("datetime(v.publish_date) <= datetime('now')");
  }

  // Access control — only dev bypasses category/content restrictions
  if (!isDev) {
    const userId = req.session.user.id;
    const userRoles = req.session.user.discord_roles || [];
    const userRankIds = getUserRankIds(userId);

    // Hide custom-access videos unless user is in video_access list
    conditions.push(`(v.access_mode IS NULL OR v.access_mode = 'category' OR (v.access_mode = 'custom' AND v.id IN (SELECT video_id FROM video_access WHERE user_id = ?)))`);
    params.push(userId);

    // Hide videos from categories the user doesn't have access to
    const allCats = db.prepare('SELECT id, access_mode FROM categories').all();
    const restrictedCatIds = [];
    for (const cat of allCats) {
      const { canView } = checkCatAccess(cat.id, cat.access_mode, userId, userRoles, userRankIds);
      if (!canView) restrictedCatIds.push(cat.id);
    }
    if (restrictedCatIds.length > 0) {
      conditions.push(`(v.category_id IS NULL OR v.category_id NOT IN (${restrictedCatIds.map(() => '?').join(',')}))`);
      params.push(...restrictedCatIds);
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

app.get('/api/videos/:id', requireAuth, (req, res) => {
  try {
    const video = db.prepare(`
      SELECT v.*, u.username AS author_name, u.display_name AS author_display_name,
      c.name AS category_name, c.slug AS category_slug
      FROM videos v LEFT JOIN users u ON v.author_id = u.id
      LEFT JOIN categories c ON v.category_id = c.id WHERE v.id = ?
    `).get(req.params.id);
    
    if (!video) return res.status(404).json({ error: 'Video not found' });

    // Access enforcement — only dev bypasses category restrictions
    const user = req.session.user;
    const isDev = user.role === 'dev';
    if (!isDev) {
      // Check custom access
      if (video.access_mode === 'custom') {
        const hasAccess = db.prepare('SELECT 1 FROM video_access WHERE video_id = ? AND user_id = ?').get(video.id, user.id);
        if (!hasAccess) return res.status(403).json({ error: 'Brak dostępu do tego filmu.' });
      }
      // Check category access
      if (video.category_id) {
        const cat = db.prepare('SELECT access_mode FROM categories WHERE id = ?').get(video.category_id);
        if (cat) {
          const { canView } = checkCatAccess(video.category_id, cat.access_mode, user.id, user.discord_roles || [], getUserRankIds(user.id));
          if (!canView) return res.status(403).json({ error: 'Brak dostępu do tej kategorii.' });
        }
      }
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
app.post('/api/videos/:id/log-view', requireAuth, (req, res) => {
  try {
    const video = db.prepare('SELECT id, category_id, access_mode FROM videos WHERE id = ?').get(req.params.id);
    if (!video) return res.status(404).json({ error: 'Video not found' });
    const user = req.session.user;
    if (user.role !== 'dev') {
      if (video.access_mode === 'custom') {
        const hasAccess = db.prepare('SELECT 1 FROM video_access WHERE video_id = ? AND user_id = ?').get(video.id, user.id);
        if (!hasAccess) return res.status(403).json({ error: 'Brak dostępu do tego filmu.' });
      }
      if (video.category_id) {
        const cat = db.prepare('SELECT access_mode FROM categories WHERE id = ?').get(video.category_id);
        if (cat) {
          const { canView } = checkCatAccess(video.category_id, cat.access_mode, user.id, user.discord_roles || [], getUserRankIds(user.id));
          if (!canView) return res.status(403).json({ error: 'Brak dostępu do tej kategorii.' });
        }
      }
    }
    db.prepare(`INSERT INTO watch_logs (user_id, video_id, context) VALUES (?, ?, 'watch_party')`).run(user.id, video.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/videos', requireAdmin, upload.single('thumbnail_file'), (req, res) => {
  try {
    const { title, author_id, main_source, main_source_type, main_source_title,
      thumbnail, mirror1_name, mirror1_url, mirror1_is_embed, mirror1_type,
      mirror2_name, mirror2_url, mirror2_is_embed, mirror2_type,
      mirror3_name, mirror3_url, mirror3_type,
      mirror4_name, mirror4_url, mirror4_type,
      mirror5_name, mirror5_url, mirror5_type,
      description, publish_date, tags,
      stream_video_id, drm_enhanced, category_id } = req.body;

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
        mirror1_name, mirror1_url, mirror1_is_embed, mirror1_type, mirror2_name, mirror2_url, mirror2_is_embed, mirror2_type,
        mirror3_name, mirror3_url, mirror3_type, mirror4_name, mirror4_url, mirror4_type,
        mirror5_name, mirror5_url, mirror5_type,
        description, publish_date, stream_video_id, drm_enhanced, category_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(title, parseInt(author_id), main_source || '', main_source_type || 'youtube', main_source_title || '',
      thumbUrl, customThumb,
      mirror1_name || null, mirror1_url || null, m1t === 'embed' ? 1 : 0, m1t,
      mirror2_name || null, mirror2_url || null, m2t === 'embed' ? 1 : 0, m2t,
      mirror3_name || null, mirror3_url || null, m3t,
      mirror4_name || null, mirror4_url || null, m4t,
      mirror5_name || null, mirror5_url || null, m5t,
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

app.put('/api/videos/:id', requireAdmin, upload.single('thumbnail_file'), (req, res) => {
  try {
    const { title, author_id, main_source, main_source_type, main_source_title,
      thumbnail, mirror1_name, mirror1_url, mirror1_is_embed, mirror1_type,
      mirror2_name, mirror2_url, mirror2_is_embed, mirror2_type,
      mirror3_name, mirror3_url, mirror3_type,
      mirror4_name, mirror4_url, mirror4_type,
      mirror5_name, mirror5_url, mirror5_type,
      description, publish_date, tags,
      category_id, stream_video_id, drm_enhanced, access_mode, allowed_users } = req.body;

    const existing = db.prepare('SELECT * FROM videos WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Video not found' });

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
        mirror1_name=?, mirror1_url=?, mirror1_is_embed=?, mirror1_type=?,
        mirror2_name=?, mirror2_url=?, mirror2_is_embed=?, mirror2_type=?,
        mirror3_name=?, mirror3_url=?, mirror3_type=?,
        mirror4_name=?, mirror4_url=?, mirror4_type=?,
        mirror5_name=?, mirror5_url=?, mirror5_type=?,
        description=?, publish_date=?, category_id=?, stream_video_id=?, drm_enhanced=?, access_mode=?,
        updated_at=datetime('now') WHERE id=?
    `).run(title, parseInt(author_id), main_source, main_source_type || 'youtube', main_source_title || '',
      thumbUrl, customThumb,
      mirror1_name || null, mirror1_url || null, m1type === 'embed' ? 1 : 0, m1type,
      mirror2_name || null, mirror2_url || null, m2type === 'embed' ? 1 : 0, m2type,
      mirror3_name || null, mirror3_url || null, m3type,
      mirror4_name || null, mirror4_url || null, m4type,
      mirror5_name || null, mirror5_url || null, m5type,
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

app.delete('/api/videos/:id', requireAdmin, (req, res) => {
  try {
    const vid = db.prepare('SELECT title FROM videos WHERE id = ?').get(req.params.id);
    db.prepare('DELETE FROM videos WHERE id = ?').run(req.params.id);
    audit(req.session.user.id, "delete", "video", parseInt(req.params.id), vid?.title || "");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete video' });
  }
});

// ============ TAGS API ============
app.get('/api/tags', requireAuth, (req, res) => {
  const { search } = req.query;
  const query = search
    ? 'SELECT t.*, COUNT(vt.video_id) as video_count FROM tags t LEFT JOIN video_tags vt ON t.id = vt.tag_id WHERE t.name LIKE ? GROUP BY t.id ORDER BY t.name'
    : 'SELECT t.*, COUNT(vt.video_id) as video_count FROM tags t LEFT JOIN video_tags vt ON t.id = vt.tag_id GROUP BY t.id ORDER BY t.name';
  const tagRows = search ? db.prepare(query).all(`%${search}%`) : db.prepare(query).all();
  const videosByTag = db.prepare('SELECT vt.tag_id, v.id, v.title FROM video_tags vt JOIN videos v ON vt.video_id = v.id ORDER BY v.title').all();
  const videoMap = {};
  for (const row of videosByTag) {
    if (!videoMap[row.tag_id]) videoMap[row.tag_id] = [];
    videoMap[row.tag_id].push({ id: row.id, title: row.title });
  }
  res.json(tagRows.map(t => ({ ...t, videos: videoMap[t.id] || [] })));
});

app.delete('/api/tags/:id', requireAdmin, (req, res) => {
  try {
    const count = db.prepare('SELECT COUNT(*) as cnt FROM video_tags WHERE tag_id = ?').get(req.params.id);
    if (count.cnt > 0) return res.status(409).json({ error: `Tag jest przypisany do ${count.cnt} film${count.cnt === 1 ? 'u' : 'ów'} i nie może zostać usunięty.` });
    const tag = db.prepare('SELECT name FROM tags WHERE id = ?').get(req.params.id);
    db.prepare('DELETE FROM tags WHERE id = ?').run(req.params.id);
    audit(req.session.user.id, "delete", "tag", parseInt(req.params.id), tag?.name || "");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete tag' });
  }
});

// ============ CATEGORIES API ============
// List categories (filtered by user access)
app.get('/api/categories', requireAuth, (req, res) => {
  try {
    const allCats = db.prepare('SELECT * FROM categories ORDER BY sort_order, name').all();
    const user = req.session.user;
    const isDev = user.role === 'dev';

    // Only dev sees all categories without restriction
    if (isDev) {
      const cats = allCats.map(c => {
        const access = db.prepare('SELECT * FROM category_access WHERE category_id = ?').all(c.id);
        const rank_access = db.prepare('SELECT cra.*, r.name AS rank_name, r.color AS rank_color FROM category_rank_access cra JOIN app_ranks r ON cra.rank_id = r.id WHERE cra.category_id = ?').all(c.id);
        const videoCount = db.prepare('SELECT COUNT(*) AS c FROM videos WHERE category_id = ?').get(c.id).c;
        return { ...c, access, rank_access, videoCount, canView: true, canEdit: true };
      });
      return res.json(cats);
    }

    // Regular users — check access using compound mode
    const userId = user.id;
    const userRoles = user.discord_roles || [];
    const userRankIds = getUserRankIds(userId);
    const withAccess = allCats.map(c => {
      const { canView, canEdit } = checkCatAccess(c.id, c.access_mode, userId, userRoles, userRankIds);
      return { ...c, canView, canEdit };
    });

    // A category the user can't view is still included — as a minimal "locked" placeholder,
    // no access/rank_access/webhook details — if it has an accessible descendant, so that
    // descendant stays reachable in the category tree (sidebar) instead of silently vanishing
    // because its parent chain got filtered out. Otherwise it's dropped entirely, as before.
    const byParent = {};
    for (const c of withAccess) {
      const pid = c.parent_id || 0;
      (byParent[pid] = byParent[pid] || []).push(c);
    }
    const hasAccessibleDescendant = (catId) =>
      (byParent[catId] || []).some(ch => ch.canView || hasAccessibleDescendant(ch.id));

    const cats = withAccess
      .filter(c => c.canView || hasAccessibleDescendant(c.id))
      .map(c => {
        if (!c.canView) {
          return { id: c.id, name: c.name, slug: c.slug, icon: c.icon, sort_order: c.sort_order, parent_id: c.parent_id, canView: false, canEdit: false, locked: true };
        }
        const access = db.prepare('SELECT * FROM category_access WHERE category_id = ?').all(c.id);
        const rank_access = db.prepare('SELECT cra.*, r.name AS rank_name, r.color AS rank_color FROM category_rank_access cra JOIN app_ranks r ON cra.rank_id = r.id WHERE cra.category_id = ?').all(c.id);
        const videoCount = db.prepare('SELECT COUNT(*) AS c FROM videos WHERE category_id = ?').get(c.id).c;
        return { ...c, access, rank_access, videoCount };
      });

    res.json(cats);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create category (dev only)
app.post('/api/categories', requireDev, (req, res) => {
  try {
    const { name, description, icon, sort_order, parent_id, webhook_url, webhook_template, webhook_enabled, email_enabled, push_enabled, is_shorts_category } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const result = db.prepare('INSERT INTO categories (name, slug, description, icon, sort_order, parent_id, webhook_url, webhook_template, webhook_enabled, email_enabled, push_enabled, is_shorts_category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(name, slug, description || '', icon || 'Film', sort_order || 0, parent_id || null, webhook_url || '', webhook_template || '', webhook_enabled ? 1 : 0, email_enabled ? 1 : 0, push_enabled ? 1 : 0, is_shorts_category ? 1 : 0);
    const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);
    audit(req.session.user.id, "create", "category", cat.id, name);
    res.json({ success: true, category: cat });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update category (dev only)
app.put('/api/categories/:id', requireDev, (req, res) => {
  try {
    const { name, description, icon, sort_order, parent_id, webhook_url, webhook_template, webhook_enabled, email_enabled, push_enabled, is_shorts_category } = req.body;
    const slug = name ? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : undefined;
    if (name) db.prepare('UPDATE categories SET name=?, slug=?, description=?, icon=?, sort_order=?, parent_id=?, webhook_url=?, webhook_template=?, webhook_enabled=?, email_enabled=?, push_enabled=?, is_shorts_category=? WHERE id=?')
      .run(name, slug, description || '', icon || 'Film', sort_order || 0, parent_id || null, webhook_url || '', webhook_template || '', webhook_enabled ? 1 : 0, email_enabled ? 1 : 0, push_enabled ? 1 : 0, is_shorts_category ? 1 : 0, req.params.id);
    audit(req.session.user.id, "edit", "category", parseInt(req.params.id), name || "");
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete category (dev only)
app.delete('/api/categories/:id', requireDev, (req, res) => {
  try {
    const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
    if (cat) db.prepare('UPDATE categories SET parent_id = ? WHERE parent_id = ?').run(cat.parent_id || null, req.params.id);
    db.prepare('UPDATE videos SET category_id = NULL WHERE category_id = ?').run(req.params.id);
    db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
    audit(req.session.user.id, "delete", "category", parseInt(req.params.id), cat?.name || "");
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Set category access (dev only)
// New payload: { viewer_mode, editor_mode, viewers, editors, rank_viewers, rank_editors, viewer_user_ids, editor_user_ids }
// viewer_mode: 'public' | 'roles' | 'custom'
// editor_mode: 'none' | 'roles' | 'custom'
app.post('/api/categories/:id/access', requireDev, (req, res) => {
  try {
    const { viewer_mode, editor_mode, viewers, editors, rank_viewers, rank_editors, viewer_user_ids, editor_user_ids } = req.body;
    const vm = viewer_mode || 'public';
    const em = editor_mode || 'none';
    const catId = req.params.id;

    db.prepare('UPDATE categories SET access_mode = ? WHERE id = ?').run(`${vm}:${em}`, catId);
    db.prepare('DELETE FROM category_access WHERE category_id = ?').run(catId);
    db.prepare('DELETE FROM category_rank_access WHERE category_id = ?').run(catId);
    db.prepare('DELETE FROM category_user_access WHERE category_id = ?').run(catId);

    if (vm === 'roles') {
      const stmtR = db.prepare('INSERT OR IGNORE INTO category_access (category_id, discord_role_id, access_type) VALUES (?, ?, ?)');
      const stmtRank = db.prepare('INSERT OR IGNORE INTO category_rank_access (category_id, rank_id, access_type) VALUES (?, ?, ?)');
      (viewers || []).forEach(r => stmtR.run(catId, r, 'viewer'));
      (rank_viewers || []).forEach(rid => stmtRank.run(catId, rid, 'viewer'));
    }
    if (em === 'roles') {
      const stmtR = db.prepare('INSERT OR IGNORE INTO category_access (category_id, discord_role_id, access_type) VALUES (?, ?, ?)');
      const stmtRank = db.prepare('INSERT OR IGNORE INTO category_rank_access (category_id, rank_id, access_type) VALUES (?, ?, ?)');
      (editors || []).forEach(r => stmtR.run(catId, r, 'editor'));
      (rank_editors || []).forEach(rid => stmtRank.run(catId, rid, 'editor'));
    }
    if (vm === 'custom') {
      const stmt = db.prepare('INSERT OR IGNORE INTO category_user_access (category_id, user_id, access_type) VALUES (?, ?, ?)');
      (viewer_user_ids || []).forEach(uid => stmt.run(catId, uid, 'viewer'));
    }
    if (em === 'custom') {
      const stmt = db.prepare('INSERT OR IGNORE INTO category_user_access (category_id, user_id, access_type) VALUES (?, ?, ?)');
      (editor_user_ids || []).forEach(uid => stmt.run(catId, uid, 'editor'));
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get category user access list (dev only)
app.get('/api/categories/:id/user-access', requireDev, (req, res) => {
  try {
    const cat = db.prepare('SELECT access_mode FROM categories WHERE id = ?').get(req.params.id);
    if (!cat) return res.status(404).json({ error: 'Not found' });
    const viewerUsers = db.prepare("SELECT u.id, u.username, u.display_name FROM category_user_access cua JOIN users u ON cua.user_id = u.id WHERE cua.category_id = ? AND cua.access_type = 'viewer'").all(req.params.id);
    const editorUsers = db.prepare("SELECT u.id, u.username, u.display_name FROM category_user_access cua JOIN users u ON cua.user_id = u.id WHERE cua.category_id = ? AND cua.access_type = 'editor'").all(req.params.id);
    res.json({ access_mode: cat.access_mode || 'public:none', viewer_users: viewerUsers, editor_users: editorUsers });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ APP RANKS API ============
app.get('/api/ranks', requireAuth, (req, res) => {
  try {
    const ranks = db.prepare('SELECT * FROM app_ranks ORDER BY name').all();
    res.json(ranks);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/ranks', requireAdmin, (req, res) => {
  try {
    const { name, description, color } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Nazwa rangi jest wymagana.' });
    const result = db.prepare('INSERT INTO app_ranks (name, description, color) VALUES (?, ?, ?)').run(name.trim(), description || '', color || '#6366f1');
    const rank = db.prepare('SELECT * FROM app_ranks WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, rank });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Ranga o tej nazwie już istnieje.' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/ranks/:id', requireAdmin, (req, res) => {
  try {
    const { name, description, color } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Nazwa rangi jest wymagana.' });
    db.prepare('UPDATE app_ranks SET name=?, description=?, color=? WHERE id=?').run(name.trim(), description || '', color || '#6366f1', req.params.id);
    res.json({ success: true });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Ranga o tej nazwie już istnieje.' });
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/ranks/:id', requireAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM app_ranks WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get ranks assigned to a user
app.get('/api/users/:id/ranks', requireAdmin, (req, res) => {
  try {
    const ranks = db.prepare(`
      SELECT r.* FROM app_ranks r
      JOIN user_rank_assignments ura ON r.id = ura.rank_id
      WHERE ura.user_id = ?
      ORDER BY r.name
    `).all(req.params.id);
    res.json(ranks);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Set ranks for a user (replaces all current assignments)
app.post('/api/users/:id/ranks', requireAdmin, (req, res) => {
  try {
    const { rank_ids } = req.body;
    const userId = parseInt(req.params.id);
    db.prepare('DELETE FROM user_rank_assignments WHERE user_id = ?').run(userId);
    if (rank_ids && rank_ids.length > 0) {
      const stmt = db.prepare('INSERT OR IGNORE INTO user_rank_assignments (user_id, rank_id, assigned_by) VALUES (?, ?, ?)');
      rank_ids.forEach(rid => stmt.run(userId, rid, req.session.user.id));
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ VIDEO ACCESS API ============
app.get('/api/videos/:id/access', requireAdmin, (req, res) => {
  try {
    const users = db.prepare('SELECT u.id, u.username, u.display_name FROM video_access va JOIN users u ON va.user_id = u.id WHERE va.video_id = ?').all(req.params.id);
    const video = db.prepare('SELECT access_mode FROM videos WHERE id = ?').get(req.params.id);
    res.json({ access_mode: video?.access_mode || 'category', users });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/videos/:id/access', requireAdmin, (req, res) => {
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
app.post('/api/videos/bulk', requireAdmin, (req, res) => {
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

// ============ AUTHORS API ============
app.get('/api/authors', requireAuth, (req, res) => {
  const authors = db.prepare(`
    SELECT DISTINCT u.id, u.username, u.display_name FROM users u
    JOIN videos v ON v.author_id = u.id ORDER BY u.display_name
  `).all();
  res.json(authors);
});

app.get('/api/authors/:id', requireAuth, (req, res) => {
  const author = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar, u.bio, u.created_at,
      COUNT(v.id) AS video_count
    FROM users u LEFT JOIN videos v ON v.author_id = u.id
    WHERE u.id = ?
    GROUP BY u.id
  `).get(parseInt(req.params.id));
  if (!author) return res.status(404).json({ error: 'Autor nie znaleziony.' });
  if (author.video_count === 0) return res.status(404).json({ error: 'To konto nie opublikowało żadnego filmu.' });
  res.json(author);
});

// ============ USERS API ============
app.get('/api/users', requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, display_name, avatar, role, auth_method, created_at, last_login, discord_roles, email, discord_email FROM users ORDER BY created_at DESC').all();
  res.json(users);
});

app.delete('/api/users/:id', requireAdmin, (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    // Prevent deleting yourself
    if (userId === req.session.user.id) {
      return res.status(400).json({ error: 'Nie możesz usunąć własnego konta.' });
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'Użytkownik nie znaleziony.' });
    // Clear related data
    db.prepare('DELETE FROM favorites WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM watch_logs WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    console.log(`[ADMIN] User deleted: ${user.display_name} (ID: ${userId}) by ${req.session.user.display_name}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users/all', requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, display_name, avatar, role FROM users ORDER BY display_name').all();
  res.json(users);
});

// Create user manually (dev only) — for adding authors who haven't logged in yet
app.post('/api/debug/create-user', requireDev, (req, res) => {
  try {
    const { username, display_name, role, discord_id, avatar } = req.body;
    if (!username || !display_name) {
      return res.status(400).json({ error: 'username and display_name are required' });
    }
    const validRole = ['member', 'admin', 'dev'].includes(role) ? role : 'member';
    const result = db.prepare(
      `INSERT INTO users (username, display_name, role, auth_method, discord_id, avatar) VALUES (?, ?, ?, 'manual', ?, ?)`
    ).run(username, display_name, validRole, discord_id || null, avatar || null);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    console.log(`[DEBUG] User created manually: ${display_name} (ID: ${user.id})`);
    res.json({ success: true, user });
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============ IMPERSONATION (dev only) ============
// req.session.user is fully replaced with the target's identity — including role — so the
// impersonated session gets *exactly* what that user would see, permission-wise. That also
// means it loses dev-only route access for the duration, which is why "stop impersonating"
// can't live behind a dev-gated page — it has to be reachable from anywhere (see the Layout.jsx
// banner) — and why this checks session.impersonatorId rather than requireDev.
function buildSessionUser(u) {
  return {
    id: u.id,
    discord_id: u.discord_id,
    username: u.username,
    display_name: u.display_name,
    avatar: u.avatar,
    role: u.role,
    auth_method: u.auth_method,
    discord_roles: JSON.parse(u.discord_roles || '[]'),
  };
}

app.post('/api/debug/impersonate/:userId', requireDev, (req, res) => {
  try {
    if (req.session.impersonatorId) return res.status(400).json({ error: 'Już się kogoś podszywasz — najpierw wróć do swojego konta.' });
    const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.userId);
    if (!target) return res.status(404).json({ error: 'Nie znaleziono użytkownika.' });
    if (target.id === req.session.user.id) return res.status(400).json({ error: 'Nie możesz zalogować się na samego siebie.' });

    audit(req.session.user.id, 'impersonate_start', 'user', target.id,
      `${req.session.user.display_name || req.session.user.username} zalogował się jako ${target.display_name || target.username}`);

    req.session.impersonatorId = req.session.user.id;
    req.session.user = buildSessionUser(target);
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: 'Session save error' });
      res.json({ success: true, user: req.session.user });
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/debug/stop-impersonating', requireAuth, (req, res) => {
  try {
    if (!req.session.impersonatorId) return res.status(400).json({ error: 'Nie jesteś w trybie podszywania.' });
    const original = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.impersonatorId);
    if (!original) return res.status(500).json({ error: 'Nie udało się odnaleźć oryginalnego konta.' });

    audit(original.id, 'impersonate_stop', 'user', req.session.user.id,
      `${original.display_name || original.username} wrócił z podszywania się pod ${req.session.user.display_name || req.session.user.username}`);

    req.session.user = buildSessionUser(original);
    delete req.session.impersonatorId;
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: 'Session save error' });
      res.json({ success: true, user: req.session.user });
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ LOGS API ============
app.get('/api/logs/watch', requireAdmin, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const perPage = parseInt(getSetting('logs_per_page', '50'), 10) || 50;
  const offset = (page - 1) * perPage;
  const userId = parseInt(req.query.user_id) || null;
  const videoId = parseInt(req.query.video_id) || null;

  let where = '1=1';
  const params = [];
  if (userId) { where += ' AND wl.user_id = ?'; params.push(userId); }
  if (videoId) { where += ' AND wl.video_id = ?'; params.push(videoId); }

  const total = db.prepare(`SELECT COUNT(*) AS c FROM watch_logs wl WHERE ${where}`).get(...params).c;
  const logs = db.prepare(`
    SELECT wl.*, u.username, u.display_name AS user_display, v.title AS video_title
    FROM watch_logs wl
    LEFT JOIN users u ON wl.user_id = u.id
    LEFT JOIN videos v ON wl.video_id = v.id
    WHERE ${where}
    ORDER BY wl.watched_at DESC LIMIT ? OFFSET ?
  `).all(...params, perPage, offset);
  res.json({ logs, total, page, perPage, totalPages: Math.ceil(total / perPage) });
});

// Distinct videos that have at least one watch-log entry — used to populate the movie filter dropdown.
app.get('/api/logs/watch/videos', requireAdmin, (req, res) => {
  const videos = db.prepare(`
    SELECT DISTINCT v.id, v.title FROM watch_logs wl
    JOIN videos v ON wl.video_id = v.id
    ORDER BY v.title COLLATE NOCASE ASC
  `).all();
  res.json(videos);
});

app.get('/api/logs/login', requireAdmin, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const perPage = parseInt(getSetting('logs_per_page', '50'), 10) || 50;
  const offset = (page - 1) * perPage;
  const userId = parseInt(req.query.user_id) || null;

  let where = '1=1';
  const params = [];
  if (userId) { where += ' AND user_id = ?'; params.push(userId); }

  const total = db.prepare(`SELECT COUNT(*) AS c FROM login_logs WHERE ${where}`).get(...params).c;
  const logs = db.prepare(`SELECT * FROM login_logs WHERE ${where} ORDER BY logged_at DESC LIMIT ? OFFSET ?`).all(...params, perPage, offset);
  res.json({ logs, total, page, perPage, totalPages: Math.ceil(total / perPage) });
});

// ============ FAVORITES API ============
app.get('/api/favorites', requireAuth, (req, res) => {
  try {
    const favs = db.prepare(`
      SELECT v.*, u.username AS author_name, u.display_name AS author_display_name,
      GROUP_CONCAT(DISTINCT t.name) AS tag_names, GROUP_CONCAT(DISTINCT t.id) AS tag_ids,
      f.created_at AS favorited_at
      FROM favorites f
      JOIN videos v ON f.video_id = v.id
      LEFT JOIN users u ON v.author_id = u.id
      LEFT JOIN video_tags vt ON v.id = vt.video_id
      LEFT JOIN tags t ON vt.tag_id = t.id
      WHERE f.user_id = ?
      GROUP BY v.id
      ORDER BY f.created_at DESC
    `).all(req.session.user.id);
    res.json(favs.map(v => ({
      ...v,
      tags: v.tag_names ? v.tag_names.split(',').map((name, i) => ({ id: parseInt(v.tag_ids.split(',')[i]), name })) : []
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/favorites/:videoId', requireAuth, (req, res) => {
  try {
    db.prepare('INSERT OR IGNORE INTO favorites (user_id, video_id) VALUES (?, ?)').run(req.session.user.id, req.params.videoId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/favorites/:videoId', requireAuth, (req, res) => {
  try {
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND video_id = ?').run(req.session.user.id, req.params.videoId);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/favorites/check/:videoId', requireAuth, (req, res) => {
  const fav = db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND video_id = ?').get(req.session.user.id, req.params.videoId);
  const count = db.prepare('SELECT COUNT(*) AS c FROM favorites WHERE video_id = ?').get(req.params.videoId);
  res.json({ isFavorite: !!fav, count: count?.c || 0 });
});

// ============ VIDEO ANALYTICS ============
// Batched sampled player events (self-hosted only) — the frontend buffers play/pause/seek and
// flushes every ~15s / on pause / on unload, never one request per raw event.
app.post('/api/videos/:id/playback-events', requireAuth, (req, res) => {
  try {
    const events = Array.isArray(req.body.events) ? req.body.events.slice(0, 200) : [];
    const context = req.body.context === 'watch_party' ? 'watch_party' : 'solo';
    if (events.length > 0) {
      const insert = db.prepare('INSERT INTO video_playback_events (video_id, user_id, event_type, position, from_position, context) VALUES (?, ?, ?, ?, ?, ?)');
      const insertMany = db.transaction((rows) => {
        for (const e of rows) {
          if (!['play', 'pause', 'seek'].includes(e.event_type)) continue;
          const position = Number(e.position);
          if (!Number.isFinite(position) || position < 0) continue;
          const fromPosition = Number(e.from_position);
          insert.run(req.params.id, req.session.user.id, e.event_type, position, Number.isFinite(fromPosition) ? fromPosition : null, context);
        }
      });
      insertMany(events);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// videos.* has no canonical duration column (only ever reported client-side) — the longest
// duration any viewer's player has reported is the best approximation available.
function getVideoDuration(videoId) {
  const wp = db.prepare('SELECT MAX(duration) AS d FROM watch_progress WHERE video_id = ?').get(videoId);
  if (wp?.d > 0) return wp.d;
  const pe = db.prepare('SELECT MAX(position) AS d FROM video_playback_events WHERE video_id = ?').get(videoId);
  return pe?.d || 0;
}

function bucketPositions(positions, duration, bucketCount) {
  const buckets = new Array(bucketCount).fill(0);
  if (!duration || duration <= 0) return buckets;
  const bucketSize = duration / bucketCount;
  for (const pos of positions) {
    const idx = Math.min(bucketCount - 1, Math.max(0, Math.floor(pos / bucketSize)));
    buckets[idx]++;
  }
  return buckets;
}

const ANALYTICS_BUCKETS = 50;

// Distinct viewers for a video under a given context filter — powers both the per-user picker
// and the unique-viewers summary stat. watch_progress is solo-only by construction (Watch Party
// never writes to it), so it's excluded entirely once 'watch_party' is asked for specifically.
function getVideoViewerUsers(videoId, context) {
  const ids = new Set();
  if (context !== 'watch_party') {
    for (const r of db.prepare('SELECT DISTINCT user_id FROM watch_progress WHERE video_id = ?').all(videoId)) ids.add(r.user_id);
  }
  const ctxCond = context === 'all' ? '' : 'AND context = ?';
  const ctxParams = context === 'all' ? [videoId] : [videoId, context];
  for (const r of db.prepare(`SELECT DISTINCT user_id FROM watch_logs WHERE video_id = ? ${ctxCond}`).all(...ctxParams)) ids.add(r.user_id);
  for (const r of db.prepare(`SELECT DISTINCT user_id FROM video_playback_events WHERE video_id = ? ${ctxCond}`).all(...ctxParams)) ids.add(r.user_id);
  if (ids.size === 0) return [];
  const placeholders = [...ids].map(() => '?').join(',');
  return db.prepare(`SELECT id, username, display_name FROM users WHERE id IN (${placeholders})`).all(...ids);
}

app.get('/api/videos/:id/analytics', requireAuth, (req, res) => {
  try {
    const video = db.prepare('SELECT id, author_id FROM videos WHERE id = ?').get(req.params.id);
    if (!video) return res.status(404).json({ error: 'Nie znaleziono filmu.' });
    const isOwner = video.author_id === req.session.user.id;
    const isAdmin = req.session.user.role === 'admin' || req.session.user.role === 'dev';
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Brak uprawnień.' });

    const context = ['solo', 'watch_party'].includes(req.query.context) ? req.query.context : 'all';
    const userId = req.query.user_id ? parseInt(req.query.user_id) : null;
    const ctxCond = context === 'all' ? '' : 'AND context = ?';

    // Watch-time-over-time — daily view count, last 30 days.
    const dailyParams = [video.id];
    let dailySql = `SELECT DATE(watched_at) AS day, COUNT(*) AS views FROM watch_logs WHERE video_id = ? AND watched_at >= datetime('now', '-30 days')`;
    if (context !== 'all') { dailySql += ' AND context = ?'; dailyParams.push(context); }
    if (userId) { dailySql += ' AND user_id = ?'; dailyParams.push(userId); }
    dailySql += ' GROUP BY DATE(watched_at) ORDER BY day ASC';
    const dailyViews = db.prepare(dailySql).all(...dailyParams);

    let heatmap = null;
    const duration = getVideoDuration(video.id);
    if (duration > 0) {
      const evParams = context === 'all' ? [video.id] : [video.id, context];
      const userCond = userId ? 'AND user_id = ?' : '';
      const withUser = (params) => userId ? [...params, userId] : params;

      const pauses = db.prepare(`SELECT position FROM video_playback_events WHERE video_id = ? ${ctxCond} AND event_type = 'pause' ${userCond}`)
        .all(...withUser(evParams)).map(r => r.position);
      const rewinds = db.prepare(`SELECT position FROM video_playback_events WHERE video_id = ? ${ctxCond} AND event_type = 'seek' AND from_position IS NOT NULL AND position < from_position ${userCond}`)
        .all(...withUser(evParams)).map(r => r.position);
      const skips = db.prepare(`SELECT from_position AS position FROM video_playback_events WHERE video_id = ? ${ctxCond} AND event_type = 'seek' AND from_position IS NOT NULL AND position > from_position ${userCond}`)
        .all(...withUser(evParams)).map(r => r.position);

      // Retention curve: for each bucket, the fraction of viewers whose furthest-ever position
      // reached at least that point — the standard simplified retention-graph definition (not
      // true frame-by-frame "were they actively watching" reconstruction).
      const progressPositions = context === 'watch_party' ? [] : (() => {
        let sql = 'SELECT user_id, MAX(position) AS position FROM watch_progress WHERE video_id = ?';
        const params = [video.id];
        if (userId) { sql += ' AND user_id = ?'; params.push(userId); }
        return db.prepare(sql + ' GROUP BY user_id').all(...params);
      })();
      const eventPositions = db.prepare(`SELECT user_id, MAX(position) AS position FROM video_playback_events WHERE video_id = ? ${ctxCond} ${userCond} GROUP BY user_id`)
        .all(...withUser(evParams));
      const furthestByUser = {};
      for (const r of [...progressPositions, ...eventPositions]) {
        furthestByUser[r.user_id] = Math.max(furthestByUser[r.user_id] || 0, r.position || 0);
      }
      const furthestValues = Object.values(furthestByUser);
      const bucketSize = duration / ANALYTICS_BUCKETS;
      const retention = new Array(ANALYTICS_BUCKETS).fill(0);
      if (furthestValues.length > 0) {
        for (let i = 0; i < ANALYTICS_BUCKETS; i++) {
          const bucketStart = i * bucketSize;
          retention[i] = furthestValues.filter(p => p >= bucketStart).length / furthestValues.length;
        }
      }

      heatmap = {
        duration,
        buckets: ANALYTICS_BUCKETS,
        viewers: furthestValues.length,
        retention,
        pauses: bucketPositions(pauses, duration, ANALYTICS_BUCKETS),
        rewinds: bucketPositions(rewinds, duration, ANALYTICS_BUCKETS),
        skips: bucketPositions(skips, duration, ANALYTICS_BUCKETS),
      };
    }

    const viewers = getVideoViewerUsers(video.id, context);
    const summary = {
      uniqueViewers: viewers.length,
      avgCompletionPct: (heatmap && heatmap.viewers > 0)
        ? Math.round((heatmap.retention.reduce((a, b) => a + b, 0) / ANALYTICS_BUCKETS) * 100)
        : null,
    };

    res.json({ dailyViews, heatmap, summary, viewers, context, userId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Reset analytics source data for a video — optionally scoped to a time window and/or a single
// user. Only touches video_playback_events and watch_logs (the actual analytics-source tables);
// deliberately leaves watch_progress alone since that's a viewer's own personal resume position
// for "Continue watching", not something an author/admin resetting analytics should be able to
// wipe out for someone else as a side effect.
app.delete('/api/videos/:id/analytics', requireAuth, (req, res) => {
  try {
    const video = db.prepare('SELECT id, author_id FROM videos WHERE id = ?').get(req.params.id);
    if (!video) return res.status(404).json({ error: 'Nie znaleziono filmu.' });
    const isOwner = video.author_id === req.session.user.id;
    const isAdmin = req.session.user.role === 'admin' || req.session.user.role === 'dev';
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Brak uprawnień.' });

    const { before, after, user_id } = req.body || {};
    const conds = ['video_id = ?'];
    const params = [video.id];
    if (user_id) { conds.push('user_id = ?'); params.push(parseInt(user_id)); }
    if (after) { conds.push('created_at >= ?'); params.push(after); }
    if (before) { conds.push('created_at <= ?'); params.push(before); }
    const where = conds.join(' AND ');

    const evInfo = db.prepare(`DELETE FROM video_playback_events WHERE ${where}`).run(...params);
    // watch_logs uses watched_at, not created_at — same filter values, different column name.
    const logsWhere = where.replace(/created_at/g, 'watched_at');
    const logsInfo = db.prepare(`DELETE FROM watch_logs WHERE ${logsWhere}`).run(...params);

    audit(req.session.user.id, 'delete', 'video_analytics', video.id,
      `usunięto ${evInfo.changes} zdarzeń i ${logsInfo.changes} wyświetleń${user_id ? ` (użytkownik #${user_id})` : ''}${after || before ? ` (okres: ${after || '...'} – ${before || '...'})` : ''}`);
    res.json({ success: true, deletedEvents: evInfo.changes, deletedViews: logsInfo.changes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ WATCH HISTORY (personal) ============
app.get('/api/history', requireAuth, (req, res) => {
  try {
    // No limit — full history for logged-in user
    const history = db.prepare(`
      SELECT wl.watched_at, v.id, v.title, v.thumbnail, v.publish_date,
      u.username AS author_name, u.display_name AS author_display_name
      FROM watch_logs wl
      JOIN videos v ON wl.video_id = v.id
      LEFT JOIN users u ON v.author_id = u.id
      WHERE wl.user_id = ?
      ORDER BY wl.watched_at DESC
    `).all(req.session.user.id);
    res.json(history);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ STATS API ============
app.get('/api/stats', requireAuth, (req, res) => {
  try {
    const totalVideos = db.prepare('SELECT COUNT(*) AS c FROM videos').get().c;
    const totalUsers = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    const totalViews = db.prepare('SELECT COUNT(*) AS c FROM watch_logs').get().c;
    const totalTags = db.prepare('SELECT COUNT(*) AS c FROM tags').get().c;
    const totalCategories = db.prepare('SELECT COUNT(*) AS c FROM categories').get().c;

    const mostWatched = db.prepare(`
      SELECT v.id, v.title, v.thumbnail, COUNT(wl.id) AS views, u.display_name AS author_display_name
      FROM watch_logs wl JOIN videos v ON wl.video_id = v.id LEFT JOIN users u ON v.author_id = u.id
      GROUP BY v.id ORDER BY views DESC LIMIT 10
    `).all();

    const topViewers = db.prepare(`
      SELECT u.id, u.display_name, u.avatar, COUNT(wl.id) AS total_views
      FROM watch_logs wl JOIN users u ON wl.user_id = u.id
      GROUP BY u.id ORDER BY total_views DESC LIMIT 10
    `).all();

    const recentActivity = db.prepare(`
      SELECT DATE(wl.watched_at) AS day, COUNT(*) AS views
      FROM watch_logs wl WHERE wl.watched_at >= datetime('now', '-30 days')
      GROUP BY day ORDER BY day ASC
    `).all();

    const tagCloud = db.prepare(`
      SELECT t.id, t.name, COUNT(vt.video_id) AS count
      FROM tags t JOIN video_tags vt ON t.id = vt.tag_id
      GROUP BY t.id ORDER BY count DESC LIMIT 20
    `).all();

    const topAuthors = db.prepare(`
      SELECT u.id, u.display_name, u.avatar, COUNT(v.id) AS video_count
      FROM users u JOIN videos v ON u.id = v.author_id
      GROUP BY u.id ORDER BY video_count DESC LIMIT 10
    `).all();

    const myStats = {
      views: db.prepare('SELECT COUNT(*) AS c FROM watch_logs WHERE user_id = ?').get(req.session.user.id).c,
      favorites: db.prepare('SELECT COUNT(*) AS c FROM favorites WHERE user_id = ?').get(req.session.user.id).c,
    };

    const isAdminUser = req.session.user.role === 'admin' || req.session.user.role === 'dev';
    res.json({ totalVideos, totalUsers, totalViews, totalTags, totalCategories, mostWatched, ...(isAdminUser ? { topViewers } : {}), recentActivity, tagCloud, topAuthors, myStats });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ PROFILE API ============
app.get('/api/profile', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, username, display_name, avatar, role, bio, auth_method, avatar_source, discord_id, discord_email, ts3_uid, ts6_uid, discord_guild_avatar_hash, email, email_notifications, created_at, last_login FROM users WHERE id = ?').get(req.session.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const videoCount = db.prepare('SELECT COUNT(*) AS c FROM videos WHERE author_id = ?').get(user.id).c;
  const viewCount = db.prepare('SELECT COUNT(*) AS c FROM watch_logs WHERE user_id = ?').get(user.id).c;
  const favCount = db.prepare('SELECT COUNT(*) AS c FROM favorites WHERE user_id = ?').get(user.id).c;
  const { discord_guild_avatar_hash, discord_id, discord_email, ts3_uid, ts6_uid, email_notifications, ...userFields } = user;
  res.json({
    ...userFields,
    has_guild_avatar: !!discord_guild_avatar_hash,
    has_discord: !!discord_id,
    has_teamspeak3: !!ts3_uid,
    has_teamspeak6: !!ts6_uid,
    discordEmail: discord_email || null,
    emailNotifications: !!email_notifications,
    videoCount, viewCount, favCount,
  });
});

app.put('/api/profile', requireAuth, (req, res) => {
  try {
    const { display_name, bio, avatar_source, email, email_notifications } = req.body;
    const maxName = getLimit('limit_display_name');
    const maxBio = getLimit('limit_bio');
    if (display_name !== undefined) {
      const dn = String(display_name).trim();
      if (dn.length > maxName) return res.status(400).json({ error: `Wyświetlana nazwa może mieć maksymalnie ${maxName} znaków.` });
      const safeDn = dn.slice(0, maxName);
      db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(safeDn, req.session.user.id);
      req.session.user.display_name = safeDn;
    }
    if (bio !== undefined) {
      const b = String(bio);
      if (b.length > maxBio) return res.status(400).json({ error: `Bio może mieć maksymalnie ${maxBio} znaków.` });
      db.prepare('UPDATE users SET bio = ? WHERE id = ?').run(b.slice(0, maxBio), req.session.user.id);
    }
    if (email !== undefined) {
      const e = String(email).trim();
      if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
        return res.status(400).json({ error: 'Nieprawidłowy adres e-mail.' });
      }
      db.prepare('UPDATE users SET email = ? WHERE id = ?').run(e || null, req.session.user.id);
    }
    if (email_notifications !== undefined) {
      db.prepare('UPDATE users SET email_notifications = ? WHERE id = ?').run(email_notifications ? 1 : 0, req.session.user.id);
    }
    if (avatar_source !== undefined) {
      if (!['global', 'guild'].includes(avatar_source)) {
        return res.status(400).json({ error: 'Nieprawidłowa wartość avatar_source.' });
      }
      const u = db.prepare('SELECT discord_id, discord_avatar_hash, discord_guild_avatar_hash, auth_method FROM users WHERE id = ?').get(req.session.user.id);
      if (!u.discord_id) {
        return res.status(400).json({ error: 'Źródło avatara dostępne tylko dla kont z połączonym Discordem.' });
      }
      if (avatar_source === 'guild' && !u.discord_guild_avatar_hash) {
        return res.status(400).json({ error: 'Brak avatara serwerowego — ta funkcja wymaga Discord Nitro oraz ustawionego avatara na tym serwerze.' });
      }
      const newAvatarUrl = avatar_source === 'guild'
        ? `https://cdn.discordapp.com/guilds/${process.env.DISCORD_GUILD_ID}/users/${u.discord_id}/avatars/${u.discord_guild_avatar_hash}.png`
        : (u.discord_avatar_hash
          ? `https://cdn.discordapp.com/avatars/${u.discord_id}/${u.discord_avatar_hash}.png`
          : `https://cdn.discordapp.com/embed/avatars/0.png`);
      db.prepare('UPDATE users SET avatar_source = ?, avatar = ? WHERE id = ?').run(avatar_source, newAvatarUrl, req.session.user.id);
      req.session.user.avatar = newAvatarUrl;
    }
    req.session.save(() => {});
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ ACTIVE SESSIONS / DEVICES ============
app.get('/api/profile/sessions', requireAuth, async (req, res) => {
  try {
    const sessions = await listUserSessions(req.session.user.id);
    res.json(sessions.map(s => ({ ...s, isCurrent: s.sid === req.sessionID })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/profile/sessions/:sid', requireAuth, (req, res) => {
  if (!sessionStore || typeof sessionStore.get !== 'function') return res.status(500).json({ error: 'Magazyn sesji niedostępny.' });
  const { sid } = req.params;
  sessionStore.get(sid, (err, sess) => {
    if (err || !sess || sess.user?.id !== req.session.user.id) {
      return res.status(404).json({ error: 'Nie znaleziono sesji.' });
    }
    sessionStore.destroy(sid, (destroyErr) => {
      if (destroyErr) return res.status(500).json({ error: destroyErr.message });
      res.json({ success: true });
    });
  });
});

// ============ WEB PUSH SUBSCRIPTIONS ============
app.get('/api/push/vapid-public-key', requireAuth, (req, res) => {
  res.json({ publicKey: getVapidKeys().publicKey });
});

app.post('/api/push/subscribe', requireAuth, (req, res) => {
  try {
    const { endpoint, keys } = req.body?.subscription || req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) return res.status(400).json({ error: 'Nieprawidłowa subskrypcja push.' });
    db.prepare(`
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth
    `).run(req.session.user.id, endpoint, keys.p256dh, keys.auth);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/push/unsubscribe', requireAuth, (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'Brak endpoint.' });
    db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(endpoint, req.session.user.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Re-fetch avatar hashes (global + guild) from Discord via the bot — needed because they're
// otherwise only captured during the OAuth login flow, so accounts that logged in before this
// feature shipped (or whose guild avatar changed since) have stale/missing data until this runs.
app.post('/api/profile/refresh-discord', requireAuth, async (req, res) => {
  try {
    const u = db.prepare('SELECT discord_id, auth_method, avatar_source FROM users WHERE id = ?').get(req.session.user.id);
    if (!u || !u.discord_id) {
      return res.status(400).json({ error: 'Ta funkcja jest dostępna tylko dla kont z połączonym Discordem.' });
    }
    const memberRes = await fetch(
      `https://discord.com/api/guilds/${process.env.DISCORD_GUILD_ID}/members/${u.discord_id}`,
      { headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` } }
    );
    if (!memberRes.ok) {
      return res.status(502).json({ error: 'Nie udało się pobrać danych z Discorda.' });
    }
    const member = await memberRes.json();
    const discordAvatarHash = member.user?.avatar || null;
    const discordGuildAvatarHash = member.avatar || null;
    const avatarSource = u.avatar_source || 'global';
    const avatarUrl = (avatarSource === 'guild' && discordGuildAvatarHash)
      ? `https://cdn.discordapp.com/guilds/${process.env.DISCORD_GUILD_ID}/users/${u.discord_id}/avatars/${discordGuildAvatarHash}.png`
      : (discordAvatarHash
        ? `https://cdn.discordapp.com/avatars/${u.discord_id}/${discordAvatarHash}.png`
        : `https://cdn.discordapp.com/embed/avatars/0.png`);
    db.prepare('UPDATE users SET discord_avatar_hash = ?, discord_guild_avatar_hash = ?, avatar = ? WHERE id = ?')
      .run(discordAvatarHash, discordGuildAvatarHash, avatarUrl, req.session.user.id);
    req.session.user.avatar = avatarUrl;
    req.session.save(() => {});
    res.json({ success: true, has_guild_avatar: !!discordGuildAvatarHash, avatar: avatarUrl });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Account-linking merge confirmation — a pending merge is only usable by the session
// that initiated it (the OAuth/TS link flow always stamps primaryId with the requester's
// own session id at creation time).
app.get('/api/profile/merge/:mergeId', requireAuth, (req, res) => {
  const pending = getPendingMerge(req.params.mergeId);
  if (!pending) return res.status(404).json({ error: 'Prośba o połączenie kont wygasła lub nie istnieje.' });
  if (pending.primaryId !== req.session.user.id) return res.status(403).json({ error: 'Forbidden' });
  res.json({ secondaryLabel: pending.secondaryLabel, stats: pending.stats, identities: pending.identities });
});

app.post('/api/profile/merge/:mergeId/confirm', requireAuth, (req, res) => {
  const pending = getPendingMerge(req.params.mergeId);
  if (!pending) return res.status(404).json({ error: 'Prośba o połączenie kont wygasła lub nie istnieje.' });
  if (pending.primaryId !== req.session.user.id) return res.status(403).json({ error: 'Forbidden' });
  try {
    consumePendingMerge(req.params.mergeId);
    const merged = mergeUsers(pending.primaryId, pending.secondaryId, { performedBy: req.session.user.id });
    req.session.user.discord_id = merged.discord_id;
    req.session.user.avatar = merged.avatar;
    req.session.save(() => res.json({ success: true }));
  } catch (err) {
    res.status(500).json({ error: 'Nie udało się połączyć kont: ' + err.message });
  }
});

app.delete('/api/profile/merge/:mergeId', requireAuth, (req, res) => {
  const pending = getPendingMerge(req.params.mergeId);
  if (!pending) return res.json({ success: true }); // already gone — nothing to cancel
  if (pending.primaryId !== req.session.user.id) return res.status(403).json({ error: 'Forbidden' });
  consumePendingMerge(req.params.mergeId);
  res.json({ success: true });
});

// Unlink a single identity (Discord/TS3/TS6) from the current account. Unlike merge, this
// never touches another row — it's just a column-clear on this same user row, so id, role,
// comments, authored videos etc. all stay put. The freed identity (discord_id/ts3_uid/ts6_uid)
// goes back to NULL, so the next login with it won't match this row anymore — it'll either
// create a brand-new account or be linked fresh into a different one, exactly like an
// identity that was never connected here in the first place.
app.post('/api/profile/unlink', requireAuth, (req, res) => {
  const { method } = req.body; // 'discord' | 'teamspeak3' | 'teamspeak' (TS6 — see identityList)
  if (!['discord', 'teamspeak3', 'teamspeak'].includes(method)) {
    return res.status(400).json({ error: 'Nieprawidłowa metoda.' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const identities = identityList(user);
  if (!identities.includes(method)) {
    return res.status(400).json({ error: 'To konto nie ma połączonej tej metody logowania.' });
  }
  if (identities.length <= 1) {
    return res.status(400).json({ error: 'Nie można rozłączyć jedynej metody logowania — dodaj najpierw inną.' });
  }

  try {
    if (method === 'discord') {
      // Avatar only ever comes from Discord in this codebase (TS-only accounts have avatar =
      // NULL and the frontend falls back to a generated one) — clear it along with the identity.
      db.prepare(`UPDATE users SET discord_id = NULL, discord_roles = '[]', discord_avatar_hash = NULL,
                  discord_guild_avatar_hash = NULL, discord_email = NULL, avatar_source = 'global', avatar = NULL WHERE id = ?`).run(user.id);
      req.session.user.discord_id = null;
      req.session.user.avatar = null;
    } else {
      const uidCol = method === 'teamspeak3' ? 'ts3_uid' : 'ts6_uid';
      const ipCol = method === 'teamspeak3' ? 'ts3_ip' : 'ts6_ip';
      db.prepare(`UPDATE users SET ${uidCol} = NULL, ${ipCol} = NULL WHERE id = ?`).run(user.id);
    }
    audit(req.session.user.id, 'unlink_account', 'user', user.id, method);
    req.session.save(() => res.json({ success: true }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ GDPR / RODO ============
// Data export + account deletion (anonymization). Gated behind the gdpr_region setting so it's
// only exposed where legally required. Deletion never removes the users row — comments/videos
// reference it — it blanks PII on that same row instead (see anonymizeUser below).
function gdprEnabled() {
  return getSetting('gdpr_region', 'off') !== 'off';
}

function buildUserDataExport(userId) {
  const user = db.prepare('SELECT id, username, display_name, bio, role, auth_method, discord_id, discord_email, email, email_notifications, ts3_uid, ts6_uid, created_at, last_login FROM users WHERE id = ?').get(userId);
  return {
    exported_at: new Date().toISOString(),
    profile: user,
    comments: db.prepare('SELECT c.content, c.created_at, v.title AS video_title FROM comments c JOIN videos v ON c.video_id = v.id WHERE c.user_id = ? AND c.deleted = 0').all(userId),
    authored_videos: db.prepare('SELECT id, title, created_at, publish_date FROM videos WHERE author_id = ?').all(userId),
    watch_history: db.prepare('SELECT video_id, watched_at FROM watch_logs WHERE user_id = ?').all(userId),
    favorites: db.prepare('SELECT video_id, created_at FROM favorites WHERE user_id = ?').all(userId),
    login_history: db.prepare('SELECT auth_method, ip_address, success, logged_at FROM login_logs WHERE user_id = ? ORDER BY logged_at DESC LIMIT 500').all(userId),
  };
}

function anonymizeUser(userId) {
  const u = db.prepare('SELECT username, display_name FROM users WHERE id = ?').get(userId);
  if (!u) return;
  db.prepare(`UPDATE users SET
    username = ?, display_name = 'Usunięty użytkownik', bio = '', avatar = NULL, avatar_source = 'global',
    discord_id = NULL, discord_roles = '[]', discord_avatar_hash = NULL, discord_guild_avatar_hash = NULL, discord_email = NULL,
    email = NULL, email_notifications = 0,
    ts3_uid = NULL, ts3_ip = NULL, ts6_uid = NULL, ts6_ip = NULL, role = 'member',
    is_anonymized = 1, anonymized_original_username = ?, anonymized_original_display_name = ?,
    anonymized_at = datetime('now')
    WHERE id = ?`).run(`deleted_user_${userId}`, u.username, u.display_name, userId);
  invalidateUserSessions(userId);
}

// Fire-and-forget, same philosophy as sendCategoryEmailNotifications — a bad send should
// never block the user's request from going through.
async function notifyDevsOfGdprRequest(type, requestingUser) {
  const devs = db.prepare(`SELECT email, discord_email FROM users WHERE role = 'dev'`).all();
  if (devs.length === 0) return;
  const baseUrl = process.env.ALLOWED_ORIGIN || process.env.DISCORD_REDIRECT_URI?.replace(/\/auth.*/, '') || 'https://videos.alleria.pl';
  const typeLabel = type === 'export' ? 'eksportu danych' : 'usunięcia konta';
  const who = `${requestingUser.display_name || requestingUser.username} (@${requestingUser.username})`;
  const template = getSetting('email_template_gdpr_notify', EMAIL_TEMPLATE_DEFAULTS.gdpr_notify);
  const replacements = { '{user}': who, '{type}': typeLabel, '{url}': `${baseUrl}/manage?tab=gdpr` };
  const bodyHtml = renderTemplateParagraphs(template, replacements);
  const html = wrapEmailHtml({ bodyHtml, ctaUrl: replacements['{url}'], ctaLabel: 'Przejdź do zgłoszeń RODO' });
  for (const d of devs) {
    const to = d.email || d.discord_email;
    if (!to) continue;
    await sendEmail({ to, subject: `Nowe zgłoszenie RODO: ${typeLabel}`, html });
  }
}

// Fire-and-forget — called right after an admin approves a request. For 'deletion' the caller
// must pass the user's contact info fetched BEFORE anonymizeUser() wipes it.
async function notifyUserOfGdprResult(type, user) {
  const to = user.email || user.discord_email;
  if (!to) return;
  const baseUrl = process.env.ALLOWED_ORIGIN || process.env.DISCORD_REDIRECT_URI?.replace(/\/auth.*/, '') || 'https://videos.alleria.pl';
  if (type === 'export') {
    const template = getSetting('email_template_gdpr_result_export', EMAIL_TEMPLATE_DEFAULTS.gdpr_result_export);
    const bodyHtml = renderTemplateParagraphs(template, {});
    const html = wrapEmailHtml({ bodyHtml, ctaUrl: `${baseUrl}/profile`, ctaLabel: 'Przejdź do profilu' });
    await sendEmail({ to, subject: 'Twój eksport danych jest gotowy', html });
  } else {
    const template = getSetting('email_template_gdpr_result_deletion', EMAIL_TEMPLATE_DEFAULTS.gdpr_result_deletion);
    const bodyHtml = renderTemplateParagraphs(template, {});
    const html = wrapEmailHtml({ bodyHtml });
    await sendEmail({ to, subject: 'Twoje konto zostało usunięte', html });
  }
}

app.post('/api/profile/gdpr/export', requireAuth, (req, res) => {
  if (!gdprEnabled()) return res.status(403).json({ error: 'Funkcja RODO nie jest włączona.' });
  const userId = req.session.user.id;
  const existing = db.prepare("SELECT id FROM gdpr_requests WHERE user_id = ? AND type = 'export' AND status = 'pending'").get(userId);
  if (existing) return res.status(400).json({ error: 'Masz już oczekujące zgłoszenie eksportu danych.' });
  try {
    const info = db.prepare("INSERT INTO gdpr_requests (user_id, type, due_at) VALUES (?, 'export', datetime('now', '+30 days'))").run(userId);
    const requestId = info.lastInsertRowid;
    const filename = `export_${requestId}.json`;
    fs.writeFileSync(path.join(gdprDir, filename), JSON.stringify(buildUserDataExport(userId), null, 2));
    db.prepare('UPDATE gdpr_requests SET export_file = ? WHERE id = ?').run(filename, requestId);
    audit(userId, 'gdpr_request', 'user', userId, 'export');
    notifyDevsOfGdprRequest('export', req.session.user).catch(e => console.error('[EMAIL] GDPR notify error:', e.message));
    res.json(db.prepare('SELECT * FROM gdpr_requests WHERE id = ?').get(requestId));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/profile/gdpr/deletion', requireAuth, (req, res) => {
  if (!gdprEnabled()) return res.status(403).json({ error: 'Funkcja RODO nie jest włączona.' });
  const userId = req.session.user.id;
  const existing = db.prepare("SELECT id FROM gdpr_requests WHERE user_id = ? AND type = 'deletion' AND status = 'pending'").get(userId);
  if (existing) return res.status(400).json({ error: 'Masz już oczekujące zgłoszenie usunięcia konta.' });
  try {
    const info = db.prepare("INSERT INTO gdpr_requests (user_id, type, due_at) VALUES (?, 'deletion', datetime('now', '+30 days'))").run(userId);
    audit(userId, 'gdpr_request', 'user', userId, 'deletion');
    notifyDevsOfGdprRequest('deletion', req.session.user).catch(e => console.error('[EMAIL] GDPR notify error:', e.message));
    res.json(db.prepare('SELECT * FROM gdpr_requests WHERE id = ?').get(info.lastInsertRowid));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/profile/gdpr/requests', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM gdpr_requests WHERE user_id = ? ORDER BY requested_at DESC').all(req.session.user.id));
});

app.delete('/api/profile/gdpr/requests/:id', requireAuth, (req, res) => {
  const reqRow = db.prepare('SELECT * FROM gdpr_requests WHERE id = ?').get(req.params.id);
  if (!reqRow || reqRow.user_id !== req.session.user.id) return res.status(404).json({ error: 'Nie znaleziono zgłoszenia.' });
  if (reqRow.status !== 'pending') return res.status(400).json({ error: 'Można anulować tylko oczekujące zgłoszenie.' });
  db.prepare('DELETE FROM gdpr_requests WHERE id = ?').run(reqRow.id);
  if (reqRow.export_file) { try { fs.unlinkSync(path.join(gdprDir, reqRow.export_file)); } catch (e) {} }
  res.json({ success: true });
});

app.get('/api/profile/gdpr/export/:id/download', requireAuth, (req, res) => {
  const reqRow = db.prepare('SELECT * FROM gdpr_requests WHERE id = ?').get(req.params.id);
  if (!reqRow || reqRow.user_id !== req.session.user.id || reqRow.type !== 'export' || reqRow.status !== 'approved' || !reqRow.export_file) {
    return res.status(403).json({ error: 'Plik nie jest (jeszcze) dostępny.' });
  }
  res.download(path.join(gdprDir, reqRow.export_file), `moje-dane-alleria-${reqRow.id}.json`);
});

// ============ DEBUG / DEV API ============

app.get('/api/debug/access/:type/:id', requireDev, (req, res) => {
  const { type, id } = req.params;
  const dbUsers = db.prepare('SELECT id, username, display_name, avatar, role, discord_roles FROM users ORDER BY role DESC, display_name ASC').all();

  const computeUsers = (catId, accessMode, videoCustomIds = null) =>
    dbUsers.map(u => {
      const dr = JSON.parse(u.discord_roles || '[]');
      const ur = getUserRankIds(u.id);
      if (u.role === 'dev') {
        return { id: u.id, username: u.username, display_name: u.display_name, avatar: u.avatar, role: u.role, discord_roles: dr, app_rank_ids: ur, has_access: true, can_edit: true, reason: 'dev' };
      }
      if (videoCustomIds !== null) {
        const has = videoCustomIds.has(u.id);
        return { id: u.id, username: u.username, display_name: u.display_name, avatar: u.avatar, role: u.role, discord_roles: dr, app_rank_ids: ur, has_access: has, can_edit: false, reason: has ? 'custom_video_access' : 'not_in_custom_list' };
      }
      const { canView, canEdit } = checkCatAccess(catId, accessMode, u.id, dr, ur);
      let reason = 'no_access';
      if (canEdit) reason = 'editor';
      else if (canView) {
        const { vm } = parseCatModes(accessMode);
        reason = vm === 'public' ? 'public' : vm === 'custom' ? 'custom_viewer' : 'viewer_role_or_rank';
      }
      return { id: u.id, username: u.username, display_name: u.display_name, avatar: u.avatar, role: u.role, discord_roles: dr, app_rank_ids: ur, has_access: canView, can_edit: canEdit, reason };
    });

  if (type === 'category') {
    const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
    if (!cat) return res.status(404).json({ error: 'Category not found' });
    const { vm, em } = parseCatModes(cat.access_mode);
    const rules = db.prepare('SELECT * FROM category_access WHERE category_id = ?').all(id);
    const rankRules = db.prepare('SELECT cra.*, r.name AS rank_name FROM category_rank_access cra JOIN app_ranks r ON cra.rank_id = r.id WHERE cra.category_id = ?').all(id);
    return res.json({
      type: 'category', name: cat.name, access_mode: cat.access_mode,
      viewer_mode: vm, editor_mode: em,
      viewer_roles: rules.filter(r => r.access_type === 'viewer').map(r => r.discord_role_id),
      editor_roles: rules.filter(r => r.access_type === 'editor').map(r => r.discord_role_id),
      viewer_ranks: rankRules.filter(r => r.access_type === 'viewer'),
      editor_ranks: rankRules.filter(r => r.access_type === 'editor'),
      users: computeUsers(parseInt(id), cat.access_mode),
    });
  }

  if (type === 'video') {
    const video = db.prepare('SELECT v.*, c.name AS category_name, c.access_mode AS cat_access_mode FROM videos v LEFT JOIN categories c ON v.category_id = c.id WHERE v.id = ?').get(id);
    if (!video) return res.status(404).json({ error: 'Video not found' });
    if (video.access_mode === 'custom') {
      const rows = db.prepare('SELECT user_id FROM video_access WHERE video_id = ?').all(video.id);
      return res.json({ type: 'video', title: video.title, access_mode: 'custom', users: computeUsers(null, null, new Set(rows.map(r => r.user_id))) });
    }
    const catId = video.category_id;
    const catMode = catId ? (video.cat_access_mode || 'public:none') : 'public:none';
    const { vm, em } = parseCatModes(catMode);
    return res.json({
      type: 'video', title: video.title, access_mode: video.access_mode,
      category_id: catId, category_name: video.category_name,
      viewer_mode: vm, editor_mode: em,
      users: catId ? computeUsers(catId, catMode) : computeUsers(null, 'public:none'),
    });
  }

  res.status(400).json({ error: 'Invalid type' });
});

const EXPORT_SKIP_TABLES = new Set(['sessions']);

app.get('/api/debug/export', requireDev, (req, res) => {
  try {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all().map(t => t.name).filter(n => !EXPORT_SKIP_TABLES.has(n));

    // Stream the JSON row-by-row instead of buffering the whole DB in memory.
    // Avoids large memory spikes and keeps the connection active so a reverse
    // proxy doesn't time out (the cause of intermittent 502s on big exports).
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition',
      `attachment; filename="alleria-filmy-export-${new Date().toISOString().slice(0, 10)}.json"`);

    res.write('{');
    tables.forEach((name, ti) => {
      if (ti > 0) res.write(',');
      res.write(JSON.stringify(name) + ':[');
      let ri = 0;
      for (const row of db.prepare(`SELECT * FROM "${name}"`).iterate()) {
        res.write((ri++ > 0 ? ',' : '') + JSON.stringify(row));
      }
      res.write(']');
    });
    res.write('}');
    res.end();
  } catch (err) {
    console.error('[EXPORT] failed:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Export failed: ' + err.message });
    else res.end();
  }
});

// Database file size + row stats
app.get('/api/debug/db-stats', requireDev, (req, res) => {
  try {
    const parts = {};
    let sizeBytes = 0, mainBytes = 0;
    for (const f of [DB_PATH, `${DB_PATH}-wal`, `${DB_PATH}-shm`]) {
      try { const s = fs.statSync(f); parts[path.basename(f)] = s.size; sizeBytes += s.size; if (f === DB_PATH) mainBytes = s.size; } catch (_) {}
    }
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
    let rowCount = 0;
    for (const t of tables) {
      try { rowCount += db.prepare(`SELECT COUNT(*) AS c FROM "${t.name}"`).get().c; } catch (_) {}
    }
    res.json({ sizeBytes, mainBytes, parts, tableCount: tables.length, rowCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/debug/import', requireDev, express.json({ limit: '50mb' }), (req, res) => {
  try {
    const data = req.body;
    // Disable FK checks outside the transaction (SQLite does not allow PRAGMA inside a transaction)
    db.prepare('PRAGMA foreign_keys = OFF').run();
    try {
      const transaction = db.transaction(() => {
        const tables = db.prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        ).all().map(r => r.name).filter(n => !EXPORT_SKIP_TABLES.has(n));

        // Clear all tables
        for (const name of tables) {
          db.prepare(`DELETE FROM "${name}"`).run();
        }

        // Re-insert rows using column names taken from the data itself
        for (const [tableName, rows] of Object.entries(data)) {
          if (!Array.isArray(rows) || rows.length === 0) continue;
          const cols = Object.keys(rows[0]);
          const colList = cols.map(c => `"${c}"`).join(', ');
          const placeholders = cols.map(() => '?').join(', ');
          const stmt = db.prepare(`INSERT OR IGNORE INTO "${tableName}" (${colList}) VALUES (${placeholders})`);
          for (const row of rows) {
            stmt.run(cols.map(c => row[c]));
          }
        }
      });
      transaction();
    } finally {
      db.prepare('PRAGMA foreign_keys = ON').run();
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ error: 'Import failed: ' + err.message });
  }
});

app.post('/api/debug/clear', requireDev, (req, res) => {
  try {
    db.prepare('DELETE FROM video_tags').run();
    db.prepare('DELETE FROM watch_logs').run();
    db.prepare('DELETE FROM login_logs').run();
    db.prepare('DELETE FROM videos').run();
    db.prepare('DELETE FROM tags').run();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Clear failed' });
  }
});

// SQL executor — DEV ONLY
app.post('/api/debug/sql', requireDev, (req, res) => {
  const { query } = req.body;
  if (!query || !query.trim()) return res.status(400).json({ error: 'Empty query' });

  const trimmed = query.trim();
  console.log(`[DEBUG SQL] Executed by ${req.session.user.display_name}: ${trimmed.slice(0, 200)}`);

  try {
    const isSelect = /^\s*(SELECT|PRAGMA|EXPLAIN)/i.test(trimmed);
    if (isSelect) {
      const rows = db.prepare(trimmed).all();
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
      res.json({ success: true, type: 'query', rows, columns, count: rows.length });
    } else {
      const info = db.prepare(trimmed).run();
      res.json({ success: true, type: 'statement', changes: info.changes, lastInsertRowid: Number(info.lastInsertRowid) });
    }
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ============ APP SETTINGS API (dev only) ============
const TS3_DELIVERY_VALUES = ['pm', 'poke', 'both'];
const GDPR_REGION_VALUES = ['off', 'eu', 'brazil'];

function settingsPayload() {
  return {
    webhook_domain_restriction: getSetting('webhook_domain_restriction', '1') === '1',
    webhook_allowed_hosts: WEBHOOK_ALLOWED_HOSTS,
    limit_display_name: getLimit('limit_display_name'),
    limit_bio: getLimit('limit_bio'),
    limit_comment: getLimit('limit_comment'),
    ts3_code_delivery: getSetting('ts3_code_delivery', 'pm'),
    videos_per_page: parseInt(getSetting('videos_per_page', '12'), 10) || 12,
    grid_columns: parseInt(getSetting('grid_columns', '3'), 10) || 3,
    grid_card_min_width: parseInt(getSetting('grid_card_min_width', '300'), 10) || 300,
    logs_per_page: parseInt(getSetting('logs_per_page', '50'), 10) || 50,
    iframe_embed_enabled: getSetting('iframe_embed_enabled', '0') === '1',
    iframe_allowed_origins: getSetting('iframe_allowed_origins', '').split(',').map(o => o.trim()).filter(Boolean),
    show_top_bar: getSetting('show_top_bar', '1') === '1',
    youtube_custom_player: getSetting('youtube_custom_player', '0') === '1',
    gdpr_region: getSetting('gdpr_region', 'off'),

    // SMTP — dev-only payload, so the raw password is returned here same as ts3/ts6 passwords below.
    smtp_host: getSetting('smtp_host', ''),
    smtp_port: getSetting('smtp_port', '587'),
    smtp_secure: getSetting('smtp_secure', '0') === '1',
    smtp_user: getSetting('smtp_user', ''),
    smtp_password: getSetting('smtp_password', ''),
    smtp_from: getSetting('smtp_from', ''),

    // Sitewide default email templates (content only — see wrapEmailHtml for the fixed design).
    email_template_new_video: getSetting('email_template_new_video', EMAIL_TEMPLATE_DEFAULTS.new_video),
    email_template_gdpr_notify: getSetting('email_template_gdpr_notify', EMAIL_TEMPLATE_DEFAULTS.gdpr_notify),
    email_template_gdpr_result_export: getSetting('email_template_gdpr_result_export', EMAIL_TEMPLATE_DEFAULTS.gdpr_result_export),
    email_template_gdpr_result_deletion: getSetting('email_template_gdpr_result_deletion', EMAIL_TEMPLATE_DEFAULTS.gdpr_result_deletion),

    // Login config — source flags are .env-only (boot-time, no panel override; see tsConfigSource/
    // discordRolesConfigSource). The fields below always report the *effective* value, whichever
    // source is currently active, so the panel can show something sensible either way.
    ts_config_source: tsConfigSource(),
    ts6_host: getTsSetting('ts6_host', process.env.TS6_HOST || process.env.TS_SERVER_HOST || ''),
    ts6_port: getTsSetting('ts6_port', process.env.TS6_QUERY_PORT || process.env.TS_API_PORT || '10080'),
    ts6_username: getTsSetting('ts6_username', process.env.TS6_USERNAME || process.env.TS_USERNAME || 'serveradmin'),
    ts6_password: getTsSetting('ts6_password', process.env.TS6_PASSWORD || process.env.TS_PASSWORD || ''),
    ts6_api_key: getTsSetting('ts6_api_key', process.env.TS6_API_KEY || process.env.TS_API_KEY || ''),
    ts6_server_id: getTsSetting('ts6_server_id', process.env.TS6_SERVER_ID || process.env.TS_SERVER_ID || '1'),
    ts6_member_group_id: getTsSetting('ts6_member_group_id', process.env.TS6_MEMBER_GROUP_ID || process.env.TS_MEMBER_GROUP_ID || ''),
    ts6_admin_group_id: getTsSetting('ts6_admin_group_id', process.env.TS6_ADMIN_GROUP_ID || process.env.TS_ADMIN_GROUP_ID || ''),
    ts3_host: getTsSetting('ts3_host', process.env.TS3_HOST || ''),
    ts3_port: getTsSetting('ts3_port', process.env.TS3_PORT || '10011'),
    ts3_username: getTsSetting('ts3_username', process.env.TS3_USERNAME || 'serveradmin'),
    ts3_password: getTsSetting('ts3_password', process.env.TS3_PASSWORD || ''),
    ts3_server_id: getTsSetting('ts3_server_id', process.env.TS3_SERVER_ID || '1'),
    ts3_member_group_id: getTsSetting('ts3_member_group_id', process.env.TS3_MEMBER_GROUP_ID || ''),
    ts3_admin_group_id: getTsSetting('ts3_admin_group_id', process.env.TS3_ADMIN_GROUP_ID || ''),
    ts_bot_nickname: getTsBotNickname(),

    discord_roles_config_source: discordRolesConfigSource(),
    discord_member_role_id: getDiscordRoleSetting('discord_member_role_id', process.env.DISCORD_MEMBER_ROLE_ID || ''),
    discord_admin_role_id: getDiscordRoleSetting('discord_admin_role_id', process.env.DISCORD_ADMIN_ROLE_ID || ''),
  };
}

app.get('/api/debug/settings', requireDev, (req, res) => {
  res.json(settingsPayload());
});

app.post('/api/debug/settings', requireDev, (req, res) => {
  const { webhook_domain_restriction } = req.body;
  if (webhook_domain_restriction !== undefined) {
    setSetting('webhook_domain_restriction', webhook_domain_restriction ? '1' : '0');
    audit(req.session.user.id, 'edit', 'settings', null,
      `webhook_domain_restriction → ${webhook_domain_restriction ? 'ON' : 'OFF'}`);
  }
  // Content length limits
  for (const key of Object.keys(LIMIT_DEFAULTS)) {
    if (req.body[key] !== undefined) {
      const n = parseInt(req.body[key], 10);
      if (!Number.isInteger(n) || n < 1 || n > 100000) {
        return res.status(400).json({ error: `Nieprawidłowa wartość dla ${key} (dozwolone 1–100000).` });
      }
      setSetting(key, n);
      audit(req.session.user.id, 'edit', 'settings', null, `${key} → ${n}`);
    }
  }
  // TS3 login code delivery method
  if (req.body.ts3_code_delivery !== undefined) {
    const v = String(req.body.ts3_code_delivery);
    if (!TS3_DELIVERY_VALUES.includes(v)) {
      return res.status(400).json({ error: 'Nieprawidłowa wartość ts3_code_delivery (pm | poke | both).' });
    }
    setSetting('ts3_code_delivery', v);
    audit(req.session.user.id, 'edit', 'settings', null, `ts3_code_delivery → ${v}`);
  }
  // GDPR/RODO region — gates the data-export/deletion request UI and endpoints
  if (req.body.gdpr_region !== undefined) {
    const v = String(req.body.gdpr_region);
    if (!GDPR_REGION_VALUES.includes(v)) {
      return res.status(400).json({ error: 'Nieprawidłowa wartość gdpr_region (off | eu | brazil).' });
    }
    setSetting('gdpr_region', v);
    audit(req.session.user.id, 'edit', 'settings', null, `gdpr_region → ${v}`);
  }
  // SMTP config
  const SMTP_TEXT_FIELDS = ['smtp_host', 'smtp_user', 'smtp_password', 'smtp_from'];
  for (const key of SMTP_TEXT_FIELDS) {
    if (req.body[key] !== undefined) {
      const v = String(req.body[key]);
      setSetting(key, v);
      const isSecret = key === 'smtp_password';
      audit(req.session.user.id, 'edit', 'settings', null, `${key} → ${isSecret ? '(zmieniono)' : v}`);
    }
  }
  if (req.body.smtp_port !== undefined) {
    const v = String(req.body.smtp_port).trim();
    if (v !== '' && !/^\d+$/.test(v)) {
      return res.status(400).json({ error: 'Nieprawidłowa wartość smtp_port — oczekiwano samych cyfr.' });
    }
    setSetting('smtp_port', v || '587');
    audit(req.session.user.id, 'edit', 'settings', null, `smtp_port → ${v}`);
  }
  if (req.body.smtp_secure !== undefined) {
    setSetting('smtp_secure', req.body.smtp_secure ? '1' : '0');
    audit(req.session.user.id, 'edit', 'settings', null, `smtp_secure → ${req.body.smtp_secure ? 'ON' : 'OFF'}`);
  }
  // Sitewide default email templates — content only, see wrapEmailHtml for the fixed design.
  for (const key of ['email_template_new_video', 'email_template_gdpr_notify', 'email_template_gdpr_result_export', 'email_template_gdpr_result_deletion']) {
    if (req.body[key] !== undefined) {
      setSetting(key, String(req.body[key]));
      audit(req.session.user.id, 'edit', 'settings', null, `${key} → (zmieniono)`);
    }
  }
  // Display settings — videos per page / grid columns / logs per page (formerly .env-only)
  for (const key of ['videos_per_page', 'grid_columns', 'logs_per_page']) {
    if (req.body[key] !== undefined) {
      const n = parseInt(req.body[key], 10);
      if (!Number.isInteger(n) || n < 1 || n > 500) {
        return res.status(400).json({ error: `Nieprawidłowa wartość dla ${key} (dozwolone 1–500).` });
      }
      setSetting(key, n);
      audit(req.session.user.id, 'edit', 'settings', null, `${key} → ${n}`);
    }
  }
  // Minimum video card width in px — the grid never squeezes cards narrower than this; it adds
  // columns (up to the max above) as space allows instead. Bounded to sane, always-usable values.
  if (req.body.grid_card_min_width !== undefined) {
    const n = parseInt(req.body.grid_card_min_width, 10);
    if (!Number.isInteger(n) || n < 150 || n > 800) {
      return res.status(400).json({ error: 'Nieprawidłowa wartość dla grid_card_min_width (dozwolone 150–800).' });
    }
    setSetting('grid_card_min_width', n);
    audit(req.session.user.id, 'edit', 'settings', null, `grid_card_min_width → ${n}`);
  }
  // iframe embedding toggle (formerly .env-only)
  if (req.body.iframe_embed_enabled !== undefined) {
    setSetting('iframe_embed_enabled', req.body.iframe_embed_enabled ? '1' : '0');
    audit(req.session.user.id, 'edit', 'settings', null,
      `iframe_embed_enabled → ${req.body.iframe_embed_enabled ? 'ON' : 'OFF'}`);
  }
  // iframe allowed origins list (formerly IFRAME_ALLOWED_ORIGINS in .env)
  if (req.body.iframe_allowed_origins !== undefined) {
    const list = Array.isArray(req.body.iframe_allowed_origins) ? req.body.iframe_allowed_origins : [];
    const cleaned = list.map(o => String(o).trim()).filter(Boolean);
    const invalid = cleaned.filter(o => !IFRAME_ORIGIN_RE.test(o));
    if (invalid.length > 0) {
      return res.status(400).json({ error: `Nieprawidłowy format domeny: ${invalid.join(', ')} (oczekiwano np. https://alleria.pl, bez przecinków/spacji).` });
    }
    setSetting('iframe_allowed_origins', cleaned.join(','));
    audit(req.session.user.id, 'edit', 'settings', null, `iframe_allowed_origins → ${cleaned.join(', ') || '(puste)'}`);
  }
  // Top bar (page title + search + profile) visibility
  if (req.body.show_top_bar !== undefined) {
    setSetting('show_top_bar', req.body.show_top_bar ? '1' : '0');
    audit(req.session.user.id, 'edit', 'settings', null,
      `show_top_bar → ${req.body.show_top_bar ? 'ON' : 'OFF'}`);
  }
  // Custom-chrome YouTube player overlay vs. plain YouTube embed
  if (req.body.youtube_custom_player !== undefined) {
    setSetting('youtube_custom_player', req.body.youtube_custom_player ? '1' : '0');
    audit(req.session.user.id, 'edit', 'settings', null,
      `youtube_custom_player → ${req.body.youtube_custom_player ? 'ON' : 'OFF'}`);
  }
  // TeamSpeak 3/6 connection config — always writable here regardless of TS_CONFIG_SOURCE, so
  // values can be pre-staged in the panel before flipping the .env flag over to 'panel'.
  // Empty string clears the row (falls back to the .env-derived value again).
  const TS_TEXT_FIELDS = ['ts6_host', 'ts6_username', 'ts6_password', 'ts6_api_key', 'ts3_host', 'ts3_username', 'ts3_password', 'ts_bot_nickname'];
  const TS_NUMERIC_FIELDS = ['ts6_port', 'ts6_server_id', 'ts6_member_group_id', 'ts6_admin_group_id', 'ts3_port', 'ts3_server_id', 'ts3_member_group_id', 'ts3_admin_group_id'];
  for (const key of TS_TEXT_FIELDS) {
    if (req.body[key] !== undefined) {
      const v = String(req.body[key]).trim();
      if (v === '') clearSetting(key); else setSetting(key, v);
      const isSecret = key.includes('password') || key.includes('api_key');
      audit(req.session.user.id, 'edit', 'settings', null, `${key} → ${isSecret ? '(zmieniono)' : (v || '(reset do .env)')}`);
    }
  }
  for (const key of TS_NUMERIC_FIELDS) {
    if (req.body[key] !== undefined) {
      const v = String(req.body[key]).trim();
      if (v !== '' && !/^\d+$/.test(v)) {
        return res.status(400).json({ error: `Nieprawidłowa wartość dla ${key} — oczekiwano samych cyfr.` });
      }
      if (v === '') clearSetting(key); else setSetting(key, v);
      audit(req.session.user.id, 'edit', 'settings', null, `${key} → ${v || '(reset do .env)'}`);
    }
  }
  // Discord member/editor role IDs — always writable here regardless of DISCORD_ROLES_CONFIG_SOURCE.
  for (const key of ['discord_member_role_id', 'discord_admin_role_id']) {
    if (req.body[key] !== undefined) {
      const v = String(req.body[key]).trim();
      if (v !== '' && !/^\d{5,25}$/.test(v)) {
        return res.status(400).json({ error: `Nieprawidłowe ID roli Discord dla ${key} — oczekiwano samych cyfr.` });
      }
      if (v === '') clearSetting(key); else setSetting(key, v);
      audit(req.session.user.id, 'edit', 'settings', null, `${key} → ${v || '(reset do .env)'}`);
    }
  }
  res.json({ success: true, ...settingsPayload() });
});

app.post('/api/debug/settings/test-email', requireDev, async (req, res) => {
  const dev = db.prepare('SELECT email, discord_email FROM users WHERE id = ?').get(req.session.user.id);
  const to = String(req.body.to || '').trim() || dev?.email || dev?.discord_email;
  if (!to) return res.status(400).json({ error: 'Podaj adres e-mail — Twoje konto nie ma żadnego zapisanego.' });
  const html = wrapEmailHtml({ bodyHtml: '<p style="margin:0; line-height:1.6; color:#3f3f46;">To jest testowa wiadomość z panelu Dev Tools. Konfiguracja SMTP działa poprawnie.</p>' });
  const ok = await sendEmail({ to, subject: 'Alleria Filmy — testowy e-mail', html });
  if (!ok) return res.status(500).json({ error: 'Wysyłka nie powiodła się — sprawdź konfigurację SMTP i logi serwera.' });
  res.json({ success: true, to });
});

// Renders a template (saved, or an in-progress ?template= draft) with sample data through the
// exact same code path a real send uses, so what you preview is guaranteed to match what's sent.
app.get('/api/debug/settings/email-preview/:type', requireDev, (req, res) => {
  const { type } = req.params;
  const baseUrl = process.env.ALLOWED_ORIGIN || process.env.DISCORD_REDIRECT_URI?.replace(/\/auth.*/, '') || 'https://videos.alleria.pl';
  if (type === 'new_video') {
    const template = req.query.template !== undefined ? String(req.query.template) : getSetting('email_template_new_video', EMAIL_TEMPLATE_DEFAULTS.new_video);
    const replacements = {
      '{title}': 'Przykładowy film', '{author}': 'Jan Kowalski', '{category}': 'Filmy akcji',
      '{description}': 'Przykładowy opis filmu użyty w podglądzie szablonu.', '{date}': new Date().toISOString().slice(0, 10),
      '{id}': '123', '{url}': `${baseUrl}/video/123`, '{thumbnail}': '',
    };
    const bodyHtml = renderTemplateParagraphs(template, replacements);
    return res.type('html').send(wrapEmailHtml({ bodyHtml, ctaUrl: replacements['{url}'], ctaLabel: 'Obejrzyj film' }));
  }
  if (type === 'gdpr_notify') {
    const template = req.query.template !== undefined ? String(req.query.template) : getSetting('email_template_gdpr_notify', EMAIL_TEMPLATE_DEFAULTS.gdpr_notify);
    const replacements = { '{user}': 'Jan Kowalski (@jkowalski)', '{type}': 'eksportu danych', '{url}': `${baseUrl}/manage?tab=gdpr` };
    const bodyHtml = renderTemplateParagraphs(template, replacements);
    return res.type('html').send(wrapEmailHtml({ bodyHtml, ctaUrl: replacements['{url}'], ctaLabel: 'Przejdź do zgłoszeń RODO' }));
  }
  if (type === 'gdpr_result_export') {
    const template = req.query.template !== undefined ? String(req.query.template) : getSetting('email_template_gdpr_result_export', EMAIL_TEMPLATE_DEFAULTS.gdpr_result_export);
    const bodyHtml = renderTemplateParagraphs(template, {});
    return res.type('html').send(wrapEmailHtml({ bodyHtml, ctaUrl: `${baseUrl}/profile`, ctaLabel: 'Przejdź do profilu' }));
  }
  if (type === 'gdpr_result_deletion') {
    const template = req.query.template !== undefined ? String(req.query.template) : getSetting('email_template_gdpr_result_deletion', EMAIL_TEMPLATE_DEFAULTS.gdpr_result_deletion);
    const bodyHtml = renderTemplateParagraphs(template, {});
    return res.type('html').send(wrapEmailHtml({ bodyHtml }));
  }
  res.status(404).send('Nieznany typ szablonu.');
});

// ============ GDPR / RODO (admin review) ============
const gdprUpload = multer({ dest: gdprDir, limits: { fileSize: 20 * 1024 * 1024 } });

app.get('/api/debug/gdpr/pending-count', requireDev, (req, res) => {
  const { count } = db.prepare(`SELECT COUNT(*) AS count FROM gdpr_requests WHERE status = 'pending'`).get();
  res.json({ count });
});

app.get('/api/debug/gdpr/requests', requireDev, (req, res) => {
  const rows = db.prepare(`
    SELECT r.*, u.username, u.display_name, u.anonymized_original_username, u.anonymized_original_display_name
    FROM gdpr_requests r JOIN users u ON r.user_id = u.id
    ORDER BY r.requested_at DESC
  `).all();
  res.json(rows);
});

app.get('/api/debug/gdpr/requests/:id/file', requireDev, (req, res) => {
  const reqRow = db.prepare('SELECT * FROM gdpr_requests WHERE id = ?').get(req.params.id);
  if (!reqRow || reqRow.type !== 'export' || !reqRow.export_file) return res.status(404).json({ error: 'Brak pliku.' });
  res.download(path.join(gdprDir, reqRow.export_file), reqRow.export_file);
});

app.post('/api/debug/gdpr/requests/:id/replace', requireDev, gdprUpload.single('file'), (req, res) => {
  const reqRow = db.prepare('SELECT * FROM gdpr_requests WHERE id = ?').get(req.params.id);
  if (!reqRow || reqRow.type !== 'export') {
    if (req.file) { try { fs.unlinkSync(req.file.path); } catch (e) {} }
    return res.status(404).json({ error: 'Nie znaleziono zgłoszenia eksportu.' });
  }
  if (!req.file) return res.status(400).json({ error: 'Brak pliku.' });
  try {
    JSON.parse(fs.readFileSync(req.file.path, 'utf8'));
  } catch (e) {
    try { fs.unlinkSync(req.file.path); } catch (_) {}
    return res.status(400).json({ error: 'Przesłany plik nie jest poprawnym JSON-em.' });
  }
  const filename = reqRow.export_file || `export_${reqRow.id}.json`;
  fs.renameSync(req.file.path, path.join(gdprDir, filename));
  db.prepare('UPDATE gdpr_requests SET export_file = ? WHERE id = ?').run(filename, reqRow.id);
  audit(req.session.user.id, 'gdpr_replace_file', 'user', reqRow.user_id, `request #${reqRow.id}`);
  res.json({ success: true });
});

app.post('/api/debug/gdpr/requests/:id/approve', requireDev, (req, res) => {
  const reqRow = db.prepare('SELECT * FROM gdpr_requests WHERE id = ?').get(req.params.id);
  if (!reqRow) return res.status(404).json({ error: 'Nie znaleziono zgłoszenia.' });
  if (reqRow.status !== 'pending') return res.status(400).json({ error: 'Zgłoszenie zostało już rozpatrzone.' });
  try {
    // Fetched before anonymizeUser() below, which wipes email/discord_email for deletions.
    const user = db.prepare('SELECT email, discord_email FROM users WHERE id = ?').get(reqRow.user_id);
    if (reqRow.type === 'deletion') anonymizeUser(reqRow.user_id);
    db.prepare("UPDATE gdpr_requests SET status = 'approved', processed_by = ?, processed_at = datetime('now') WHERE id = ?")
      .run(req.session.user.id, reqRow.id);
    audit(req.session.user.id, 'gdpr_approve', 'user', reqRow.user_id, reqRow.type);
    if (user) notifyUserOfGdprResult(reqRow.type, user).catch(e => console.error('[EMAIL] GDPR result notify failed:', e.message));
    // Deletion anonymizes + logs the user out above — an in-app bell notification would never
    // be seen, so only export (where the account and session stay intact) gets one.
    if (reqRow.type === 'export') {
      notifyUser(reqRow.user_id, { type: 'gdpr_export_ready', title: 'Eksport danych gotowy', body: 'Twoja prośba o eksport danych została zatwierdzona.', url: '/profile' });
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/debug/gdpr/requests/:id/reject', requireDev, (req, res) => {
  const reqRow = db.prepare('SELECT * FROM gdpr_requests WHERE id = ?').get(req.params.id);
  if (!reqRow) return res.status(404).json({ error: 'Nie znaleziono zgłoszenia.' });
  if (reqRow.status !== 'pending') return res.status(400).json({ error: 'Zgłoszenie zostało już rozpatrzone.' });
  const reason = String(req.body.reason || '').slice(0, 1000);
  db.prepare("UPDATE gdpr_requests SET status = 'rejected', admin_note = ?, processed_by = ?, processed_at = datetime('now') WHERE id = ?")
    .run(reason, req.session.user.id, reqRow.id);
  audit(req.session.user.id, 'gdpr_reject', 'user', reqRow.user_id, `${reqRow.type}: ${reason}`);
  res.json({ success: true });
});

// .env sanity check — variable names only, values are never inspected/returned
const KNOWN_ENV_VARS = [
  'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_REDIRECT_URI', 'DISCORD_BOT_TOKEN', 'DISCORD_GUILD_ID',
  'DISCORD_MEMBER_ROLE_ID', 'DISCORD_ADMIN_ROLE_ID', 'DISCORD_DEV_ROLE_ID', 'DISCORD_ROLES_CONFIG_SOURCE',
  'TS_SERVER_HOST', 'TS6_HOST', 'TS_API_PORT', 'TS6_QUERY_PORT', 'TS_USERNAME', 'TS6_USERNAME', 'TS_PASSWORD', 'TS6_PASSWORD',
  'TS_API_KEY', 'TS6_API_KEY', 'TS_SERVER_ID', 'TS6_SERVER_ID', 'TS_MEMBER_GROUP_ID', 'TS6_MEMBER_GROUP_ID',
  'TS_ADMIN_GROUP_ID', 'TS6_ADMIN_GROUP_ID', 'TS_BOT_NICKNAME', 'TS_CONFIG_SOURCE',
  'TS3_HOST', 'TS3_PORT', 'TS3_USERNAME', 'TS3_PASSWORD', 'TS3_SERVER_ID', 'TS3_MEMBER_GROUP_ID', 'TS3_ADMIN_GROUP_ID',
  'SESSION_SECRET', 'PORT', 'NODE_ENV',
  'STREAM_SECRET', 'STREAM_URL', 'ALLOWED_ORIGIN',
];
const DEPRECATED_ENV_VARS = ['VIDEOS_PER_PAGE', 'GRID_COLUMNS', 'LOGS_PER_PAGE', 'IFRAME_EMBED_ENABLED', 'IFRAME_ALLOWED_ORIGINS'];
const APP_ENV_PREFIXES = /^(DISCORD_|TS3_|TS6_|TS_|SESSION_|STREAM_|IFRAME_|ALLOWED_ORIGIN|NODE_ENV|PORT)/;

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

app.get('/api/debug/env-check', requireDev, (req, res) => {
  const present = Object.keys(process.env);
  const known = new Set([...KNOWN_ENV_VARS, ...DEPRECATED_ENV_VARS]);

  const deprecated = DEPRECATED_ENV_VARS.filter(name => process.env[name] !== undefined);

  const suspicious = [];
  for (const name of present) {
    if (known.has(name) || !APP_ENV_PREFIXES.test(name)) continue;
    let best = null;
    for (const candidate of KNOWN_ENV_VARS) {
      const dist = levenshtein(name, candidate);
      if (dist > 0 && dist <= 2 && (!best || dist < best.dist)) best = { name: candidate, dist };
    }
    if (best) suspicious.push({ found: name, suggestion: best.name });
  }

  res.json({ deprecated, suspicious });
});

// Categories that have custom Discord role IDs or a custom Discord user list attached — an audit
// view so a dev can see what's affected before changing the global member/redaktor role IDs.
app.get('/api/debug/category-role-overview', requireDev, async (req, res) => {
  try {
    const cats = db.prepare('SELECT id, name FROM categories ORDER BY sort_order, name').all();
    const roleRows = db.prepare('SELECT category_id, discord_role_id, access_type FROM category_access').all();
    const userRows = db.prepare(`
      SELECT cua.category_id, cua.access_type, u.id, u.display_name, u.username
      FROM category_user_access cua
      JOIN users u ON u.id = cua.user_id
    `).all();

    // Discord role IDs are just raw snowflakes in our DB (no name cached anywhere) — resolve
    // names live from the guild, best-effort. Falls back to the bare ID if Discord is unreachable.
    let roleNames = {};
    if (roleRows.length > 0 && process.env.DISCORD_GUILD_ID && process.env.DISCORD_BOT_TOKEN) {
      try {
        const rolesRes = await fetch(`https://discord.com/api/guilds/${process.env.DISCORD_GUILD_ID}/roles`, {
          headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
        });
        if (rolesRes.ok) {
          const roles = await rolesRes.json();
          roleNames = Object.fromEntries(roles.map(r => [r.id, r.name]));
        }
      } catch (e) { /* Discord unreachable — fall back to raw IDs below */ }
    }

    const result = cats.map(c => ({
      id: c.id,
      name: c.name,
      discord_roles: roleRows.filter(r => r.category_id === c.id).map(r => ({
        role_id: r.discord_role_id,
        role_name: roleNames[r.discord_role_id] || null,
        access_type: r.access_type,
      })),
      custom_users: userRows.filter(u => u.category_id === c.id).map(u => ({
        id: u.id,
        display_name: u.display_name || u.username,
        access_type: u.access_type,
      })),
    })).filter(c => c.discord_roles.length > 0 || c.custom_users.length > 0);

    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ WATCH PARTY MANAGEMENT (admin) ============
app.get('/api/admin/watch-parties', requireDev, (req, res) => {
  res.json(listParties());
});

app.delete('/api/admin/watch-parties/:code', requireDev, (req, res) => {
  const code = req.params.code.toUpperCase();
  const u = req.session.user;
  if (!getParty(code)) return res.status(404).json({ error: 'Party not found' });
  deleteParty(code, u.id, u.display_name || u.username);
  res.json({ ok: true });
});

// ============ LOG CLEARING API ============
app.delete('/api/logs/watch/clear', requireAdmin, (req, res) => {
  try {
    const info = db.prepare('DELETE FROM watch_logs').run();
    res.json({ success: true, deleted: info.changes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/logs/login/clear', requireAdmin, (req, res) => {
  try {
    const info = db.prepare('DELETE FROM login_logs').run();
    res.json({ success: true, deleted: info.changes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Watch Party logs
app.get('/api/logs/watch-party', requireAdmin, (req, res) => {
  try {
    const perPage = parseInt(getSetting('logs_per_page', '50'), 10) || 50;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const code = (req.query.code || '').toUpperCase();
    const action = req.query.action || '';
    const userId = parseInt(req.query.user_id) || null;

    let where = '1=1';
    const params = [];
    if (code) { where += ' AND party_code = ?'; params.push(code); }
    if (action) { where += ' AND action = ?'; params.push(action); }
    if (userId) { where += ' AND (user_id = ? OR target_user_id = ?)'; params.push(userId, userId); }

    const total = db.prepare(`SELECT COUNT(*) AS c FROM watch_party_logs WHERE ${where}`).get(...params).c;
    const offset = (page - 1) * perPage;
    const logs = db.prepare(`SELECT * FROM watch_party_logs WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, perPage, offset);
    res.json({ logs, total, page, totalPages: Math.ceil(total / perPage) || 1 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/logs/watch-party/clear', requireAdmin, (req, res) => {
  try {
    const code = (req.query.code || '').toUpperCase();
    const info = code
      ? db.prepare('DELETE FROM watch_party_logs WHERE party_code = ?').run(code)
      : db.prepare('DELETE FROM watch_party_logs').run();
    res.json({ success: true, deleted: info.changes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ STREAMING PROXY ============
const STREAM_URL = process.env.STREAM_URL || 'http://streaming:4000';

// Chunked upload temp dir
const chunksDir = path.join(__dirname, 'data', 'chunks');
if (!fs.existsSync(chunksDir)) fs.mkdirSync(chunksDir, { recursive: true });

const chunkUpload = multer({
  dest: chunksDir,
  limits: { fileSize: 80 * 1024 * 1024 }, // 80MB per chunk — safe under CF 100MB limit
});

// Step 1: Initialize chunked upload — returns upload_id
app.post('/api/stream/upload/init', requireAdmin, (req, res) => {
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
app.post('/api/stream/upload/chunk', requireAdmin, chunkUpload.single('chunk'), (req, res) => {
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
app.post('/api/stream/upload/complete', requireAdmin, async (req, res) => {
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
app.get('/api/stream/status/:videoId', requireAdmin, async (req, res) => {
  try {
    const r = await fetch(`${STREAM_URL}/status/${req.params.videoId}`, {
      headers: { 'X-Stream-Token': STREAM_SECRET }
    });
    res.json(await r.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Generate playback token for user
app.get('/api/stream/token/:videoId', requireAuth, async (req, res) => {
  try {
    const r = await fetch(`${STREAM_URL}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Stream-Token': STREAM_SECRET },
      body: JSON.stringify({ video_id: req.params.videoId, user_id: String(req.session.user.id) })
    });
    res.json(await r.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Mint a short-lived cast token for Chromecast/AirPlay — lets the receiver device
// fetch /stream/media and /stream/keys directly without the viewer's session cookie.
app.get('/api/stream/cast-token/:videoId', requireAuth, (req, res) => {
  const uid = String(req.session.user.id);
  const expires = Date.now() + CAST_TOKEN_TTL_MS;
  const castToken = signCastToken(req.params.videoId, uid, expires);
  res.json({ castToken, uid, expires });
});

// Proxy stream media & keys (so streaming container is never exposed publicly)
app.get('/stream/keys/*', requireAuthOrCastToken, async (req, res) => {
  try {
    const url = `${STREAM_URL}/keys/${req.params[0]}?t=${req.query.t || ''}&uid=${req.query.uid || ''}`;
    const r = await fetch(url);
    if (!r.ok) return res.status(r.status).send('Key error');
    const buf = await r.arrayBuffer();
    res.set({ 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.send(Buffer.from(buf));
  } catch (err) { res.status(500).send('Key proxy error'); }
});

app.get('/stream/media/*', requireAuthOrCastToken, async (req, res) => {
  try {
    const url = `${STREAM_URL}/media/${req.params[0]}`;
    const r = await fetch(url);
    if (!r.ok) return res.status(r.status).send('Media error');

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
  } catch (err) { res.status(500).send('Media proxy error'); }
});

// Delete streaming video
app.delete('/api/stream/video/:videoId', requireAdmin, async (req, res) => {
  try {
    const r = await fetch(`${STREAM_URL}/video/${req.params.videoId}`, {
      method: 'DELETE',
      headers: { 'X-Stream-Token': STREAM_SECRET }
    });
    res.json(await r.json());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Check transcode status for a DB video and update stream_status
app.get('/api/stream/check/:dbVideoId', requireAdmin, async (req, res) => {
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

app.get('/api/stream/files', requireDev, async (req, res) => {
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
app.get('/api/stream/cleanup', requireDev, async (req, res) => {
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

app.post('/api/stream/cleanup', requireDev, async (req, res) => {
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
app.get('/api/stream/transcoding', requireAdmin, async (req, res) => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const r = await fetch(`${STREAM_URL}/transcoding`, { headers: { 'X-Stream-Token': STREAM_SECRET }, signal: controller.signal });
    clearTimeout(timeout);
    const jobs = await r.json();
    if (!jobs.length) return res.json([]);
    const placeholders = jobs.map(() => '?').join(',');
    const ids = jobs.map(j => j.video_id);
    // Search in both main stream_video_id and mirror URL fields
    const dbRows = db.prepare(`
      SELECT id, title, stream_video_id,
        mirror1_url, mirror2_url, mirror3_url, mirror4_url, mirror5_url
      FROM videos
      WHERE stream_video_id IN (${placeholders})
        OR mirror1_url IN (${placeholders}) OR mirror2_url IN (${placeholders})
        OR mirror3_url IN (${placeholders}) OR mirror4_url IN (${placeholders})
        OR mirror5_url IN (${placeholders})
    `).all(...ids, ...ids, ...ids, ...ids, ...ids, ...ids);
    const dbMap = new Map();
    for (const v of dbRows) {
      const check = (url) => { if (url) { const m = url.match(/^self-hosted:(.+)$/); if (m) dbMap.set(m[1], { id: v.id, title: v.title }); } };
      if (v.stream_video_id) dbMap.set(v.stream_video_id, { id: v.id, title: v.title });
      [v.mirror1_url, v.mirror2_url, v.mirror3_url, v.mirror4_url, v.mirror5_url].forEach(check);
    }
    res.json(jobs.map(j => ({ ...j, db_video: dbMap.get(j.video_id) || null })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============ COMMENTS ============
// Fixed preset — reactions are a lightweight signal, not free-form emoji input.
const COMMENT_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

// Attaches a `reactions: [{emoji, count, reacted}]` array to each comment in one extra
// query (grouped in JS) instead of one query per comment.
function attachReactions(comments, userId) {
  if (comments.length === 0) return comments;
  const placeholders = comments.map(() => '?').join(',');
  const rows = db.prepare(`SELECT comment_id, emoji, user_id FROM comment_reactions WHERE comment_id IN (${placeholders})`).all(...comments.map(c => c.id));
  const byComment = {};
  for (const r of rows) {
    const forComment = (byComment[r.comment_id] = byComment[r.comment_id] || {});
    const entry = (forComment[r.emoji] = forComment[r.emoji] || { emoji: r.emoji, count: 0, reacted: false });
    entry.count++;
    if (r.user_id === userId) entry.reacted = true;
  }
  return comments.map(c => ({ ...c, reactions: Object.values(byComment[c.id] || {}) }));
}

app.get('/api/videos/:id/comments', requireAuth, (req, res) => {
  try {
    const comments = db.prepare(`
      SELECT c.*, u.username, u.display_name, u.avatar
      FROM comments c JOIN users u ON c.user_id = u.id
      WHERE c.video_id = ? ORDER BY c.created_at ASC
    `).all(req.params.id);
    res.json(attachReactions(comments, req.session.user.id));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/comments/:id/react', requireAuth, (req, res) => {
  try {
    const { emoji } = req.body;
    if (!COMMENT_REACTION_EMOJIS.includes(emoji)) return res.status(400).json({ error: 'Nieprawidłowa reakcja.' });
    const comment = db.prepare('SELECT id FROM comments WHERE id = ?').get(req.params.id);
    if (!comment) return res.status(404).json({ error: 'Nie znaleziono komentarza.' });
    const userId = req.session.user.id;
    const existing = db.prepare('SELECT 1 FROM comment_reactions WHERE comment_id = ? AND user_id = ? AND emoji = ?').get(req.params.id, userId, emoji);
    if (existing) {
      db.prepare('DELETE FROM comment_reactions WHERE comment_id = ? AND user_id = ? AND emoji = ?').run(req.params.id, userId, emoji);
    } else {
      db.prepare('INSERT INTO comment_reactions (comment_id, user_id, emoji) VALUES (?, ?, ?)').run(req.params.id, userId, emoji);
    }
    const [{ reactions }] = attachReactions([{ id: parseInt(req.params.id) }], userId);
    res.json({ reactions });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/videos/:id/comments', requireAuth, (req, res) => {
  try {
    const { content, parent_id } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Treść wymagana.' });
    const maxComment = getLimit('limit_comment');
    const trimmed = content.trim();
    if (trimmed.length > maxComment) return res.status(400).json({ error: `Komentarz może mieć maksymalnie ${maxComment} znaków.` });
    const result = db.prepare('INSERT INTO comments (video_id, user_id, content, parent_id) VALUES (?, ?, ?, ?)').run(req.params.id, req.session.user.id, trimmed.slice(0, maxComment), parent_id || null);
    const comment = db.prepare('SELECT c.*, u.username, u.display_name, u.avatar FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?').get(result.lastInsertRowid);
    if (parent_id) {
      const parent = db.prepare('SELECT user_id FROM comments WHERE id = ?').get(parent_id);
      if (parent && parent.user_id !== req.session.user.id) {
        const baseUrl = process.env.ALLOWED_ORIGIN || process.env.DISCORD_REDIRECT_URI?.replace(/\/auth.*/, '') || 'https://videos.alleria.pl';
        notifyUser(parent.user_id, {
          type: 'comment_reply', title: 'Nowa odpowiedź',
          body: `${comment.display_name || comment.username} odpowiedział(a) na Twój komentarz`,
          url: `${baseUrl}/video/${req.params.id}`,
        });
      }
    }
    res.json(comment);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Edit comment — silent=true means no edit trace (dev only)
app.put('/api/comments/:id', requireAuth, (req, res) => {
  try {
    const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id);
    if (!comment) return res.status(404).json({ error: 'Nie znaleziono.' });
    const isOwner = comment.user_id === req.session.user.id;
    const isDev = req.session.user.role === 'dev';
    if (!isOwner && !isDev) return res.status(403).json({ error: 'Brak uprawnień.' });
    const { content, silent } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Treść wymagana.' });
    const maxComment = getLimit('limit_comment');
    const trimmed = content.trim();
    if (trimmed.length > maxComment) return res.status(400).json({ error: `Komentarz może mieć maksymalnie ${maxComment} znaków.` });
    const newContent = trimmed.slice(0, maxComment);
    const oldText = comment.content;
    if (silent && isDev) {
      db.prepare('UPDATE comments SET content = ? WHERE id = ?').run(newContent, req.params.id);
    } else {
      let editHistory = []; try { editHistory = JSON.parse(comment.edit_history || '[]'); } catch (e) {}
      editHistory.push({ content: comment.content, date: new Date().toISOString() });
      if (editHistory.length > 20) editHistory = editHistory.slice(-20);
      db.prepare('UPDATE comments SET content = ?, edited = 1, edit_history = ? WHERE id = ?').run(newContent, JSON.stringify(editHistory), req.params.id);
    }
    const updated = db.prepare('SELECT c.*, u.username, u.display_name, u.avatar FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?').get(req.params.id);
    audit(req.session.user.id, "edit", "comment", parseInt(req.params.id), `${silent?'[cicha] ':''}"${oldText.slice(0,50)}" → "${content.trim().slice(0,50)}"`);
    res.json(updated);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Soft delete comment (marks as deleted, keeps for thread integrity)
app.delete('/api/comments/:id', requireAuth, (req, res) => {
  try {
    const comment = db.prepare('SELECT c.*, u.display_name, u.username FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?').get(req.params.id);
    if (!comment) return res.status(404).json({ error: 'Nie znaleziono.' });
    const canDel = comment.user_id === req.session.user.id || req.session.user.role === 'admin' || req.session.user.role === 'dev';
    if (!canDel) return res.status(403).json({ error: 'Brak uprawnień.' });
    audit(req.session.user.id, "delete", "comment", parseInt(req.params.id), `[soft] autor: ${comment.display_name||comment.username}, treść: "${comment.content.slice(0,80)}"`);
    db.prepare("UPDATE comments SET deleted = 1, content = '' WHERE id = ?").run(req.params.id);
    res.json({ success: true, soft: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Hard delete comment + all replies (dev only)
app.delete('/api/comments/:id/hard', requireDev, (req, res) => {
  try {
    const comment = db.prepare('SELECT c.*, u.display_name, u.username FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?').get(req.params.id);
    const replyCount = db.prepare('SELECT COUNT(*) as c FROM comments WHERE parent_id = ?').get(req.params.id)?.c || 0;
    audit(req.session.user.id, "delete", "comment", parseInt(req.params.id), `[hard] autor: ${comment?.display_name||comment?.username||'?'}, treść: "${(comment?.content||'').slice(0,80)}", +${replyCount} odpowiedzi`);
    db.prepare('DELETE FROM comments WHERE parent_id = ?').run(req.params.id);
    db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
    res.json({ success: true, hard: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ COMMENT MODERATION QUEUE ============
const COMMENT_REPORT_REASONS = ['spam', 'harassment', 'spoiler', 'inappropriate', 'other'];

app.post('/api/comments/:id/report', requireAuth, (req, res) => {
  try {
    const comment = db.prepare('SELECT id FROM comments WHERE id = ?').get(req.params.id);
    if (!comment) return res.status(404).json({ error: 'Nie znaleziono komentarza.' });
    const { reason, description } = req.body;
    if (!COMMENT_REPORT_REASONS.includes(reason)) return res.status(400).json({ error: 'Nieprawidłowy powód zgłoszenia.' });
    const desc = String(description || '').trim();
    if (!desc) return res.status(400).json({ error: 'Opis zgłoszenia jest wymagany.' });
    if (desc.length > 1000) return res.status(400).json({ error: 'Opis może mieć maksymalnie 1000 znaków.' });
    const existing = db.prepare(`SELECT 1 FROM comment_reports WHERE comment_id = ? AND reporter_user_id = ? AND status = 'pending'`).get(req.params.id, req.session.user.id);
    if (existing) return res.status(400).json({ error: 'Masz już oczekujące zgłoszenie tego komentarza.' });
    db.prepare('INSERT INTO comment_reports (comment_id, reporter_user_id, reason, description) VALUES (?, ?, ?, ?)')
      .run(req.params.id, req.session.user.id, reason, desc);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/admin/comment-reports/pending-count', requireAdmin, (req, res) => {
  const { count } = db.prepare(`SELECT COUNT(*) AS count FROM comment_reports WHERE status = 'pending'`).get();
  res.json({ count });
});

app.get('/api/admin/comment-reports', requireAdmin, (req, res) => {
  try {
    const { status } = req.query;
    let where = '1=1';
    const params = [];
    if (status) { where += ' AND cr.status = ?'; params.push(status); }
    const reports = db.prepare(`
      SELECT cr.*, ru.username AS reporter_username, ru.display_name AS reporter_display_name,
      c.content AS comment_content, c.deleted AS comment_deleted, c.video_id,
      cu.username AS comment_author_username, cu.display_name AS comment_author_display_name,
      v.title AS video_title
      FROM comment_reports cr
      JOIN users ru ON cr.reporter_user_id = ru.id
      LEFT JOIN comments c ON cr.comment_id = c.id
      LEFT JOIN users cu ON c.user_id = cu.id
      LEFT JOIN videos v ON c.video_id = v.id
      WHERE ${where}
      ORDER BY cr.status = 'pending' DESC, cr.created_at DESC
    `).all(...params);
    res.json(reports);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/admin/comment-reports/:id/resolve', requireAdmin, (req, res) => {
  try {
    const report = db.prepare('SELECT * FROM comment_reports WHERE id = ?').get(req.params.id);
    if (!report) return res.status(404).json({ error: 'Nie znaleziono zgłoszenia.' });
    if (report.status !== 'pending') return res.status(400).json({ error: 'Zgłoszenie zostało już rozpatrzone.' });
    const { action } = req.body;
    if (!['dismiss', 'delete_comment', 'hard_delete'].includes(action)) return res.status(400).json({ error: 'Nieprawidłowa akcja.' });
    if (action === 'hard_delete' && req.session.user.role !== 'dev') return res.status(403).json({ error: 'Tylko dev może usunąć komentarz trwale.' });

    if (action === 'delete_comment') {
      const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(report.comment_id);
      if (comment && !comment.deleted) {
        audit(req.session.user.id, 'delete', 'comment', report.comment_id, `[soft, ze zgłoszenia #${report.id}] treść: "${comment.content.slice(0, 80)}"`);
        db.prepare("UPDATE comments SET deleted = 1, content = '' WHERE id = ?").run(report.comment_id);
      }
    } else if (action === 'hard_delete') {
      const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(report.comment_id);
      if (comment) {
        const replyCount = db.prepare('SELECT COUNT(*) AS c FROM comments WHERE parent_id = ?').get(report.comment_id)?.c || 0;
        audit(req.session.user.id, 'delete', 'comment', report.comment_id, `[hard, ze zgłoszenia #${report.id}] treść: "${(comment.content || '').slice(0, 80)}", +${replyCount} odpowiedzi`);
        db.prepare('DELETE FROM comments WHERE parent_id = ?').run(report.comment_id);
        db.prepare('DELETE FROM comments WHERE id = ?').run(report.comment_id);
      }
    }

    db.prepare(`UPDATE comment_reports SET status = ?, resolved_by = ?, resolved_at = datetime('now') WHERE id = ?`)
      .run(action === 'dismiss' ? 'dismissed' : 'resolved', req.session.user.id, report.id);
    audit(req.session.user.id, 'edit', 'comment_report', report.id, action);
    notifyUser(report.reporter_user_id, {
      type: 'report_resolved', title: 'Zgłoszenie rozpatrzone',
      body: action === 'dismiss' ? 'Twoje zgłoszenie zostało rozpatrzone — nie stwierdzono naruszenia.' : 'Twoje zgłoszenie zostało rozpatrzone — komentarz został usunięty.',
      url: '',
    });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Dev: add comment as another user with custom date
app.post('/api/comments/admin', requireDev, (req, res) => {
  try {
    const { video_id, user_id, content, created_at, parent_id } = req.body;
    if (!video_id || !user_id || !content) return res.status(400).json({ error: 'video_id, user_id, content required' });
    const result = db.prepare('INSERT INTO comments (video_id, user_id, content, created_at, parent_id) VALUES (?, ?, ?, ?, ?)').run(video_id, user_id, content.trim(), created_at || new Date().toISOString(), parent_id || null);
    const comment = db.prepare('SELECT c.*, u.username, u.display_name, u.avatar FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?').get(result.lastInsertRowid);
    res.json(comment);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ HELPERS ============
function extractYoutubeThumbnail(url) {
  if (!url) return '';
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/
  ];
  for (const p of patterns) {
    const match = url.match(p);
    // Use hqdefault — always exists. maxresdefault returns grey placeholder for some videos.
    if (match) return `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`;
  }
  return '';
}

function logLogin(userId, username, method, ip, success, reason) {
  try {
    db.prepare('INSERT INTO login_logs (user_id, username, auth_method, ip_address, success, reason) VALUES (?, ?, ?, ?, ?, ?)')
      .run(userId, username, method, ip, success, reason);
  } catch (e) {
    console.error('Failed to log login:', e);
  }
}

function audit(userId, action, entityType, entityId, details) {
  try {
    db.prepare('INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)')
      .run(userId, action, entityType, entityId || null, typeof details === 'string' ? details : JSON.stringify(details || ''));
  } catch (e) {}
}

// ============ APP SETTINGS (key/value) ============
function getSetting(key, defaultVal = null) {
  try {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
    return row ? row.value : defaultVal;
  } catch (_) { return defaultVal; }
}

function setSetting(key, value) {
  db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));
}

// Removes a setting row entirely (as opposed to setting it to ''), so getSetting() falls back to
// its .env-derived default again — this is how a panel field gets "reset to .env" from the UI.
function clearSetting(key) {
  db.prepare('DELETE FROM app_settings WHERE key = ?').run(key);
}

// Content length limits — configurable via Debug Tools, with defaults.
const LIMIT_DEFAULTS = { limit_display_name: 50, limit_bio: 1000, limit_comment: 3000 };

function getLimit(key) {
  const v = parseInt(getSetting(key, ''), 10);
  return Number.isInteger(v) && v > 0 ? v : LIMIT_DEFAULTS[key];
}

// Webhook SSRF guard — when domain restriction is enabled, only these hosts (and
// their subdomains) may be targeted by server-side webhook requests.
const WEBHOOK_ALLOWED_HOSTS = ['discord.com', 'discordapp.com'];

function isWebhookUrlAllowed(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    return WEBHOOK_ALLOWED_HOSTS.some(h => host === h || host.endsWith('.' + h));
  } catch (_) { return false; }
}

// ============ WEB PUSH ============
// VAPID keypair is generated once and persisted like any other panel-managed secret
// (see smtp_* / ts6_* above) — no manual .env setup required to use browser push.
function getVapidKeys() {
  let publicKey = getSetting('vapid_public_key', '');
  let privateKey = getSetting('vapid_private_key', '');
  if (!publicKey || !privateKey) {
    const keys = webpush.generateVAPIDKeys();
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
    setSetting('vapid_public_key', publicKey);
    setSetting('vapid_private_key', privateKey);
  }
  webpush.setVapidDetails('mailto:push@alleria.local', publicKey, privateKey);
  return { publicKey, privateKey };
}

// Users allowed to view a video — same rules as GET /api/debug/access/video/:id — used to
// scope push delivery to people who actually have access instead of every subscriber.
function getVideoViewerUserIds(video) {
  const dbUsers = db.prepare('SELECT id, role, discord_roles FROM users').all();
  if (video.access_mode === 'custom') {
    const allowed = new Set(db.prepare('SELECT user_id FROM video_access WHERE video_id = ?').all(video.id).map(r => r.user_id));
    return dbUsers.filter(u => u.role === 'dev' || allowed.has(u.id)).map(u => u.id);
  }
  if (!video.category_id) return dbUsers.map(u => u.id);
  const cat = db.prepare('SELECT access_mode FROM categories WHERE id = ?').get(video.category_id);
  if (!cat) return [];
  return dbUsers.filter(u => {
    if (u.role === 'dev') return true;
    const dr = JSON.parse(u.discord_roles || '[]');
    const ur = getUserRankIds(u.id);
    return checkCatAccess(video.category_id, cat.access_mode, u.id, dr, ur).canView;
  }).map(u => u.id);
}

// In-app bell notification for a newly published video — unlike email/push, this isn't gated
// by a per-category opt-in checkbox; a low-friction badge is on for everyone who can see it.
function notifyCategoryOfNewVideo(video) {
  try {
    const baseUrl = process.env.ALLOWED_ORIGIN || process.env.DISCORD_REDIRECT_URI?.replace(/\/auth.*/, '') || 'https://videos.alleria.pl';
    const body = video.category_name ? `${video.title} • ${video.category_name}` : video.title;
    for (const uid of getVideoViewerUserIds(video)) {
      if (uid === video.author_id) continue; // don't notify authors about their own upload
      notifyUser(uid, { type: 'new_video', title: 'Nowy film', body, url: `${baseUrl}/video/${video.id}` });
    }
  } catch (e) { console.error('[NOTIFY] Error:', e.message); }
}

// Never throws — same fire-and-forget philosophy as sendDiscordWebhook/sendCategoryEmailNotifications.
async function sendCategoryPushNotifications(video) {
  if (!video.push_enabled) return;
  try {
    getVapidKeys();
    const viewerIds = new Set(getVideoViewerUserIds(video));
    if (viewerIds.size === 0) return;
    const subs = db.prepare('SELECT * FROM push_subscriptions').all().filter(s => viewerIds.has(s.user_id));
    if (subs.length === 0) return;

    const baseUrl = process.env.ALLOWED_ORIGIN || process.env.DISCORD_REDIRECT_URI?.replace(/\/auth.*/, '') || 'https://videos.alleria.pl';
    const payload = JSON.stringify({
      title: 'Nowy film',
      body: video.category_name ? `${video.title} • ${video.category_name}` : video.title,
      url: `${baseUrl}/video/${video.id}`,
    });

    for (const sub of subs) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
      } catch (e) {
        // Gone/Not Found — the subscription no longer exists on the browser's end, clean it up.
        if (e.statusCode === 404 || e.statusCode === 410) {
          db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
        } else {
          console.error(`[PUSH] Send failed (sub ${sub.id}): ${e.message}`);
        }
      }
    }
  } catch (e) {
    console.error('[PUSH] Error:', e.message);
  }
}

// ============ WATCH PROGRESS ============
app.put('/api/progress/:videoId', requireAuth, (req, res) => {
  const user = req.session.user;
  const videoId = parseInt(req.params.videoId);
  const { position, duration } = req.body;
  if (isNaN(videoId) || position === undefined) return res.status(400).json({ error: 'Missing params' });
  try {
    db.prepare(`
      INSERT INTO watch_progress (user_id, video_id, position, duration, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, video_id) DO UPDATE SET
        position = excluded.position,
        duration = excluded.duration,
        updated_at = excluded.updated_at
    `).run(user.id, videoId, parseFloat(position), parseFloat(duration) || 0);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/progress', requireAuth, (req, res) => {
  const user = req.session.user;
  try {
    const rows = db.prepare(`
      SELECT wp.video_id, wp.position, wp.duration, wp.updated_at,
             v.title, v.thumbnail, v.main_source_type, v.stream_video_id, v.stream_status,
             c.name AS category_name, c.slug AS category_slug
      FROM watch_progress wp
      JOIN videos v ON wp.video_id = v.id
      LEFT JOIN categories c ON v.category_id = c.id
      WHERE wp.user_id = ? AND wp.duration > 0
        AND wp.position > wp.duration * 0.05
        AND wp.position < wp.duration * 0.90
      ORDER BY wp.updated_at DESC
      LIMIT 20
    `).all(user.id);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/progress', requireAuth, (req, res) => {
  const user = req.session.user;
  try {
    const info = db.prepare('DELETE FROM watch_progress WHERE user_id = ?').run(user.id);
    res.json({ success: true, deleted: info.changes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/progress/:videoId', requireAuth, (req, res) => {
  const user = req.session.user;
  try {
    db.prepare('DELETE FROM watch_progress WHERE user_id = ? AND video_id = ?').run(user.id, parseInt(req.params.videoId));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/progress/:videoId', requireAuth, (req, res) => {
  const user = req.session.user;
  try {
    const row = db.prepare('SELECT * FROM watch_progress WHERE user_id = ? AND video_id = ?')
      .get(user.id, parseInt(req.params.videoId));
    res.json(row || null);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ WATCHED MARKS ============
// Deliberately separate from watch_progress — see the video_watched table comment in database.js.
app.post('/api/videos/:id/watched', requireAuth, (req, res) => {
  const user = req.session.user;
  try {
    db.prepare(`
      INSERT INTO video_watched (user_id, video_id, watched_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(user_id, video_id) DO UPDATE SET watched_at = excluded.watched_at
    `).run(user.id, parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/videos/:id/watched', requireAuth, (req, res) => {
  const user = req.session.user;
  try {
    db.prepare('DELETE FROM video_watched WHERE user_id = ? AND video_id = ?').run(user.id, parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/watched', requireAuth, (req, res) => {
  try {
    const rows = db.prepare('SELECT video_id, watched_at FROM video_watched WHERE user_id = ?').all(req.session.user.id);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/watched', requireAuth, (req, res) => {
  const user = req.session.user;
  try {
    const info = db.prepare('DELETE FROM video_watched WHERE user_id = ?').run(user.id);
    res.json({ success: true, deleted: info.changes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ AUDIT LOGS ============
app.get('/api/audit-logs', requireDev, (req, res) => {
  const { page = 1, type, action, user_id } = req.query;
  const perPage = 50;
  const offset = (parseInt(page) - 1) * perPage;
  let where = '1=1';
  const params = [];
  if (type) { where += ' AND a.entity_type = ?'; params.push(type); }
  if (action) { where += ' AND a.action = ?'; params.push(action); }
  if (user_id) { where += ' AND a.user_id = ?'; params.push(parseInt(user_id)); }
  const total = db.prepare(`SELECT COUNT(*) AS c FROM audit_logs a WHERE ${where}`).get(...params).c;
  const logs = db.prepare(`SELECT a.*, u.display_name, u.username FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id WHERE ${where} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`).all(...params, perPage, offset);
  res.json({ logs, total, page: parseInt(page), totalPages: Math.ceil(total / perPage) });
});

app.delete('/api/audit-logs/clear', requireDev, (req, res) => {
  try {
    const info = db.prepare('DELETE FROM audit_logs').run();
    res.json({ success: true, deleted: info.changes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Tags used in a specific category
app.get('/api/tags/category/:slug', requireAuth, (req, res) => {
  try {
    const cat = db.prepare('SELECT id FROM categories WHERE slug = ?').get(req.params.slug);
    if (!cat) return res.json([]);
    const tags = db.prepare(`
      SELECT DISTINCT t.* FROM tags t
      JOIN video_tags vt ON t.id = vt.tag_id
      JOIN videos v ON vt.video_id = v.id
      WHERE v.category_id = ?
      ORDER BY t.name ASC
    `).all(cat.id);
    res.json(tags);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

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
const watchPartyWss = setupWatchPartyWS(db);
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

  // Auto-check transcoding status every 30 seconds
  setInterval(async () => {
    try {
      const transcoding = db.prepare("SELECT * FROM videos WHERE stream_status = 'transcoding' AND stream_video_id IS NOT NULL").all();
      for (const video of transcoding) {
        try {
          const r = await fetch(`${STREAM_URL}/status/${video.stream_video_id}`, {
            headers: { 'X-Stream-Token': STREAM_SECRET }
          });
          const data = await r.json();
          if (data.status === 'ready') {
            db.prepare("UPDATE videos SET stream_status = 'ready' WHERE id = ?").run(video.id);
            console.log(`[TRANSCODE] ✅ Video ${video.id} "${video.title}" → ready`);
          } else if (data.status === 'error') {
            db.prepare("UPDATE videos SET stream_status = 'error' WHERE id = ?").run(video.id);
            console.log(`[TRANSCODE] ❌ Video ${video.id} "${video.title}" → error`);
          }
        } catch (e) { /* streaming service unreachable — skip */ }
      }
    } catch (e) { /* DB error — skip */ }
  }, 30000);

  // Scheduled publishing + webhook check — every 60 seconds
  // Finds videos that are: published (date in past), ready (not transcoding), webhook not yet sent
  setInterval(async () => {
    try {
      const needsWebhook = db.prepare(`
        SELECT v.*, c.name AS category_name, c.webhook_url, c.webhook_template,
        c.webhook_enabled, c.email_enabled, c.push_enabled,
        u.display_name AS author_name
        FROM videos v
        LEFT JOIN categories c ON v.category_id = c.id
        LEFT JOIN users u ON v.author_id = u.id
        WHERE datetime(v.publish_date) <= datetime('now')
        AND (v.webhook_sent IS NULL OR v.webhook_sent = 0)
        AND (v.stream_status IS NULL OR v.stream_status = 'ready')
      `).all();

      for (const video of needsWebhook) {
        // Mark as sent first to prevent duplicates
        db.prepare("UPDATE videos SET webhook_sent = 1 WHERE id = ?").run(video.id);

        // Send Discord webhook if category has one configured and enabled
        if (video.webhook_enabled && video.webhook_url) {
          try {
            await sendDiscordWebhook(video);
            console.log(`[WEBHOOK] ✅ Sent for "${video.title}" (ID: ${video.id})`);
          } catch (e) {
            console.error(`[WEBHOOK] ❌ Failed for "${video.title}": ${e.message}`);
          }
        } else {
          console.log(`[WEBHOOK] Skipped "${video.title}" — disabled or no webhook URL on category`);
        }

        // Email notification is independent of the webhook
        if (video.email_enabled) {
          try {
            await sendCategoryEmailNotifications(video);
            console.log(`[EMAIL] ✅ Sent for "${video.title}" (ID: ${video.id})`);
          } catch (e) {
            console.error(`[EMAIL] ❌ Failed for "${video.title}": ${e.message}`);
          }
        }

        // Browser push notification is independent of the webhook/email
        if (video.push_enabled) {
          try {
            await sendCategoryPushNotifications(video);
            console.log(`[PUSH] ✅ Sent for "${video.title}" (ID: ${video.id})`);
          } catch (e) {
            console.error(`[PUSH] ❌ Failed for "${video.title}": ${e.message}`);
          }
        }

        notifyCategoryOfNewVideo(video);
      }
    } catch (e) { console.error('[WEBHOOK] Interval error:', e.message); }
  }, 60000);
});

// ============ DISCORD WEBHOOK ============
async function sendDiscordWebhook(video) {
  if (!video.webhook_url) return;

  // SSRF guard — block non-Discord targets when domain restriction is enabled (default: on)
  const restrictDomains = getSetting('webhook_domain_restriction', '1') === '1';
  if (restrictDomains && !isWebhookUrlAllowed(video.webhook_url)) {
    console.warn(`[WEBHOOK] Blocked — URL not on Discord allow-list (domain restriction ON): ${video.webhook_url}`);
    return;
  }

  // Default template if none set
  const defaultTemplate = '🎬 **Nowy film:** {title}\n👤 Autor: {author}\n📁 Kategoria: {category}\n🔗 {url}';
  let template = video.webhook_template || defaultTemplate;

  // Available placeholders:
  // {title} - video title
  // {author} - author display name
  // {category} - category name
  // {description} - video description
  // {date} - publish date
  // {id} - video ID
  // {url} - full video URL
  const baseUrl = process.env.ALLOWED_ORIGIN || process.env.DISCORD_REDIRECT_URI?.replace(/\/auth.*/, '') || 'https://videos.alleria.pl';
  const replacements = {
    '{title}': video.title || '',
    '{author}': video.author_name || video.author_display_name || '',
    '{category}': video.category_name || 'Bez kategorii',
    '{description}': (video.description || '').slice(0, 200),
    '{date}': video.publish_date || '',
    '{id}': String(video.id),
    '{url}': `${baseUrl}/video/${video.id}`,
    '{thumbnail}': video.thumbnail || '',
  };

  let content = template;
  for (const [key, val] of Object.entries(replacements)) {
    content = content.split(key).join(val);
  }

  const body = { content };

  // If thumbnail is a full URL, add as embed
  if (video.thumbnail && (video.thumbnail.startsWith('http') || video.thumbnail.startsWith('/'))) {
    const thumbUrl = video.thumbnail.startsWith('http') ? video.thumbnail : `${baseUrl}${video.thumbnail}`;
    body.embeds = [{
      title: video.title,
      url: `${baseUrl}/video/${video.id}`,
      color: 6366450, // indigo
      image: { url: thumbUrl },
      footer: { text: `${video.author_name || ''} • ${video.category_name || ''}` },
    }];
    body.content = content.replace(/\{thumbnail\}/g, '');
  }

  await fetch(video.webhook_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ============ EMAIL TEMPLATES (shared design, admin-editable content) ============
// Default body text for the admin-editable templates below — {tags} get replaced per-send.
// The visual design (header/colors/footer signature) lives only in wrapEmailHtml(), never here.
const EMAIL_TEMPLATE_DEFAULTS = {
  new_video: 'Cześć!\nW kategorii {category} pojawił się nowy film:\n\n{title}\nAutor: {author}',
  gdpr_notify: 'Użytkownik {user} złożył zgłoszenie: {type}.',
  gdpr_result_export: 'Twoja prośba o eksport danych została zatwierdzona. Plik jest już gotowy do pobrania w Twoim profilu.',
  gdpr_result_deletion: 'Twoja prośba o usunięcie konta została zatwierdzona. Twoje dane osobowe zostały zanonimizowane, a konto wylogowane. Ta operacja jest nieodwracalna.',
};

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Template text is always plain content, never HTML — everything (including the static parts of
// the template) is escaped first, so an admin typing "<b>" ends up as literal text, not markup.
// Blank lines become paragraph breaks.
function renderTemplateParagraphs(template, replacements) {
  let body = escapeHtml(template);
  for (const [key, val] of Object.entries(replacements)) {
    body = body.split(escapeHtml(key)).join(escapeHtml(val));
  }
  return body.split('\n').filter(line => line.trim() !== '')
    .map(line => `<p style="margin:0 0 14px 0; line-height:1.6; color:#3f3f46;">${line}</p>`).join('');
}

// Single shared shell for every email the platform sends — admin-editable templates only ever
// supply bodyHtml (via renderTemplateParagraphs above); the header/colors/footer are fixed here
// so every email looks consistent and professional regardless of who edits the content.
function wrapEmailHtml({ bodyHtml, ctaUrl, ctaLabel }) {
  const cta = ctaUrl ? `
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:6px;">
          <tr><td style="border-radius:10px; background-color:#7c3aed;">
            <a href="${escapeHtml(ctaUrl)}" style="display:inline-block; padding:12px 26px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; font-size:14px; font-weight:600; color:#ffffff; text-decoration:none;">${escapeHtml(ctaLabel || 'Otwórz')}</a>
          </td></tr>
        </table>` : '';
  return `<!doctype html>
<html lang="pl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0; padding:0; background-color:#f4f4f7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7; padding:32px 16px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; background-color:#ffffff; border-radius:16px; overflow:hidden;">
        <tr><td style="background-color:#7c3aed; padding:26px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:10px;"><img src="https://alleria.pl/image/favicon.png" alt="" width="28" height="28" style="display:block; border-radius:6px;"></td>
            <td style="font-size:19px; font-weight:700; color:#ffffff;">Alleria Filmy</td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:32px; font-size:15px;">
          ${bodyHtml}${cta}
        </td></tr>
        <tr><td style="padding:22px 32px; background-color:#fafafa; border-top:1px solid #ececec;">
          <p style="margin:0; font-size:13px; color:#71717a;">Pozdrawiamy,<br><strong style="color:#3f3f46;">Zespół Alleria.pl</strong></p>
          <p style="margin:10px 0 0; font-size:11px; color:#a1a1aa;">Ta wiadomość została wysłana automatycznie - nie odpowiadaj na nią.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// Fresh transport per send — this app's email volume doesn't warrant pooling/cache invalidation.
function getMailTransport() {
  return nodemailer.createTransport({
    host: getSetting('smtp_host', ''),
    port: parseInt(getSetting('smtp_port', '587'), 10) || 587,
    secure: getSetting('smtp_secure', '0') === '1',
    auth: {
      user: getSetting('smtp_user', ''),
      pass: getSetting('smtp_password', ''),
    },
  });
}

// Never throws — one bad send should never break the publish flow, same philosophy as sendDiscordWebhook.
async function sendEmail({ to, subject, html }) {
  try {
    const from = getSetting('smtp_from', '') || getSetting('smtp_user', '');
    await getMailTransport().sendMail({ from, to, subject, html });
    return true;
  } catch (e) {
    console.error(`[EMAIL] Send to ${to} failed: ${e.message}`);
    return false;
  }
}

async function sendCategoryEmailNotifications(video) {
  if (!video.email_enabled) return;

  // Sitewide template — categories only get a per-category on/off checkbox now (Ustawienia >
  // Ustawienia serwera E-mail > Szablony e-mail owns the actual content, for every category).
  const template = getSetting('email_template_new_video', EMAIL_TEMPLATE_DEFAULTS.new_video);

  const baseUrl = process.env.ALLOWED_ORIGIN || process.env.DISCORD_REDIRECT_URI?.replace(/\/auth.*/, '') || 'https://videos.alleria.pl';
  const replacements = {
    '{title}': video.title || '',
    '{author}': video.author_name || video.author_display_name || '',
    '{category}': video.category_name || 'Bez kategorii',
    '{description}': (video.description || '').slice(0, 200),
    '{date}': video.publish_date || '',
    '{id}': String(video.id),
    '{url}': `${baseUrl}/video/${video.id}`,
    '{thumbnail}': video.thumbnail || '',
  };
  const bodyHtml = renderTemplateParagraphs(template, replacements);
  const html = wrapEmailHtml({ bodyHtml, ctaUrl: replacements['{url}'], ctaLabel: 'Obejrzyj film' });

  const recipients = db.prepare(`SELECT email, discord_email FROM users WHERE email_notifications = 1`).all();
  for (const r of recipients) {
    const to = r.email || r.discord_email;
    if (!to) continue;
    await sendEmail({ to, subject: `Nowy film: ${video.title}`, html });
  }
}
