const path = require('path');

// Try loading .env from multiple possible locations
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config(); // cwd fallback

const express = require('express');
const session = require('express-session');
const cors = require('cors');
const fetch = require('node-fetch');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const { initDB } = require('./database');

const app = express();
const db = initDB();
const PORT = process.env.PORT || 3000;

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

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, uuidv4() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Session store using SQLite
const SQLiteStore = require('connect-sqlite3')(session);

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Increase timeout for large video uploads (30 min)
app.use('/api/stream/upload', (req, res, next) => {
  req.setTimeout(30 * 60 * 1000);
  res.setTimeout(30 * 60 * 1000);
  next();
});

// CRITICAL: trust reverse proxy (nginx, traefik, etc.) so req.protocol / req.ip work
app.set('trust proxy', 1);

// DRM security headers — restrict screen capture APIs
const iframeEnabled = process.env.IFRAME_EMBED_ENABLED === 'true';
const iframeAllowedOrigins = (process.env.IFRAME_ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(o => /^https?:\/\/[^;\s]+$/.test(o));

app.use((req, res, next) => {
  // Permissions-Policy: deny display capture for the whole page
  res.set('Permissions-Policy', 'display-capture=(), screen-wake-lock=()');
  // X-Frame-Options does not support allowlists; rely on CSP frame-ancestors for modern browsers
  res.set('X-Frame-Options', 'SAMEORIGIN');
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

app.use(session({
  store: new SQLiteStore({ dir: path.join(__dirname, 'data'), db: 'sessions.db' }),
  secret: process.env.SESSION_SECRET || 'alleria-filmy-secret',
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

// Serve uploaded thumbnails
app.use('/api/uploads', express.static(uploadsDir));

// ============ HEALTH CHECK ============
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    discord_configured: !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET && process.env.DISCORD_BOT_TOKEN),
    discord_client_id_set: !!process.env.DISCORD_CLIENT_ID,
    discord_redirect_uri: process.env.DISCORD_REDIRECT_URI || 'NOT SET',
    guild_id_set: !!process.env.DISCORD_GUILD_ID,
    member_role_set: !!process.env.DISCORD_MEMBER_ROLE_ID,
    admin_role_set: !!process.env.DISCORD_ADMIN_ROLE_ID,
    dev_role_set: !!process.env.DISCORD_DEV_ROLE_ID,
  });
});

// Public config for frontend display settings
app.get('/api/config', (req, res) => {
  res.json({
    videosPerPage: parseInt(process.env.VIDEOS_PER_PAGE) || 12,
    gridColumns: parseInt(process.env.GRID_COLUMNS) || 3,
    logsPerPage: parseInt(process.env.LOGS_PER_PAGE) || 50,
  });
});

// Version info
const { PANEL_VERSION, API_VERSION, STREAM_MIN_VERSION } = require('./versions');
app.get('/api/version', (req, res) => {
  res.json({ version: PANEL_VERSION, api: API_VERSION, streamMinVersion: STREAM_MIN_VERSION, component: 'alleria-filmy' });
});

// Proxy streaming version with compatibility check
app.get('/api/version/streaming', async (req, res) => {
  try {
    const r = await fetch(`${STREAM_URL || 'http://streaming:4000'}/version`);
    const data = await r.json();
    const sv = data.version || '0.0.0';
    const isCompat = sv >= STREAM_MIN_VERSION;
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

// ============ DISCORD AUTH ============
function discordRedirectHandler(req, res) {
  if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_REDIRECT_URI) {
    console.error('Discord auth failed: DISCORD_CLIENT_ID or DISCORD_REDIRECT_URI not set');
    return res.redirect('/login?error=config_missing');
  }
  // Save return URL so user gets redirected back after login
  if (req.query.returnTo) {
    req.session.returnTo = req.query.returnTo;
  }
  // Track popup flow — used when the app is embedded in an iframe
  const isPopupFlow = req.query.popup === 'true';
  if (isPopupFlow) {
    req.session.popup = true;
  }
  if (req.query.returnTo || isPopupFlow) {
    req.session.save(() => {});
  }
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify guilds.members.read'
  });
  const url = `https://discord.com/api/oauth2/authorize?${params}`;
  console.log('Redirecting to Discord OAuth:', url.replace(process.env.DISCORD_CLIENT_ID, '***'));
  res.redirect(url);
}

// Register on BOTH paths so it works with or without /api/ prefix
app.get('/api/auth/discord', discordRedirectHandler);
app.get('/auth/discord', discordRedirectHandler);

async function discordCallbackHandler(req, res) {
  const { code } = req.query;
  console.log('[AUTH] Discord callback received, code:', code ? 'present' : 'MISSING');
  if (!code) return res.redirect('/login?error=no_code');

  const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;

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

    // Check if user has required role
    const hasMemberRole = roles.includes(process.env.DISCORD_MEMBER_ROLE_ID);
    const hasAdminRole = roles.includes(process.env.DISCORD_ADMIN_ROLE_ID);
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

    const avatarUrl = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : `https://cdn.discordapp.com/embed/avatars/${parseInt(discordUser.discriminator || '0') % 5}.png`;

    // Upsert user
    const existing = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(discordUser.id);
    let userId;
    const rolesJson = JSON.stringify(roles);
    if (existing) {
      db.prepare(`UPDATE users SET username = ?, display_name = ?, avatar = ?, role = ?, discord_roles = ?, last_login = datetime('now') WHERE discord_id = ?`)
        .run(discordUser.username, member.nick || discordUser.global_name || discordUser.username, avatarUrl, role, rolesJson, discordUser.id);
      userId = existing.id;
    } else {
      const result = db.prepare('INSERT INTO users (discord_id, username, display_name, avatar, role, auth_method, discord_roles) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(discordUser.id, discordUser.username, member.nick || discordUser.global_name || discordUser.username, avatarUrl, role, 'discord', rolesJson);
      userId = result.lastInsertRowid;
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
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

    logLogin(userId, discordUser.username, 'discord', clientIp, 1, null);
    console.log('[AUTH] ✅ Login successful:', user.display_name, '(role:', role, ')');
    console.log('[AUTH] Session ID:', req.sessionID);

    // CRITICAL: explicitly save session before redirect to prevent race condition
    req.session.save((err) => {
      if (err) {
        console.error('[AUTH] Session save error:', err);
        return res.redirect('/login?error=auth_failed');
      }
      const isPopup = req.session.popup;
      const returnTo = req.session.returnTo || '/';
      delete req.session.returnTo;
      delete req.session.popup;

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

  } catch (err) {
    console.error('[AUTH] Discord auth error:', err);
    logLogin(null, 'unknown', 'discord', clientIp, 0, err.message);
    res.redirect('/login?error=auth_failed');
  }
}

// Register callback on BOTH paths — works whether DISCORD_REDIRECT_URI has /api/ or not
app.get('/api/auth/discord/callback', discordCallbackHandler);
app.get('/auth/discord/callback', discordCallbackHandler);

// ============ TEAMSPEAK 6 AUTH ============
// Uses TS ServerQuery HTTP API (port 10080)
// Auth: Basic Auth (username:password) + optional x-api-key
// Endpoints: /{serverId}/clientlist, /{serverId}/clientinfo, /{serverId}/servergroupsbyclientid
app.post('/api/auth/teamspeak', async (req, res) => {
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
  const cleanIp = clientIp.replace('::ffff:', '');

  const tsHost = process.env.TS6_HOST || process.env.TS_SERVER_HOST;
  const tsQueryPort = process.env.TS6_QUERY_PORT || process.env.TS_API_PORT || '10080';
  const tsUsername = process.env.TS6_USERNAME || process.env.TS_USERNAME || 'serveradmin';
  const tsPassword = process.env.TS6_PASSWORD || process.env.TS_PASSWORD || '';
  const tsApiKey = process.env.TS6_API_KEY || process.env.TS_API_KEY || '';
  const tsServerId = process.env.TS6_SERVER_ID || process.env.TS_SERVER_ID || '1';

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

    // Step 1: Get client list
    const clientListRes = await fetch(`${tsBaseUrl}/${tsServerId}/clientlist`, { headers });
    if (!clientListRes.ok) {
      const errText = await clientListRes.text();
      throw new Error(`TS6 clientlist failed (${clientListRes.status}): ${errText.slice(0, 200)}`);
    }
    const clientListData = await clientListRes.json();
    const clients = clientListData.body || clientListData || [];

    console.log(`[TS6] Got ${clients.length} clients, looking for IP ${cleanIp}`);

    // Step 2: Find client by IP — need clientinfo for each to get IP
    let matchedClient = null;
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
          matchedClient = { ...client, ...info };
          break;
        }
      } catch (e) {
        console.log(`[TS6] Error getting info for clid ${clid}: ${e.message}`);
      }
    }

    if (!matchedClient) {
      logLogin(null, 'unknown', 'teamspeak', clientIp, 0, `No TS client with IP ${cleanIp}`);
      return res.status(401).json({ error: 'Nie znaleziono klienta TeamSpeak z Twoim IP. Upewnij się, że jesteś połączony z serwerem TS.' });
    }

    const tsNickname = matchedClient.client_nickname;
    const tsUid = matchedClient.client_unique_identifier;
    const tsDbId = matchedClient.client_database_id;
    console.log(`[TS6] Matched client: "${tsNickname}" (uid: ${tsUid}, dbid: ${tsDbId})`);

    // Step 3: Get server groups via client database ID
    let groups = [];
    try {
      const sgRes = await fetch(`${tsBaseUrl}/${tsServerId}/servergroupsbyclientid?cldbid=${tsDbId}`, { headers });
      if (sgRes.ok) {
        const sgData = await sgRes.json();
        const sgList = sgData.body || sgData || [];
        groups = (Array.isArray(sgList) ? sgList : [sgList]).map(g => String(g.sgid));
      }
    } catch (e) {
      console.log(`[TS6] Error getting groups: ${e.message}`);
    }

    console.log(`[TS6] User "${tsNickname}" groups: [${groups.join(', ')}]`);

    const memberGroupId = process.env.TS6_MEMBER_GROUP_ID || process.env.TS_MEMBER_GROUP_ID;
    const adminGroupId = process.env.TS6_ADMIN_GROUP_ID || process.env.TS_ADMIN_GROUP_ID;

    const hasMemberGroup = memberGroupId ? groups.includes(String(memberGroupId)) : true;
    const hasAdminGroup = adminGroupId ? groups.includes(String(adminGroupId)) : false;

    if (!hasMemberGroup && !hasAdminGroup) {
      logLogin(null, tsNickname, 'teamspeak', clientIp, 0, `Missing group (has: ${groups.join(',')})`);
      return res.status(401).json({ error: 'Nie posiadasz wymaganej grupy na serwerze TeamSpeak.' });
    }

    let role = 'member';
    if (hasAdminGroup) role = 'admin';

    // Upsert user
    let existing = db.prepare('SELECT * FROM users WHERE ts_uid = ?').get(tsUid);
    if (!existing) existing = db.prepare("SELECT * FROM users WHERE ts_ip = ? AND auth_method = 'teamspeak'").get(cleanIp);

    let userId;
    if (existing) {
      db.prepare(`UPDATE users SET username=?, display_name=?, role=?, ts_ip=?, ts_uid=?, last_login=datetime('now') WHERE id=?`)
        .run(tsNickname, tsNickname, role, cleanIp, tsUid, existing.id);
      userId = existing.id;
    } else {
      const result = db.prepare('INSERT INTO users (username, display_name, role, auth_method, ts_ip, ts_uid) VALUES (?, ?, ?, ?, ?, ?)')
        .run(tsNickname, tsNickname, role, 'teamspeak', cleanIp, tsUid);
      userId = result.lastInsertRowid;
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    req.session.user = {
      id: user.id, username: user.username, display_name: user.display_name,
      avatar: user.avatar, role: user.role, auth_method: 'teamspeak', discord_roles: []
    };

    logLogin(userId, tsNickname, 'teamspeak', clientIp, 1, null);
    console.log(`[TS6] ✅ Login: "${tsNickname}" (role: ${role})`);
    req.session.save(() => res.json({ success: true, user: req.session.user }));

  } catch (err) {
    console.error('[TS6 AUTH] Error:', err);
    logLogin(null, 'unknown', 'teamspeak', clientIp, 0, err.message);
    res.status(500).json({ error: 'TeamSpeak auth failed: ' + err.message });
  }
});

// ============ AUTH STATUS & LOGOUT ============
app.get('/api/auth/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  res.json(req.session.user);
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// ============ VIDEOS API ============
app.get('/api/videos', requireAuth, (req, res) => {
  const { search, tags, author, sort = 'newest', include_transcoding, category } = req.query;
  const isAdmin = req.session.user.role === 'admin' || req.session.user.role === 'dev';
  
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

  // Hide transcoding videos from regular users
  if (!isAdmin || !include_transcoding) {
    conditions.push("(v.stream_status IS NULL OR v.stream_status = 'ready')");
  }

  // Hide scheduled (future) videos from regular users
  if (!isAdmin) {
    conditions.push("v.publish_date <= datetime('now')");
  }

  // Access control for non-admin users
  if (!isAdmin) {
    const userId = req.session.user.id;
    const userRoles = req.session.user.discord_roles || [];

    // Hide custom-access videos unless user is in video_access list
    conditions.push(`(v.access_mode IS NULL OR v.access_mode = 'category' OR (v.access_mode = 'custom' AND v.id IN (SELECT video_id FROM video_access WHERE user_id = ?)))`);
    params.push(userId);

    // Hide videos from categories the user doesn't have access to
    // Logic: if a category has viewer/editor roles set, user must have at least one matching role
    // If a category has NO roles set (empty), it's public to all members
    const allCats = db.prepare('SELECT id FROM categories').all();
    const restrictedCatIds = [];
    for (const cat of allCats) {
      const catRoles = db.prepare("SELECT discord_role_id FROM category_access WHERE category_id = ? AND access_type IN ('viewer','editor')").all(cat.id).map(r => r.discord_role_id);
      if (catRoles.length > 0) {
        // Category has roles set — check if user matches
        const hasAccess = catRoles.some(r => userRoles.includes(r));
        if (!hasAccess) restrictedCatIds.push(cat.id);
      }
      // If catRoles.length === 0 → public, no restriction
    }
    if (restrictedCatIds.length > 0) {
      conditions.push(`(v.category_id IS NULL OR v.category_id NOT IN (${restrictedCatIds.map(() => '?').join(',')}))`);
      params.push(...restrictedCatIds);
    }
  }

  if (search) {
    conditions.push('v.title LIKE ?');
    params.push(`%${search}%`);
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
    // Check category access for non-admin users
    if (!isAdmin) {
      const cat = db.prepare('SELECT id FROM categories WHERE slug = ?').get(category);
      if (cat) {
        const catViewerRoles = db.prepare("SELECT discord_role_id FROM category_access WHERE category_id = ? AND access_type IN ('viewer','editor')").all(cat.id).map(r => r.discord_role_id);
        if (catViewerRoles.length > 0) {
          const userRoles = req.session.user.discord_roles || [];
          const hasAccess = catViewerRoles.some(r => userRoles.includes(r));
          if (!hasAccess) return res.json([]); // No access — return empty, not error
        }
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

  try {
    const videos = db.prepare(sql).all(...params);
    res.json(videos.map(v => ({
      ...v,
      tags: v.tag_names ? v.tag_names.split(',').map((name, i) => ({
        id: parseInt(v.tag_ids.split(',')[i]),
        name
      })) : []
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

    // Access enforcement for non-admin users
    const user = req.session.user;
    const isAdmin = user.role === 'admin' || user.role === 'dev';
    if (!isAdmin) {
      // Check custom access
      if (video.access_mode === 'custom') {
        const hasAccess = db.prepare('SELECT 1 FROM video_access WHERE video_id = ? AND user_id = ?').get(video.id, user.id);
        if (!hasAccess) return res.status(403).json({ error: 'Brak dostępu do tego filmu.' });
      }
      // Check category access
      if (video.category_id) {
        const catRoles = db.prepare("SELECT discord_role_id, access_type FROM category_access WHERE category_id = ? AND access_type IN ('viewer','editor')").all(video.category_id);
        if (catRoles.length > 0) {
          const userRoles = user.discord_roles || [];
          const hasAccess = catRoles.some(a => userRoles.includes(a.discord_role_id));
          if (!hasAccess) return res.status(403).json({ error: 'Brak dostępu do tej kategorii.' });
        }
        // If catRoles.length === 0 → public category, everyone with platform access can view
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

app.post('/api/videos', requireAdmin, upload.single('thumbnail_file'), (req, res) => {
  try {
    const { title, author_id, main_source, main_source_type, main_source_title,
      thumbnail, mirror1_name, mirror1_url, mirror1_is_embed, mirror1_type,
      mirror2_name, mirror2_url, mirror2_is_embed, mirror2_type, description, publish_date, tags,
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

    const result = db.prepare(`
      INSERT INTO videos (title, author_id, main_source, main_source_type, main_source_title, thumbnail, custom_thumbnail,
        mirror1_name, mirror1_url, mirror1_is_embed, mirror1_type, mirror2_name, mirror2_url, mirror2_is_embed, mirror2_type,
        description, publish_date, stream_video_id, drm_enhanced, category_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(title, parseInt(author_id), main_source || '', main_source_type || 'youtube', main_source_title || '',
      thumbUrl, customThumb,
      mirror1_name || null, mirror1_url || null, m1t === 'embed' ? 1 : 0, m1t,
      mirror2_name || null, mirror2_url || null, m2t === 'embed' ? 1 : 0, m2t,
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
          u.display_name AS author_name FROM videos v
          LEFT JOIN categories c ON v.category_id = c.id
          LEFT JOIN users u ON v.author_id = u.id WHERE v.id = ?
        `).get(videoId);
        if (videoFull && videoFull.webhook_url) {
          console.log(`[WEBHOOK] Immediate send for "${title}" (cat: ${videoFull.category_name})`);
          db.prepare("UPDATE videos SET webhook_sent = 1 WHERE id = ?").run(videoId);
          sendDiscordWebhook(videoFull).catch(e => console.error('[WEBHOOK] Error:', e.message));
        } else if (videoFull) {
          // No webhook URL on category — mark as sent to avoid retry spam
          db.prepare("UPDATE videos SET webhook_sent = 1 WHERE id = ?").run(videoId);
          console.log(`[WEBHOOK] No webhook URL for "${title}" — skipped`);
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
      mirror2_name, mirror2_url, mirror2_is_embed, mirror2_type, description, publish_date, tags,
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

    db.prepare(`
      UPDATE videos SET title=?, author_id=?, main_source=?, main_source_type=?, main_source_title=?, thumbnail=?, custom_thumbnail=?,
        mirror1_name=?, mirror1_url=?, mirror1_is_embed=?, mirror1_type=?,
        mirror2_name=?, mirror2_url=?, mirror2_is_embed=?, mirror2_type=?,
        description=?, publish_date=?, category_id=?, stream_video_id=?, drm_enhanced=?, access_mode=?,
        updated_at=datetime('now') WHERE id=?
    `).run(title, parseInt(author_id), main_source, main_source_type || 'youtube', main_source_title || '',
      thumbUrl, customThumb,
      mirror1_name || null, mirror1_url || null, m1type === 'embed' ? 1 : 0, m1type,
      mirror2_name || null, mirror2_url || null, m2type === 'embed' ? 1 : 0, m2type,
      description || '', publish_date,
      category_id ? parseInt(category_id) : null,
      stream_video_id || existing.stream_video_id || null,
      drm_enhanced === 'true' || drm_enhanced === '1' ? 1 : (existing.drm_enhanced || 0),
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
    if ((mirror1_name||'') !== (existing.mirror1_name||'')) changes.push(`mirror1 nazwa: "${existing.mirror1_name||''}" → "${mirror1_name||''}"`);
    if ((mirror2_name||'') !== (existing.mirror2_name||'')) changes.push(`mirror2 nazwa: "${existing.mirror2_name||''}" → "${mirror2_name||''}"`);
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
  let tags;
  if (search) {
    tags = db.prepare('SELECT * FROM tags WHERE name LIKE ? ORDER BY name').all(`%${search}%`);
  } else {
    tags = db.prepare('SELECT * FROM tags ORDER BY name').all();
  }
  res.json(tags);
});

app.delete('/api/tags/:id', requireAdmin, (req, res) => {
  try {
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
    const isDevOrAdmin = user.role === 'dev' || user.role === 'admin';

    // Dev/admin sees all categories
    if (isDevOrAdmin) {
      const cats = allCats.map(c => {
        const access = db.prepare('SELECT * FROM category_access WHERE category_id = ?').all(c.id);
        const videoCount = db.prepare('SELECT COUNT(*) AS c FROM videos WHERE category_id = ?').get(c.id).c;
        return { ...c, access, videoCount, canView: true, canEdit: true };
      });
      return res.json(cats);
    }

    // Regular users — check role-based access
    const userRoles = user.discord_roles || [];
    const cats = allCats.map(c => {
      const access = db.prepare('SELECT * FROM category_access WHERE category_id = ?').all(c.id);
      const viewerRoles = access.filter(a => a.access_type === 'viewer').map(a => a.discord_role_id);
      const editorRoles = access.filter(a => a.access_type === 'editor').map(a => a.discord_role_id);
      // No access rules = public to all members
      const canView = viewerRoles.length === 0 || userRoles.some(r => viewerRoles.includes(r)) || userRoles.some(r => editorRoles.includes(r));
      const canEdit = editorRoles.length === 0 ? false : userRoles.some(r => editorRoles.includes(r));
      const videoCount = db.prepare('SELECT COUNT(*) AS c FROM videos WHERE category_id = ?').get(c.id).c;
      return { ...c, access, videoCount, canView, canEdit };
    }).filter(c => c.canView);

    res.json(cats);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create category (dev only)
app.post('/api/categories', requireDev, (req, res) => {
  try {
    const { name, description, icon, sort_order, parent_id, webhook_url, webhook_template } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const result = db.prepare('INSERT INTO categories (name, slug, description, icon, sort_order, parent_id, webhook_url, webhook_template) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(name, slug, description || '', icon || 'Film', sort_order || 0, parent_id || null, webhook_url || '', webhook_template || '');
    const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);
    audit(req.session.user.id, "create", "category", cat.id, name);
    res.json({ success: true, category: cat });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update category (dev only)
app.put('/api/categories/:id', requireDev, (req, res) => {
  try {
    const { name, description, icon, sort_order, parent_id, webhook_url, webhook_template } = req.body;
    const slug = name ? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : undefined;
    if (name) db.prepare('UPDATE categories SET name=?, slug=?, description=?, icon=?, sort_order=?, parent_id=?, webhook_url=?, webhook_template=? WHERE id=?')
      .run(name, slug, description || '', icon || 'Film', sort_order || 0, parent_id || null, webhook_url || '', webhook_template || '', req.params.id);
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

// Set category access roles (dev only)
app.post('/api/categories/:id/access', requireDev, (req, res) => {
  try {
    const { viewers, editors } = req.body;
    db.prepare('DELETE FROM category_access WHERE category_id = ?').run(req.params.id);
    if (viewers) {
      const stmt = db.prepare('INSERT OR IGNORE INTO category_access (category_id, discord_role_id, access_type) VALUES (?, ?, ?)');
      viewers.forEach(r => stmt.run(req.params.id, r, 'viewer'));
    }
    if (editors) {
      const stmt = db.prepare('INSERT OR IGNORE INTO category_access (category_id, discord_role_id, access_type) VALUES (?, ?, ?)');
      editors.forEach(r => stmt.run(req.params.id, r, 'editor'));
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
    const placeholders = video_ids.map(() => '?').join(',');
    let changes = 0;

    switch (action) {
      case 'change_category':
        changes = db.prepare(`UPDATE videos SET category_id = ? WHERE id IN (${placeholders})`).run(value || null, ...video_ids).changes;
        break;
      case 'change_author':
        if (!value) return res.status(400).json({ error: 'Author ID required' });
        changes = db.prepare(`UPDATE videos SET author_id = ? WHERE id IN (${placeholders})`).run(parseInt(value), ...video_ids).changes;
        break;
      case 'change_access':
        changes = db.prepare(`UPDATE videos SET access_mode = ? WHERE id IN (${placeholders})`).run(value || 'category', ...video_ids).changes;
        break;
      case 'delete':
        changes = db.prepare(`DELETE FROM videos WHERE id IN (${placeholders})`).run(...video_ids).changes;
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

// ============ USERS API ============
app.get('/api/users', requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, display_name, avatar, role, auth_method, created_at, last_login, discord_roles FROM users ORDER BY created_at DESC').all();
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

app.get('/api/users/all', requireAuth, (req, res) => {
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

// ============ LOGS API ============
app.get('/api/logs/watch', requireAdmin, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const perPage = parseInt(process.env.LOGS_PER_PAGE) || 50;
  const offset = (page - 1) * perPage;
  const total = db.prepare('SELECT COUNT(*) AS c FROM watch_logs').get().c;
  const logs = db.prepare(`
    SELECT wl.*, u.username, u.display_name AS user_display, v.title AS video_title
    FROM watch_logs wl
    LEFT JOIN users u ON wl.user_id = u.id
    LEFT JOIN videos v ON wl.video_id = v.id
    ORDER BY wl.watched_at DESC LIMIT ? OFFSET ?
  `).all(perPage, offset);
  res.json({ logs, total, page, perPage, totalPages: Math.ceil(total / perPage) });
});

app.get('/api/logs/login', requireAdmin, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const perPage = parseInt(process.env.LOGS_PER_PAGE) || 50;
  const offset = (page - 1) * perPage;
  const total = db.prepare('SELECT COUNT(*) AS c FROM login_logs').get().c;
  const logs = db.prepare('SELECT * FROM login_logs ORDER BY logged_at DESC LIMIT ? OFFSET ?').all(perPage, offset);
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

    res.json({ totalVideos, totalUsers, totalViews, totalTags, mostWatched, topViewers, recentActivity, tagCloud, topAuthors, myStats });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ PROFILE API ============
app.get('/api/profile', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, username, display_name, avatar, role, bio, auth_method, created_at, last_login FROM users WHERE id = ?').get(req.session.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const videoCount = db.prepare('SELECT COUNT(*) AS c FROM videos WHERE author_id = ?').get(user.id).c;
  const viewCount = db.prepare('SELECT COUNT(*) AS c FROM watch_logs WHERE user_id = ?').get(user.id).c;
  const favCount = db.prepare('SELECT COUNT(*) AS c FROM favorites WHERE user_id = ?').get(user.id).c;
  res.json({ ...user, videoCount, viewCount, favCount });
});

app.put('/api/profile', requireAuth, (req, res) => {
  try {
    const { display_name, bio } = req.body;
    if (display_name !== undefined) {
      db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(display_name.trim(), req.session.user.id);
      req.session.user.display_name = display_name.trim();
    }
    if (bio !== undefined) {
      db.prepare('UPDATE users SET bio = ? WHERE id = ?').run(bio, req.session.user.id);
    }
    req.session.save(() => {});
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ DEBUG / DEV API ============
app.get('/api/debug/export', requireDev, (req, res) => {
  try {
    const data = {
      users: db.prepare('SELECT * FROM users').all(),
      videos: db.prepare('SELECT * FROM videos').all(),
      tags: db.prepare('SELECT * FROM tags').all(),
      video_tags: db.prepare('SELECT * FROM video_tags').all(),
      watch_logs: db.prepare('SELECT * FROM watch_logs').all(),
      login_logs: db.prepare('SELECT * FROM login_logs').all()
    };
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Export failed' });
  }
});

app.post('/api/debug/import', requireDev, (req, res) => {
  try {
    const data = req.body;
    const transaction = db.transaction(() => {
      // Clear tables in order
      db.prepare('DELETE FROM video_tags').run();
      db.prepare('DELETE FROM watch_logs').run();
      db.prepare('DELETE FROM login_logs').run();
      db.prepare('DELETE FROM videos').run();
      db.prepare('DELETE FROM tags').run();
      db.prepare('DELETE FROM users').run();

      // Re-insert
      if (data.users) {
        const stmt = db.prepare('INSERT INTO users (id, discord_id, username, display_name, avatar, role, auth_method, ts_ip, ts_uid, created_at, last_login) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        data.users.forEach(u => stmt.run(u.id, u.discord_id, u.username, u.display_name, u.avatar, u.role, u.auth_method, u.ts_ip, u.ts_uid, u.created_at, u.last_login));
      }
      if (data.tags) {
        const stmt = db.prepare('INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)');
        data.tags.forEach(t => stmt.run(t.id, t.name, t.created_at));
      }
      if (data.videos) {
        const stmt = db.prepare('INSERT INTO videos (id, title, author_id, main_source, main_source_type, main_source_title, thumbnail, custom_thumbnail, mirror1_name, mirror1_url, mirror1_is_embed, mirror2_name, mirror2_url, mirror2_is_embed, description, publish_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        data.videos.forEach(v => stmt.run(v.id, v.title, v.author_id, v.main_source, v.main_source_type, v.main_source_title, v.thumbnail, v.custom_thumbnail, v.mirror1_name, v.mirror1_url, v.mirror1_is_embed, v.mirror2_name, v.mirror2_url, v.mirror2_is_embed, v.description, v.publish_date, v.created_at, v.updated_at));
      }
      if (data.video_tags) {
        const stmt = db.prepare('INSERT OR IGNORE INTO video_tags (video_id, tag_id) VALUES (?, ?)');
        data.video_tags.forEach(vt => stmt.run(vt.video_id, vt.tag_id));
      }
      if (data.watch_logs) {
        const stmt = db.prepare('INSERT INTO watch_logs (id, user_id, video_id, watched_at) VALUES (?, ?, ?, ?)');
        data.watch_logs.forEach(w => stmt.run(w.id, w.user_id, w.video_id, w.watched_at));
      }
      if (data.login_logs) {
        const stmt = db.prepare('INSERT INTO login_logs (id, user_id, username, auth_method, ip_address, success, reason, logged_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        data.login_logs.forEach(l => stmt.run(l.id, l.user_id, l.username, l.auth_method, l.ip_address, l.success, l.reason, l.logged_at));
      }
    });
    transaction();
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

// ============ STREAMING PROXY ============
const STREAM_URL = process.env.STREAM_URL || 'http://streaming:4000';
const STREAM_SECRET = process.env.STREAM_SECRET || 'alleria-stream-key';

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
  const uploadId = uuidv4();
  const uploadDir = path.join(chunksDir, uploadId);
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.writeFileSync(path.join(uploadDir, 'meta.json'), JSON.stringify({
    filename, filesize: parseInt(filesize) || 0, total_chunks: parseInt(total_chunks),
    drm_enhanced: drm_enhanced === 'true' || drm_enhanced === true,
    received: [], created: Date.now()
  }));
  console.log(`[CHUNK] Upload init: ${uploadId} — ${filename} (${total_chunks} chunks, ${(parseInt(filesize) / 1024 / 1024).toFixed(1)} MB)`);
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
    const writeStream = fs.createWriteStream(assembledPath);
    for (let i = 0; i < meta.total_chunks; i++) {
      const chunkPath = path.join(uploadDir, `chunk_${String(i).padStart(6, '0')}`);
      if (!fs.existsSync(chunkPath)) throw new Error(`Chunk ${i} missing`);
      const data = fs.readFileSync(chunkPath);
      writeStream.write(data);
    }
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
      writeStream.end();
    });

    const fileSize = fs.statSync(assembledPath).size;
    console.log(`[CHUNK] Assembled: ${(fileSize / 1024 / 1024).toFixed(1)} MB — forwarding to streaming service...`);

    // Forward assembled file to streaming service via stream
    const { PassThrough } = require('stream');
    const boundary = '----AlleriaBoundary' + Date.now();
    const preamble = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="video"; filename="${meta.filename}"\r\nContent-Type: video/mp4\r\n\r\n`
    );
    const epilogue = Buffer.from(
      `\r\n--${boundary}\r\nContent-Disposition: form-data; name="drm_enhanced"\r\n\r\n${meta.drm_enhanced ? 'true' : 'false'}\r\n--${boundary}--\r\n`
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
    console.log(`[CHUNK] ✅ Complete: ${upload_id} → stream ${data.video_id || 'error'}`);

    // Cleanup
    try { fs.rmSync(uploadDir, { recursive: true }); } catch (e) {}
    try { fs.unlinkSync(assembledPath); } catch (e) {}

    res.json(data);
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

// Proxy stream media & keys (so streaming container is never exposed publicly)
app.get('/stream/keys/*', requireAuth, async (req, res) => {
  try {
    const url = `${STREAM_URL}/keys/${req.params[0]}?t=${req.query.t || ''}&uid=${req.query.uid || ''}`;
    const r = await fetch(url);
    if (!r.ok) return res.status(r.status).send('Key error');
    const buf = await r.arrayBuffer();
    res.set({ 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.send(Buffer.from(buf));
  } catch (err) { res.status(500).send('Key proxy error'); }
});

app.get('/stream/media/*', requireAuth, async (req, res) => {
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

      // Replace any key URI — match the EXT-X-KEY line and rewrite the URI to be absolute
      body = body.replace(
        /URI="([^"]*keys\/[^"]*enc\.key\?[^"]*)"/g,
        (match, uri) => {
          // Already absolute with http/https — just pass through
          if (uri.startsWith('http://') || uri.startsWith('https://')) return match;
          // Relative or root-relative — make absolute
          const cleanPath = uri.startsWith('/') ? uri : `/stream/keys/${uri.replace(/^.*?keys\//, '')}`;
          return `URI="${origin}${cleanPath}"`;
        }
      );

      // Also handle edge case: URI that has STREAM_HOST placeholder leftover
      body = body.replace(/STREAM_HOST/g, origin);

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

// Cleanup orphaned/failed streaming videos
app.get('/api/stream/cleanup', requireDev, async (req, res) => {
  try {
    const r = await fetch(`${STREAM_URL}/cleanup/list`, { headers: { 'X-Stream-Token': STREAM_SECRET } });
    const data = await r.json();
    // Also find DB videos pointing to non-existent stream IDs
    const dbOrphans = db.prepare("SELECT id, title, stream_video_id, stream_status FROM videos WHERE stream_video_id IS NOT NULL AND (stream_status = 'error' OR stream_status = 'transcoding')").all();
    res.json({ ...data, dbOrphans });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/stream/cleanup', requireDev, async (req, res) => {
  try {
    // Purge from streaming service
    const r = await fetch(`${STREAM_URL}/cleanup/purge`, {
      method: 'POST',
      headers: { 'X-Stream-Token': STREAM_SECRET, 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_ids: req.body.video_ids || [] }),
    });
    const data = await r.json();
    // Also clean DB entries for error/orphan videos if requested
    if (req.body.clean_db) {
      const info = db.prepare("UPDATE videos SET stream_video_id = NULL, stream_status = NULL WHERE stream_status = 'error'").run();
      data.dbCleaned = info.changes;
    }
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============ COMMENTS ============
app.get('/api/videos/:id/comments', requireAuth, (req, res) => {
  try {
    const comments = db.prepare(`
      SELECT c.*, u.username, u.display_name, u.avatar
      FROM comments c JOIN users u ON c.user_id = u.id
      WHERE c.video_id = ? ORDER BY c.created_at ASC
    `).all(req.params.id);
    res.json(comments);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/videos/:id/comments', requireAuth, (req, res) => {
  try {
    const { content, parent_id } = req.body;
    if (!content?.trim()) return res.status(400).json({ error: 'Treść wymagana.' });
    const result = db.prepare('INSERT INTO comments (video_id, user_id, content, parent_id) VALUES (?, ?, ?, ?)').run(req.params.id, req.session.user.id, content.trim(), parent_id || null);
    const comment = db.prepare('SELECT c.*, u.username, u.display_name, u.avatar FROM comments c JOIN users u ON c.user_id = u.id WHERE c.id = ?').get(result.lastInsertRowid);
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
    const oldText = comment.content;
    if (silent && isDev) {
      db.prepare('UPDATE comments SET content = ? WHERE id = ?').run(content.trim(), req.params.id);
    } else {
      let history = []; try { history = JSON.parse(comment.edit_history || '[]'); } catch (e) {}
      history.push({ content: comment.content, date: new Date().toISOString() });
      db.prepare('UPDATE comments SET content = ?, edited = 1, edit_history = ? WHERE id = ?').run(content.trim(), JSON.stringify(history), req.params.id);
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

// ============ AUDIT LOGS ============
app.get('/api/audit-logs', requireDev, (req, res) => {
  const { page = 1, type, action } = req.query;
  const perPage = 50;
  const offset = (parseInt(page) - 1) * perPage;
  let where = '1=1';
  const params = [];
  if (type) { where += ' AND a.entity_type = ?'; params.push(type); }
  if (action) { where += ' AND a.action = ?'; params.push(action); }
  const total = db.prepare(`SELECT COUNT(*) AS c FROM audit_logs a WHERE ${where}`).get(...params).c;
  const logs = db.prepare(`SELECT a.*, u.display_name, u.username FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id WHERE ${where} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`).all(...params, perPage, offset);
  res.json({ logs, total, page: parseInt(page), totalPages: Math.ceil(total / perPage) });
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
    res.sendFile(indexPath);
  } else {
    res.status(503).send('<h1>ALLERIA FILMY</h1><p>Frontend not built. Run <code>cd frontend && npm run build</code></p>');
  }
});

app.listen(PORT, '0.0.0.0', () => {
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
        u.display_name AS author_name
        FROM videos v
        LEFT JOIN categories c ON v.category_id = c.id
        LEFT JOIN users u ON v.author_id = u.id
        WHERE v.publish_date <= datetime('now')
        AND (v.webhook_sent IS NULL OR v.webhook_sent = 0)
        AND (v.stream_status IS NULL OR v.stream_status = 'ready')
      `).all();

      for (const video of needsWebhook) {
        // Mark as sent first to prevent duplicates
        db.prepare("UPDATE videos SET webhook_sent = 1 WHERE id = ?").run(video.id);

        // Send Discord webhook if category has one configured
        if (video.webhook_url) {
          try {
            await sendDiscordWebhook(video);
            console.log(`[WEBHOOK] ✅ Sent for "${video.title}" (ID: ${video.id})`);
          } catch (e) {
            console.error(`[WEBHOOK] ❌ Failed for "${video.title}": ${e.message}`);
          }
        } else {
          console.log(`[WEBHOOK] Skipped "${video.title}" — no webhook URL on category`);
        }
      }
    } catch (e) { console.error('[WEBHOOK] Interval error:', e.message); }
  }, 60000);
});

// ============ DISCORD WEBHOOK ============
async function sendDiscordWebhook(video) {
  if (!video.webhook_url) return;

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
