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

// Check if user has view access to a category. Returns { canView, canEdit } plus *why*:
// viewVia/editVia = 'public' | 'role' | 'rank' | 'custom' | null and the user's Discord roles /
// app rank IDs that actually matched each rule — normal callers ignore those, the Dev Tools
// access checker shows them.
function checkCatAccess(catId, accessMode, userId, userRoles, userRankIds) {
  const { vm, em } = parseCatModes(accessMode);

  let canView = false;
  let viewVia = null;
  const viewMatch = { roles: [], ranks: [] };
  if (vm === 'public') {
    canView = true;
    viewVia = 'public';
  } else if (vm === 'roles') {
    const vRoles = db.prepare("SELECT discord_role_id FROM category_access WHERE category_id = ? AND access_type = 'viewer'").all(catId).map(r => r.discord_role_id);
    const vRanks = db.prepare("SELECT rank_id FROM category_rank_access WHERE category_id = ? AND access_type = 'viewer'").all(catId).map(r => r.rank_id);
    viewMatch.roles = userRoles.filter(r => vRoles.includes(r));
    viewMatch.ranks = userRankIds.filter(r => vRanks.includes(r));
    canView = viewMatch.roles.length > 0 || viewMatch.ranks.length > 0;
    if (canView) viewVia = viewMatch.roles.length > 0 ? 'role' : 'rank';
  } else if (vm === 'custom') {
    canView = !!db.prepare("SELECT 1 FROM category_user_access WHERE category_id = ? AND user_id = ? AND access_type = 'viewer'").get(catId, userId);
    if (canView) viewVia = 'custom';
  }

  let canEdit = false;
  let editVia = null;
  const editMatch = { roles: [], ranks: [] };
  if (em === 'roles') {
    const eRoles = db.prepare("SELECT discord_role_id FROM category_access WHERE category_id = ? AND access_type = 'editor'").all(catId).map(r => r.discord_role_id);
    const eRanks = db.prepare("SELECT rank_id FROM category_rank_access WHERE category_id = ? AND access_type = 'editor'").all(catId).map(r => r.rank_id);
    editMatch.roles = userRoles.filter(r => eRoles.includes(r));
    editMatch.ranks = userRankIds.filter(r => eRanks.includes(r));
    canEdit = editMatch.roles.length > 0 || editMatch.ranks.length > 0;
    if (canEdit) editVia = editMatch.roles.length > 0 ? 'role' : 'rank';
  } else if (em === 'custom') {
    canEdit = !!db.prepare("SELECT 1 FROM category_user_access WHERE category_id = ? AND user_id = ? AND access_type = 'editor'").get(catId, userId);
    if (canEdit) editVia = 'custom';
  }

  // Editors can always view
  if (canEdit) canView = true;
  return { canView, canEdit, viewerMode: vm, editorMode: em, viewVia, editVia, viewMatch, editMatch };
}

// THE video access gate, with a step-by-step trace. Used by every route that lets a user reach
// a video's metadata or actual stream bytes (via userCanViewVideo below — GET /api/videos/:id,
// stream token/keys/media, progress, favorites, comments, watch-party queue) so none of them can
// bypass the per-category rank/role restrictions or see a scheduled/hidden video early, and by
// the Dev Tools access checker, so what it reports is exactly what a real request would get.
//
// Steps run in order and stop at the first failure (later steps come back as 'skip'):
//   role        — dev bypasses everything
//   custom_list — only for access_mode = 'custom' videos: user must be on video_access
//   category    — category viewer/editor rules (no category = open)
//   visibility  — hidden (is_hidden) / scheduled (future publish_date): only admin and an editor
//                 of the video's own category get through. Callers must SELECT is_hidden and
//                 publish_date for this step to apply.
// Each step: { step, status: 'pass' | 'fail' | 'bypass' | 'skip', code, data? }.
// `reason` keeps the codes callers already switch on: 'no_access' | 'hidden' | 'not_published'.
function explainVideoAccess(video, user) {
  if (!video) return { ok: false, reason: 'not_found', canEdit: false, steps: [] };
  const steps = [];
  const skipRest = (names) => names.forEach(step => steps.push({ step, status: 'skip', code: 'not_reached' }));

  if (user.role === 'dev') {
    steps.push({ step: 'role', status: 'bypass', code: 'dev', data: { role: user.role } });
    skipRest(['custom_list', 'category', 'visibility']);
    return { ok: true, canEdit: true, steps };
  }
  steps.push({ step: 'role', status: 'pass', code: 'role', data: { role: user.role } });

  if (video.access_mode === 'custom') {
    const onList = !!db.prepare('SELECT 1 FROM video_access WHERE video_id = ? AND user_id = ?').get(video.id, user.id);
    if (!onList) {
      steps.push({ step: 'custom_list', status: 'fail', code: 'not_in_custom_list' });
      skipRest(['category', 'visibility']);
      return { ok: false, reason: 'no_access', canEdit: false, steps };
    }
    steps.push({ step: 'custom_list', status: 'pass', code: 'in_custom_list' });
  } else {
    steps.push({ step: 'custom_list', status: 'skip', code: 'not_custom' });
  }

  let canEdit = false;
  const cat = video.category_id ? db.prepare('SELECT name, access_mode FROM categories WHERE id = ?').get(video.category_id) : null;
  if (!video.category_id) {
    steps.push({ step: 'category', status: 'skip', code: 'no_category' });
  } else if (!cat) {
    steps.push({ step: 'category', status: 'skip', code: 'category_missing', data: { category_id: video.category_id } });
  } else {
    const a = checkCatAccess(video.category_id, cat.access_mode, user.id, user.discord_roles || [], getUserRankIds(user.id));
    const data = {
      category_name: cat.name, viewer_mode: a.viewerMode, editor_mode: a.editorMode,
      view_via: a.viewVia, edit_via: a.editVia, view_match: a.viewMatch, edit_match: a.editMatch, can_edit: a.canEdit,
    };
    if (!a.canView) {
      steps.push({ step: 'category', status: 'fail', code: 'no_category_access', data });
      skipRest(['visibility']);
      return { ok: false, reason: 'no_access', canEdit: false, steps };
    }
    canEdit = a.canEdit;
    steps.push({ step: 'category', status: 'pass', code: a.canEdit ? 'category_editor' : 'category_viewer', data });
  }

  const state = video.is_hidden ? 'hidden'
    : (video.publish_date && new Date(video.publish_date) > new Date()) ? 'scheduled' : 'published';
  const visData = { state, publish_date: video.publish_date || null };
  if (state === 'published') {
    steps.push({ step: 'visibility', status: 'pass', code: 'published', data: visData });
  } else if (user.role === 'admin') {
    steps.push({ step: 'visibility', status: 'bypass', code: 'admin', data: visData });
  } else if (canEdit) {
    steps.push({ step: 'visibility', status: 'bypass', code: 'category_editor', data: visData });
  } else {
    steps.push({ step: 'visibility', status: 'fail', code: state, data: visData });
    return { ok: false, reason: state === 'hidden' ? 'hidden' : 'not_published', canEdit, steps };
  }
  return { ok: true, canEdit, steps };
}

// Returns { ok, reason? } — `reason` lets a caller that wants a friendlier response (e.g. a
// "not published yet" panel instead of a blanket access-denied page) distinguish that case
// from "no access at all". See explainVideoAccess for the rules.
function userCanViewVideo(video, user) {
  const { ok, reason } = explainVideoAccess(video, user);
  return ok ? { ok } : { ok, reason };
}

// Looks up a video by its opaque stream_video_id (what /api/stream/* and /stream/* are
// keyed on) and checks the requesting user's access. Returns { ok, status, error, video }.
// A self-hosted MIRROR's stream lives in mirrorN_url (as "self-hosted:<id>"), not in the
// stream_video_id column (that's the main source only) — check both, or every mirror
// playback request 404s here before it ever reaches the streaming service.
function resolveStreamVideoForUser(streamVideoId, user) {
  const mirrorRef = `self-hosted:${streamVideoId}`;
  const video = db.prepare(`
    SELECT id, category_id, access_mode, publish_date, is_hidden FROM videos
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

module.exports = { getUserRankIds, parseCatModes, checkCatAccess, explainVideoAccess, userCanViewVideo, resolveStreamVideoForUser, resolveWatchPartyVideo };
