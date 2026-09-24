const fetch = require('node-fetch');
const webpush = require('web-push');
const db = require('../db');
const { notifyUser } = require('../notifications');
const { EMAIL_TEMPLATE_DEFAULTS, renderTemplateParagraphs, sendEmail, wrapEmailHtml } = require('./email');
const { checkCatAccess, getUserRankIds } = require('./access');
const { getSetting, setSetting } = require('./settings');

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

module.exports = { WEBHOOK_ALLOWED_HOSTS, isWebhookUrlAllowed, getVapidKeys, getVideoViewerUserIds, notifyCategoryOfNewVideo, sendCategoryPushNotifications, sendDiscordWebhook, sendCategoryEmailNotifications };
