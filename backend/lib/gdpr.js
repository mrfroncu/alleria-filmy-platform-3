const db = require('../db');
const { EMAIL_TEMPLATE_DEFAULTS, renderTemplateParagraphs, sendEmail, wrapEmailHtml } = require('./email');
const { getSetting } = require('./settings');
const { invalidateUserSessions } = require('./sessions');

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
    username = ?, display_name = 'Usunięty użytkownik', bio = '', avatar = NULL, avatar_source = 'global', custom_avatar = NULL,
    discord_id = NULL, discord_roles = '[]', discord_avatar_hash = NULL, discord_guild_avatar_hash = NULL, discord_email = NULL,
    email = NULL, email_notifications = 0,
    ts3_uid = NULL, ts3_ip = NULL, ts6_uid = NULL, ts6_ip = NULL, role = 'member',
    is_anonymized = 1, anonymized_original_username = ?, anonymized_original_display_name = ?,
    anonymized_at = datetime('now')
    WHERE id = ?`).run(`deleted_user_${userId}`, u.username, u.display_name, userId);
  invalidateUserSessions(userId);
}

// Separate, opt-in step a dev can take on top of anonymizeUser() — actually removes the user's
// activity/log rows instead of just scrubbing identifying columns. Deliberately leaves: the users
// row itself (comments/videos reference it), authored videos, and comments (already anonymized
// via the username change above). Also leaves comment_reports and audit_logs alone — those are a
// moderation/security trail kept by design even across deletions, not a personal activity log.
function purgeUserActivityData(userId) {
  const tables = [
    'watch_logs', 'video_playback_events', 'watch_progress', 'video_watched',
    'favorites', 'notifications', 'push_subscriptions', 'login_logs', 'comment_reactions',
  ];
  for (const t of tables) {
    db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(userId);
  }
  db.prepare('DELETE FROM watch_party_logs WHERE user_id = ?').run(userId);
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

module.exports = { gdprEnabled, buildUserDataExport, anonymizeUser, purgeUserActivityData, notifyDevsOfGdprRequest, notifyUserOfGdprResult };
