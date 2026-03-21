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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CRITICAL: trust reverse proxy (nginx, traefik, etc.) so req.protocol / req.ip work
app.set('trust proxy', 1);

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
    if (existing) {
      db.prepare(`UPDATE users SET username = ?, display_name = ?, avatar = ?, role = ?, last_login = datetime('now') WHERE discord_id = ?`)
        .run(discordUser.username, member.nick || discordUser.global_name || discordUser.username, avatarUrl, role, discordUser.id);
      userId = existing.id;
    } else {
      const result = db.prepare('INSERT INTO users (discord_id, username, display_name, avatar, role, auth_method) VALUES (?, ?, ?, ?, ?, ?)')
        .run(discordUser.id, discordUser.username, member.nick || discordUser.global_name || discordUser.username, avatarUrl, role, 'discord');
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
      auth_method: 'discord'
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
      console.log('[AUTH] Session saved, redirecting to /');
      res.redirect('/');
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

// ============ TEAMSPEAK AUTH ============
app.post('/api/auth/teamspeak', async (req, res) => {
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;

  try {
    // In production, this would query the TS server via ServerQuery
    // For now, we check if there's a user with matching IP in our DB that was verified
    const user = db.prepare('SELECT * FROM users WHERE ts_ip = ? AND auth_method = "teamspeak"').get(clientIp);
    
    if (!user) {
      logLogin(null, 'unknown', 'teamspeak', clientIp, 0, 'No TS user found with matching IP');
      return res.status(401).json({ error: 'No TeamSpeak user found with your IP. Make sure you are connected to the TeamSpeak server.' });
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      avatar: user.avatar,
      role: user.role,
      auth_method: 'teamspeak'
    };

    logLogin(user.id, user.username, 'teamspeak', clientIp, 1, null);
    res.json({ success: true, user: req.session.user });

  } catch (err) {
    console.error('TeamSpeak auth error:', err);
    logLogin(null, 'unknown', 'teamspeak', clientIp, 0, err.message);
    res.status(500).json({ error: 'TeamSpeak authentication failed' });
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
  const { search, tags, author, sort = 'newest' } = req.query;
  
  let sql = `
    SELECT v.*, u.username AS author_name, u.display_name AS author_display_name,
    GROUP_CONCAT(DISTINCT t.name) AS tag_names,
    GROUP_CONCAT(DISTINCT t.id) AS tag_ids
    FROM videos v
    LEFT JOIN users u ON v.author_id = u.id
    LEFT JOIN video_tags vt ON v.id = vt.video_id
    LEFT JOIN tags t ON vt.tag_id = t.id
  `;
  
  const conditions = [];
  const params = [];

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
      SELECT v.*, u.username AS author_name, u.display_name AS author_display_name
      FROM videos v LEFT JOIN users u ON v.author_id = u.id WHERE v.id = ?
    `).get(req.params.id);
    
    if (!video) return res.status(404).json({ error: 'Video not found' });

    const tags = db.prepare(`
      SELECT t.* FROM tags t JOIN video_tags vt ON t.id = vt.tag_id WHERE vt.video_id = ?
    `).all(req.params.id);

    // Get previous and next videos
    const prevVideo = db.prepare(`
      SELECT id, title FROM videos WHERE publish_date < ? OR (publish_date = ? AND id < ?) ORDER BY publish_date DESC, id DESC LIMIT 1
    `).get(video.publish_date, video.publish_date, video.id);

    const nextVideo = db.prepare(`
      SELECT id, title FROM videos WHERE publish_date > ? OR (publish_date = ? AND id > ?) ORDER BY publish_date ASC, id ASC LIMIT 1
    `).get(video.publish_date, video.publish_date, video.id);

    // Log watch
    db.prepare('INSERT INTO watch_logs (user_id, video_id) VALUES (?, ?)').run(req.session.user.id, video.id);

    res.json({ ...video, tags, prevVideo, nextVideo });
  } catch (err) {
    console.error('Error fetching video:', err);
    res.status(500).json({ error: 'Failed to fetch video' });
  }
});

app.post('/api/videos', requireAdmin, upload.single('thumbnail_file'), (req, res) => {
  try {
    const { title, author_id, main_source, main_source_type, main_source_title,
      thumbnail, mirror1_name, mirror1_url, mirror1_is_embed,
      mirror2_name, mirror2_url, mirror2_is_embed, description, publish_date, tags } = req.body;

    let thumbUrl = thumbnail || extractYoutubeThumbnail(main_source);
    let customThumb = 0;

    if (req.file) {
      thumbUrl = `/api/uploads/${req.file.filename}`;
      customThumb = 1;
    } else if (thumbnail) {
      customThumb = 1;
    }

    const result = db.prepare(`
      INSERT INTO videos (title, author_id, main_source, main_source_type, main_source_title, thumbnail, custom_thumbnail,
        mirror1_name, mirror1_url, mirror1_is_embed, mirror2_name, mirror2_url, mirror2_is_embed,
        description, publish_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(title, parseInt(author_id), main_source, main_source_type || 'youtube', main_source_title || '',
      thumbUrl, customThumb,
      mirror1_name || null, mirror1_url || null, mirror1_is_embed === 'true' || mirror1_is_embed === '1' ? 1 : 0,
      mirror2_name || null, mirror2_url || null, mirror2_is_embed === 'true' || mirror2_is_embed === '1' ? 1 : 0,
      description || '', publish_date);

    const videoId = result.lastInsertRowid;

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
      thumbnail, mirror1_name, mirror1_url, mirror1_is_embed,
      mirror2_name, mirror2_url, mirror2_is_embed, description, publish_date, tags } = req.body;

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

    db.prepare(`
      UPDATE videos SET title=?, author_id=?, main_source=?, main_source_type=?, main_source_title=?, thumbnail=?, custom_thumbnail=?,
        mirror1_name=?, mirror1_url=?, mirror1_is_embed=?, mirror2_name=?, mirror2_url=?, mirror2_is_embed=?,
        description=?, publish_date=?, updated_at=datetime('now') WHERE id=?
    `).run(title, parseInt(author_id), main_source, main_source_type || 'youtube', main_source_title || '',
      thumbUrl, customThumb,
      mirror1_name || null, mirror1_url || null, mirror1_is_embed === 'true' || mirror1_is_embed === '1' ? 1 : 0,
      mirror2_name || null, mirror2_url || null, mirror2_is_embed === 'true' || mirror2_is_embed === '1' ? 1 : 0,
      description || '', publish_date, req.params.id);

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

    res.json({ success: true });
  } catch (err) {
    console.error('Error updating video:', err);
    res.status(500).json({ error: 'Failed to update video' });
  }
});

app.delete('/api/videos/:id', requireAdmin, (req, res) => {
  try {
    db.prepare('DELETE FROM videos WHERE id = ?').run(req.params.id);
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
    db.prepare('DELETE FROM tags WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete tag' });
  }
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
  const users = db.prepare('SELECT id, username, display_name, avatar, role, auth_method, created_at, last_login FROM users ORDER BY created_at DESC').all();
  res.json(users);
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
  const logs = db.prepare(`
    SELECT wl.*, u.username, u.display_name AS user_display, v.title AS video_title
    FROM watch_logs wl
    LEFT JOIN users u ON wl.user_id = u.id
    LEFT JOIN videos v ON wl.video_id = v.id
    ORDER BY wl.watched_at DESC LIMIT 100
  `).all();
  res.json(logs);
});

app.get('/api/logs/login', requireAdmin, (req, res) => {
  const logs = db.prepare('SELECT * FROM login_logs ORDER BY logged_at DESC LIMIT 100').all();
  res.json(logs);
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
});
