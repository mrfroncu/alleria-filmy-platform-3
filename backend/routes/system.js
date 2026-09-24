const express = require('express');
const fetch = require('node-fetch');
const { STREAM_MIN_VERSION, VERSION } = require('../versions');
const { STREAM_SECRET } = require('../lib/config');
const { STREAM_URL } = require('../lib/stream');
const { requireAuth, requireDev } = require('../lib/auth');
const { settingsPayload } = require('../lib/appSettings');

const router = express.Router();

// ============ HEALTH CHECK ============
router.get('/api/health', (req, res) => {
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
router.get('/api/config', requireAuth, (req, res) => {
  const s = settingsPayload();
  res.json({
    videosPerPage: s.videos_per_page,
    gridColumns: s.grid_columns,
    gridCardMinWidth: s.grid_card_min_width,
    infiniteScroll: s.infinite_scroll,
    logsPerPage: s.logs_per_page,
    limitDisplayName: s.limit_display_name,
    limitBio: s.limit_bio,
    limitComment: s.limit_comment,
    showTopBar: s.show_top_bar,
    allowCustomAvatars: s.allow_custom_avatars,
    customYoutubePlayer: s.youtube_custom_player,
    gdprRegion: s.gdpr_region,
  });
});

// Version info
router.get('/api/version', requireAuth, (req, res) => {
  res.json({ version: VERSION, streamMinVersion: STREAM_MIN_VERSION, component: 'alleria-filmy' });
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
router.get('/api/version/streaming', requireAuth, async (req, res) => {
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
router.get('/api/stream/stats', requireDev, async (req, res) => {
  try {
    const r = await fetch(`${STREAM_URL}/stats`, { headers: { 'X-Stream-Token': STREAM_SECRET } });
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
