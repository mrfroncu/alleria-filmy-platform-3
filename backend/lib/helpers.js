const db = require('../db');

// Same category/rank rule as the frontend's own returnTo check, but also rejects any
// backslash — browsers resolve "/\evil.com" identically to "//evil.com" for http(s)
// navigation, so a prefix-only "//" check can be bypassed with a backslash.
function isSafeReturnTo(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length >= 500) return false;
  if (value.includes('\\') || value.includes('\n') || value.includes('\r')) return false;
  if (!value.startsWith('/') || value.startsWith('//')) return false;
  return true;
}

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

module.exports = { isSafeReturnTo, extractYoutubeThumbnail, logLogin, audit };
