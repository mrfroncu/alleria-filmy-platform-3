const path = require('path');
const fs = require('fs');

// Test mode (set by the API test suite in tests/): disables rate limits and the
// SQLite session store so tests are deterministic and leave no files behind.
const IS_TEST = process.env.NODE_ENV === 'test';

const PORT = process.env.PORT || 3000;

// lib/ lives one level below backend/ — every on-disk path hangs off backend/data.
const DATA_DIR = path.join(__dirname, '..', 'data');

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
const uploadsDir = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// GDPR/RODO data-export files
const gdprDir = path.join(DATA_DIR, 'gdpr');
if (!fs.existsSync(gdprDir)) fs.mkdirSync(gdprDir, { recursive: true });

// DRM security headers — restrict screen capture APIs
const IFRAME_ORIGIN_RE = /^https?:\/\/[^;\s,]+$/;

const isProduction = process.env.NODE_ENV === 'production';
const behindHttps = (process.env.DISCORD_REDIRECT_URI || '').startsWith('https://');

// Chunked upload temp dir
const chunksDir = path.join(DATA_DIR, 'chunks');
if (!fs.existsSync(chunksDir)) fs.mkdirSync(chunksDir, { recursive: true });

module.exports = { IS_TEST, PORT, DATA_DIR, SESSION_SECRET, STREAM_SECRET, uploadsDir, gdprDir, IFRAME_ORIGIN_RE, isProduction, behindHttps, chunksDir };
