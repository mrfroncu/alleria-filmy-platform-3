const fetch = require('node-fetch');
const webpush = require('web-push');
const db = require('../db');
const { notifyUser } = require('../notifications');
const { EMAIL_TEMPLATE_DEFAULTS, renderTemplateParagraphs, sendEmail, wrapEmailHtml } = require('./email');
const { userCanViewVideo } = require('./access');
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

// Users allowed to view a video, decided by the real access gate (userCanViewVideo — same as
// GET /api/videos/:id and the Dev Tools checker) — used to scope push/e-mail/bell delivery to
// people who can actually open it instead of every subscriber.
function getVideoViewerUserIds(video) {
  return db.prepare('SELECT id, role, discord_roles FROM users').all()
    .filter(u => userCanViewVideo(video, { id: u.id, role: u.role, discord_roles: JSON.parse(u.discord_roles || '[]') }).ok)
    .map(u => u.id);
}

const baseUrl = () => process.env.ALLOWED_ORIGIN || process.env.DISCORD_REDIRECT_URI?.replace(/\/auth.*/, '') || 'https://videos.alleria.pl';

// In-app bell notification for a newly published video — unlike email/push, this isn't gated
// by a per-category opt-in checkbox; a low-friction badge is on for everyone who can see it.
// Every channel below never throws and returns { status: 'sent'|'partial'|'failed'|'skipped',
// detail, recipients?, delivered? } so announceVideo can log the real outcome.
function notifyCategoryOfNewVideo(video) {
  try {
    const body = video.category_name ? `${video.title} • ${video.category_name}` : video.title;
    const recipients = getVideoViewerUserIds(video).filter(uid => uid !== video.author_id); // not the author about their own upload
    let delivered = 0;
    for (const uid of recipients) {
      if (notifyUser(uid, { type: 'new_video', title: 'Nowy film', body, url: `${baseUrl()}/video/${video.id}` })) delivered++;
    }
    if (recipients.length === 0) return { status: 'skipped', detail: 'Brak odbiorców z dostępem do filmu', recipients: 0, delivered: 0 };
    return { status: countStatus(delivered, recipients.length), detail: `${delivered}/${recipients.length} użytkowników`, recipients: recipients.length, delivered };
  } catch (e) {
    console.error('[NOTIFY] Error:', e.message);
    return { status: 'failed', detail: e.message };
  }
}

function countStatus(delivered, total) {
  return delivered === total ? 'sent' : delivered === 0 ? 'failed' : 'partial';
}

async function sendCategoryPushNotifications(video) {
  try {
    getVapidKeys();
    const viewerIds = new Set(getVideoViewerUserIds(video));
    const subs = db.prepare('SELECT * FROM push_subscriptions').all().filter(s => viewerIds.has(s.user_id));
    if (subs.length === 0) return { status: 'skipped', detail: 'Brak subskrypcji push wśród osób z dostępem', recipients: 0, delivered: 0 };

    const payload = JSON.stringify({
      title: 'Nowy film',
      body: video.category_name ? `${video.title} • ${video.category_name}` : video.title,
      url: `${baseUrl()}/video/${video.id}`,
    });

    let delivered = 0, expired = 0;
    const errors = [];
    for (const sub of subs) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
        delivered++;
      } catch (e) {
        // Gone/Not Found — the subscription no longer exists on the browser's end, clean it up.
        if (e.statusCode === 404 || e.statusCode === 410) {
          db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
          expired++;
        } else {
          console.error(`[PUSH] Send failed (sub ${sub.id}): ${e.message}`);
          errors.push(e.statusCode ? `HTTP ${e.statusCode}` : e.message);
        }
      }
    }
    const detail = [`${delivered}/${subs.length} urządzeń`, expired ? `${expired} wygasłych usunięto` : '', errors.length ? `błędy: ${[...new Set(errors)].join(', ')}` : '']
      .filter(Boolean).join(', ');
    return { status: countStatus(delivered, subs.length - expired || subs.length), detail, recipients: subs.length, delivered };
  } catch (e) {
    console.error('[PUSH] Error:', e.message);
    return { status: 'failed', detail: e.message };
  }
}

// ============ DISCORD WEBHOOK ============
async function sendDiscordWebhook(video) {
  if (!video.webhook_url) return { status: 'skipped', detail: 'Kategoria nie ma ustawionego adresu webhooka' };

  // SSRF guard — block non-Discord targets when domain restriction is enabled (default: on)
  const restrictDomains = getSetting('webhook_domain_restriction', '1') === '1';
  if (restrictDomains && !isWebhookUrlAllowed(video.webhook_url)) {
    console.warn(`[WEBHOOK] Blocked — URL not on Discord allow-list (domain restriction ON): ${video.webhook_url}`);
    return { status: 'failed', detail: 'Adres webhooka spoza dozwolonych domen (discord.com) - zablokowano' };
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
  const base = baseUrl();
  const replacements = {
    '{title}': video.title || '',
    '{author}': video.author_name || video.author_display_name || '',
    '{category}': video.category_name || 'Bez kategorii',
    '{description}': (video.description || '').slice(0, 200),
    '{date}': video.publish_date || '',
    '{id}': String(video.id),
    '{url}': `${base}/video/${video.id}`,
    '{thumbnail}': video.thumbnail || '',
  };

  let content = template;
  for (const [key, val] of Object.entries(replacements)) {
    content = content.split(key).join(val);
  }

  const body = { content };

  // If thumbnail is a full URL, add as embed
  if (video.thumbnail && (video.thumbnail.startsWith('http') || video.thumbnail.startsWith('/'))) {
    const thumbUrl = video.thumbnail.startsWith('http') ? video.thumbnail : `${base}${video.thumbnail}`;
    body.embeds = [{
      title: video.title,
      url: `${base}/video/${video.id}`,
      color: 6366450, // indigo
      image: { url: thumbUrl },
      footer: { text: `${video.author_name || ''} • ${video.category_name || ''}` },
    }];
    body.content = content.replace(/\{thumbnail\}/g, '');
  }

  // Discord answers 204 on success; anything else (bad template → 400, deleted webhook → 404,
  // rate limit → 429) used to be silently treated as sent — now it's reported with its body.
  try {
    const res = await fetch(video.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      timeout: 15000,
    });
    if (res.ok) return { status: 'sent', detail: `Discord: HTTP ${res.status}` };
    const text = (await res.text().catch(() => '')).slice(0, 300);
    return { status: 'failed', detail: `Discord: HTTP ${res.status}${text ? ` - ${text}` : ''}` };
  } catch (e) {
    return { status: 'failed', detail: `Błąd połączenia: ${e.message}` };
  }
}

// Recipients: users who opted into e-mails AND can actually open the video (it used to go to
// every opted-in user, leaking titles of restricted-category videos to people without access).
async function sendCategoryEmailNotifications(video) {
  if (!getSetting('smtp_host', '')) return { status: 'skipped', detail: 'Serwer SMTP nie jest skonfigurowany' };

  // Sitewide template — categories only get a per-category on/off checkbox now (Ustawienia >
  // Ustawienia serwera E-mail > Szablony e-mail owns the actual content, for every category).
  const template = getSetting('email_template_new_video', EMAIL_TEMPLATE_DEFAULTS.new_video);

  const replacements = {
    '{title}': video.title || '',
    '{author}': video.author_name || video.author_display_name || '',
    '{category}': video.category_name || 'Bez kategorii',
    '{description}': (video.description || '').slice(0, 200),
    '{date}': video.publish_date || '',
    '{id}': String(video.id),
    '{url}': `${baseUrl()}/video/${video.id}`,
    '{thumbnail}': video.thumbnail || '',
  };
  const bodyHtml = renderTemplateParagraphs(template, replacements);
  const html = wrapEmailHtml({ bodyHtml, ctaUrl: replacements['{url}'], ctaLabel: 'Obejrzyj film' });

  const viewerIds = new Set(getVideoViewerUserIds(video));
  const recipients = db.prepare(`SELECT id, email, discord_email FROM users WHERE email_notifications = 1`).all()
    .filter(r => viewerIds.has(r.id) && (r.email || r.discord_email));
  if (recipients.length === 0) return { status: 'skipped', detail: 'Brak odbiorców (włączone e-maile + dostęp do filmu)', recipients: 0, delivered: 0 };
  let delivered = 0;
  for (const r of recipients) {
    if (await sendEmail({ to: r.email || r.discord_email, subject: `Nowy film: ${video.title}`, html })) delivered++;
  }
  return { status: countStatus(delivered, recipients.length), detail: `${delivered}/${recipients.length} adresów`, recipients: recipients.length, delivered };
}

// ============ ANNOUNCEMENT ============
const CHANNELS = ['webhook', 'email', 'push', 'bell'];
const CATEGORY_TOGGLE = { webhook: 'webhook_enabled', email: 'email_enabled', push: 'push_enabled' };

function loadVideoForAnnouncement(videoId) {
  return db.prepare(`
    SELECT v.*, c.name AS category_name, c.webhook_url, c.webhook_template,
    c.webhook_enabled, c.email_enabled, c.push_enabled,
    u.display_name AS author_name
    FROM videos v
    LEFT JOIN categories c ON v.category_id = c.id
    LEFT JOIN users u ON v.author_id = u.id
    WHERE v.id = ?
  `).get(videoId);
}

// Sends the "new video" announcement on the given channels and records every outcome in
// video_notification_log. trigger = 'auto' (publication: jobs.js / immediate publish in
// POST /api/videos) or 'manual' (resend from the publication panel, userId = who clicked).
// Channels switched off in the video's category are logged as skipped, not sent.
// Never throws; returns [{ channel, status, detail, recipients, delivered }].
async function announceVideo(videoId, { trigger = 'auto', userId = null, channels = CHANNELS } = {}) {
  const video = loadVideoForAnnouncement(videoId);
  if (!video) return [];
  const log = db.prepare(`INSERT INTO video_notification_log (video_id, channel, status, trigger, detail, recipients, delivered, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const results = [];
  for (const channel of CHANNELS.filter(c => channels.includes(c))) {
    let r;
    const toggle = CATEGORY_TOGGLE[channel];
    if (toggle && !video[toggle]) {
      r = { status: 'skipped', detail: video.category_id ? 'Wyłączone w ustawieniach kategorii' : 'Film bez kategorii' };
    } else if (channel === 'webhook') r = await sendDiscordWebhook(video);
    else if (channel === 'email') r = await sendCategoryEmailNotifications(video);
    else if (channel === 'push') r = await sendCategoryPushNotifications(video);
    else r = notifyCategoryOfNewVideo(video);
    console.log(`[NOTIFY] ${channel} for "${video.title}" (ID: ${video.id}, ${trigger}): ${r.status}${r.detail ? ` - ${r.detail}` : ''}`);
    try {
      log.run(video.id, channel, r.status, trigger, r.detail || '', r.recipients ?? null, r.delivered ?? null, userId);
    } catch (e) { console.error('[NOTIFY] Log write failed:', e.message); }
    results.push({ channel, ...r });
  }
  return results;
}

module.exports = { WEBHOOK_ALLOWED_HOSTS, NOTIFICATION_CHANNELS: CHANNELS, isWebhookUrlAllowed, getVapidKeys, getVideoViewerUserIds, notifyCategoryOfNewVideo, sendCategoryPushNotifications, sendDiscordWebhook, sendCategoryEmailNotifications, announceVideo };
