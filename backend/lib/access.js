const db = require('../db');

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

// Shared category/custom-access/scheduling check for a video row — same rules as
// GET /api/videos/:id, reused by every route that lets a user reach a video's metadata or
// actual stream bytes (stream token/keys/media, progress, favorites, comments, watch-party
// queue) so none of them can be used to bypass the per-category rank/role restrictions or
// see a scheduled video before its publish_date. Returns { ok, reason? } — `reason` lets a
// caller that wants a friendlier response (e.g. a "not published yet" panel instead of a
// blanket access-denied page) distinguish that case from "no access at all".
function userCanViewVideo(video, user) {
  if (!video) return { ok: false, reason: 'not_found' };
  if (user.role === 'dev') return { ok: true };
  if (video.access_mode === 'custom') {
    const hasAccess = db.prepare('SELECT 1 FROM video_access WHERE video_id = ? AND user_id = ?').get(video.id, user.id);
    if (!hasAccess) return { ok: false, reason: 'no_access' };
  }
  let canEdit = false;
  if (video.category_id) {
    const cat = db.prepare('SELECT access_mode FROM categories WHERE id = ?').get(video.category_id);
    if (cat) {
      const access = checkCatAccess(video.category_id, cat.access_mode, user.id, user.discord_roles || [], getUserRankIds(user.id));
      if (!access.canView) return { ok: false, reason: 'no_access' };
      canEdit = access.canEdit;
    }
  }
  // Scheduled (future publish_date) videos are hidden from everyone except admin/dev and an
  // editor of the video's own category — same bypass rule as GET /api/videos' list filter,
  // but enforced here as the actual access gate rather than just a list-hiding condition.
  if (video.publish_date && user.role !== 'admin' && !canEdit && new Date(video.publish_date) > new Date()) {
    return { ok: false, reason: 'not_published' };
  }
  return { ok: true };
}

// Looks up a video by its opaque stream_video_id (what /api/stream/* and /stream/* are
// keyed on) and checks the requesting user's access. Returns { ok, status, error, video }.
// A self-hosted MIRROR's stream lives in mirrorN_url (as "self-hosted:<id>"), not in the
// stream_video_id column (that's the main source only) — check both, or every mirror
// playback request 404s here before it ever reaches the streaming service.
function resolveStreamVideoForUser(streamVideoId, user) {
  const mirrorRef = `self-hosted:${streamVideoId}`;
  const video = db.prepare(`
    SELECT id, category_id, access_mode, publish_date FROM videos
    WHERE stream_video_id = ?
      OR mirror1_url = ? OR mirror2_url = ? OR mirror3_url = ? OR mirror4_url = ? OR mirror5_url = ?
  `).get(streamVideoId, mirrorRef, mirrorRef, mirrorRef, mirrorRef, mirrorRef);
  if (!video) return { ok: false, status: 404, error: 'Video not found' };
  const access = userCanViewVideo(video, user);
  if (!access.ok) return { ok: false, status: 403, error: 'Brak dostępu do tego filmu.' };
  return { ok: true, video };
}

// Passed into watchParty.js so it can resolve a catalog video for its queue without
// trusting any client-supplied metadata (title/thumbnail/mirrors/stream_video_id) or
// letting a party host add a video the ADDING user has no category/rank access to.
// Returns the full video row, or null if it doesn't exist or the user can't view it.
function resolveWatchPartyVideo(videoId, user) {
  const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(videoId);
  if (!video || !userCanViewVideo(video, user).ok) return null;
  return video;
}

module.exports = { getUserRankIds, parseCatModes, checkCatAccess, userCanViewVideo, resolveStreamVideoForUser, resolveWatchPartyVideo };
