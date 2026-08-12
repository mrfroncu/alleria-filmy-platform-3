const API = '/api';

async function request(url, options = {}) {
  const res = await fetch(API + url, {
    ...options,
    // X-Requested-With marks the request as same-origin XHR — required by the
    // backend CSRF guard on all state-changing requests.
    headers: { 'X-Requested-With': 'XMLHttpRequest', ...options.headers },
    credentials: 'include',
  });
  if (res.status === 401) {
    const data = await res.json().catch(() => ({}));
    if (!window.location.pathname.startsWith('/login')) {
      // Preserve where the user was headed — this fires as a hard navigation before
      // ProtectedRoute's own returnTo redirect ever gets a chance to run, so without this
      // the destination is lost and login always drops back to "/".
      const returnTo = window.location.pathname + window.location.search;
      window.location.href = `/login?returnTo=${encodeURIComponent(returnTo)}`;
    }
    throw new Error(data.error || 'Unauthorized');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Auth
  getMe: () => request('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),

  // Regulamin (ToS)
  getTos: () => request('/tos'),
  acceptTos: () => request('/tos/accept', { method: 'POST' }),
  updateTos: (content) => request('/debug/tos', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }),
  }),

  // opts: { linkMode: true } — attach the matched TS identity to the logged-in account
  // instead of logging in as a (possibly different) TS-origin account.
  loginTeamspeak: (opts) => request('/auth/teamspeak', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(opts || {}),
  }),
  loginTeamspeak3: (opts) => request('/auth/teamspeak3', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(opts || {}),
  }),
  verifyTeamspeak: (challengeId, code) => request('/auth/teamspeak/verify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challengeId, code }),
  }),
  verifyTeamspeak3: (challengeId, code) => request('/auth/teamspeak3/verify', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challengeId, code }),
  }),

  // Videos
  getVideos: (params = {}) => {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.tags) q.set('tags', params.tags);
    if (params.author) q.set('author', params.author);
    if (params.sort) q.set('sort', params.sort);
    if (params.include_transcoding) q.set('include_transcoding', '1');
    if (params.category) q.set('category', params.category);
    if (params.limit) q.set('limit', params.limit);
    return request(`/videos?${q}`);
  },
  getVideo: (id) => request(`/videos/${id}`),
  logVideoView: (id) => request(`/videos/${id}/log-view`, { method: 'POST' }),
  createVideo: (formData) => request('/videos', { method: 'POST', body: formData }),
  updateVideo: (id, formData) => request(`/videos/${id}`, { method: 'PUT', body: formData }),
  deleteVideo: (id) => request(`/videos/${id}`, { method: 'DELETE' }),

  // Tags
  getTags: (search) => request(`/tags${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  getCategoryTags: (slug) => request(`/tags/category/${slug}`),
  deleteTag: (id) => request(`/tags/${id}`, { method: 'DELETE' }),

  // Categories
  getCategories: () => request('/categories'),
  createCategory: (data) => request('/categories', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }),
  updateCategory: (id, data) => request(`/categories/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }),
  deleteCategory: (id) => request(`/categories/${id}`, { method: 'DELETE' }),
  setCategoryAccess: (id, data) => request(`/categories/${id}/access`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }),
  getCategoryUserAccess: (id) => request(`/categories/${id}/user-access`),

  // Video access
  getVideoAccess: (id) => request(`/videos/${id}/access`),
  setVideoAccess: (id, data) => request(`/videos/${id}/access`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }),

  // Bulk actions
  bulkVideos: (data) => request('/videos/bulk', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }),

  // Authors
  getAuthors: () => request('/authors'),
  getAuthor: (id) => request(`/authors/${id}`),

  // Users
  getUsers: () => request('/users'),
  getAllUsers: () => request('/users/all'),
  deleteUser: (id) => request(`/users/${id}`, { method: 'DELETE' }),
  getUserRanks: (id) => request(`/users/${id}/ranks`),
  setUserRanks: (id, rank_ids) => request(`/users/${id}/ranks`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rank_ids }),
  }),

  // App ranks
  getRanks: () => request('/ranks'),
  createRank: (data) => request('/ranks', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }),
  updateRank: (id, data) => request(`/ranks/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }),
  deleteRank: (id) => request(`/ranks/${id}`, { method: 'DELETE' }),

  // Logs (paginated)
  getWatchLogs: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/logs/watch${q ? `?${q}` : ''}`);
  },
  getWatchLogVideos: () => request('/logs/watch/videos'),
  getLoginLogs: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/logs/login${q ? `?${q}` : ''}`);
  },
  clearWatchLogs: () => request('/logs/watch/clear', { method: 'DELETE' }),
  clearLoginLogs: () => request('/logs/login/clear', { method: 'DELETE' }),

  // Config
  getConfig: () => request('/config'),

  // Streaming (chunked upload)
  streamUploadInit: (data) => request('/stream/upload/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  streamUploadChunk: (formData) => fetch('/api/stream/upload/chunk', {
    method: 'POST',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
    body: formData,
    credentials: 'include',
  }).then(r => r.json()),
  streamUploadComplete: (upload_id) => request('/stream/upload/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ upload_id }),
  }),
  uploadStream: (formData) => request('/stream/upload', { method: 'POST', body: formData }),
  streamFiles: () => request('/stream/files'),
  streamTranscoding: () => request('/stream/transcoding'),
  debugAccess: (type, id) => request(`/debug/access/${type}/${id}`),
  streamStatus: (videoId) => request(`/stream/status/${videoId}`),
  streamCheck: (dbVideoId) => request(`/stream/check/${dbVideoId}`),
  streamCleanupList: () => request('/stream/cleanup'),
  streamCleanupPurge: (data) => request('/stream/cleanup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }),
  streamToken: (videoId) => request(`/stream/token/${videoId}`),
  streamCastToken: (videoId) => request(`/stream/cast-token/${videoId}`),
  deleteStream: (videoId) => request(`/stream/video/${videoId}`, { method: 'DELETE' }),

  // Favorites
  getFavorites: () => request('/favorites'),
  addFavorite: (videoId) => request(`/favorites/${videoId}`, { method: 'POST' }),
  removeFavorite: (videoId) => request(`/favorites/${videoId}`, { method: 'DELETE' }),
  checkFavorite: (videoId) => request(`/favorites/check/${videoId}`),

  // History
  getHistory: () => request('/history'),

  // Stats
  getStats: () => request('/stats'),

  // Profile
  getProfile: () => request('/profile'),
  updateProfile: (data) => request('/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  refreshDiscordAvatar: () => request('/profile/refresh-discord', { method: 'POST' }),

  // Active sessions / devices
  getSessions: () => request('/profile/sessions'),
  revokeSession: (sid) => request(`/profile/sessions/${encodeURIComponent(sid)}`, { method: 'DELETE' }),

  // Browser push notifications
  getVapidPublicKey: () => request('/push/vapid-public-key'),
  subscribePush: (subscription) => request('/push/subscribe', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription }),
  }),
  unsubscribePush: (endpoint) => request('/push/unsubscribe', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint }),
  }),

  // Account linking / merge
  getPendingMerge: (mergeId) => request(`/profile/merge/${mergeId}`),
  confirmMerge: (mergeId) => request(`/profile/merge/${mergeId}/confirm`, { method: 'POST' }),
  cancelMerge: (mergeId) => request(`/profile/merge/${mergeId}`, { method: 'DELETE' }),
  unlinkAccount: (method) => request('/profile/unlink', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method }),
  }),

  // GDPR / RODO
  gdprRequestExport: () => request('/profile/gdpr/export', { method: 'POST' }),
  gdprRequestDeletion: () => request('/profile/gdpr/deletion', { method: 'POST' }),
  getGdprRequests: () => request('/profile/gdpr/requests'),
  cancelGdprRequest: (id) => request(`/profile/gdpr/requests/${id}`, { method: 'DELETE' }),
  downloadGdprExport: (id) => request(`/profile/gdpr/export/${id}/download`),
  adminGetGdprRequests: () => request('/debug/gdpr/requests'),
  adminGetGdprPendingCount: () => request('/debug/gdpr/pending-count'),
  adminDownloadGdprFile: (id) => request(`/debug/gdpr/requests/${id}/file`),
  adminReplaceGdprFile: (id, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return request(`/debug/gdpr/requests/${id}/replace`, { method: 'POST', body: formData });
  },
  adminApproveGdpr: (id) => request(`/debug/gdpr/requests/${id}/approve`, { method: 'POST' }),
  adminRejectGdpr: (id, reason) => request(`/debug/gdpr/requests/${id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  }),

  // Watch Party management (admin)
  getActiveWatchParties: () => request('/admin/watch-parties'),
  forceDeleteWatchParty: (code) => request(`/admin/watch-parties/${code}`, { method: 'DELETE' }),

  // Debug
  exportDB: () => request('/debug/export'),
  importDB: (data) => request('/debug/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  clearDB: () => request('/debug/clear', { method: 'POST' }),
  dbStats: () => request('/debug/db-stats'),
  getSettings: () => request('/debug/settings'),
  setSettings: (data) => request('/debug/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  sendTestEmail: (to) => request('/debug/settings/test-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to }),
  }),
  // Not routed through request() — this returns an HTML document (rendered in a new tab), not JSON.
  emailTemplatePreviewUrl: (type, template) => `${API}/debug/settings/email-preview/${type}?template=${encodeURIComponent(template)}`,
  envCheck: () => request('/debug/env-check'),
  categoryRoleOverview: () => request('/debug/category-role-overview'),
  execSQL: (query) => request('/debug/sql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  }),
  createUser: (data) => request('/debug/create-user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  impersonateUser: (userId) => request(`/debug/impersonate/${userId}`, { method: 'POST' }),
  stopImpersonating: () => request('/debug/stop-impersonating', { method: 'POST' }),

  // In-app notifications
  getNotificationsToken: () => request('/notifications/token'),
  getNotifications: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/notifications${q ? `?${q}` : ''}`);
  },
  markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () => request('/notifications/read-all', { method: 'POST' }),

  // Watch Party
  getWatchPartyToken: () => request('/watch-party/token'),
  createWatchParty: () => request('/watch-party', { method: 'POST' }),
  getWatchParty: (code) => request(`/watch-party/${code}`),
  deleteWatchParty: (code) => request(`/watch-party/${code}`, { method: 'DELETE' }),
  getWatchPartyLogs: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/logs/watch-party${q ? `?${q}` : ''}`);
  },
  clearWatchPartyLogs: (code) => request(`/logs/watch-party/clear${code ? `?code=${code}` : ''}`, { method: 'DELETE' }),

  // Watch Progress
  saveProgress: (videoId, position, duration) => request(`/progress/${videoId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ position, duration }),
  }),
  getProgress: (videoId) => request(`/progress/${videoId}`),
  getAllProgress: () => request('/progress'),
  resetProgress: () => request('/progress', { method: 'DELETE' }),
  clearProgress: (videoId) => request(`/progress/${videoId}`, { method: 'DELETE' }),

  // Watched marks — separate from progress (see video_watched table)
  markWatched: (videoId) => request(`/videos/${videoId}/watched`, { method: 'POST' }),
  unmarkWatched: (videoId) => request(`/videos/${videoId}/watched`, { method: 'DELETE' }),
  getAllWatched: () => request('/watched'),
  resetWatched: () => request('/watched', { method: 'DELETE' }),

  // Video analytics
  getVideoAnalytics: (videoId, { context, userId } = {}) => {
    const q = new URLSearchParams();
    if (context && context !== 'all') q.set('context', context);
    if (userId) q.set('user_id', userId);
    const qs = q.toString();
    return request(`/videos/${videoId}/analytics${qs ? `?${qs}` : ''}`);
  },
  resetVideoAnalytics: (videoId, { before, after, userId } = {}) => request(`/videos/${videoId}/analytics`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ before, after, user_id: userId }),
  }),

  // Comments
  getComments: (videoId) => request(`/videos/${videoId}/comments`),
  addComment: (videoId, content, parentId) => request(`/videos/${videoId}/comments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, parent_id: parentId || null }),
  }),
  editComment: (commentId, content, silent) => request(`/comments/${commentId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, silent: !!silent }),
  }),
  deleteComment: (commentId) => request(`/comments/${commentId}`, { method: 'DELETE' }),
  hardDeleteComment: (commentId) => request(`/comments/${commentId}/hard`, { method: 'DELETE' }),
  reactToComment: (commentId, emoji) => request(`/comments/${commentId}/react`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emoji }),
  }),
  reportComment: (commentId, reason, description) => request(`/comments/${commentId}/report`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason, description }),
  }),

  // Comment moderation queue (admin)
  getCommentReports: (status) => request(`/admin/comment-reports${status ? `?status=${status}` : ''}`),
  getCommentReportsPendingCount: () => request('/admin/comment-reports/pending-count'),
  resolveCommentReport: (id, action) => request(`/admin/comment-reports/${id}/resolve`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
  }),
  getAuditLogs: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/audit-logs${q ? `?${q}` : ''}`);
  },
  clearAuditLogs: () => request('/audit-logs/clear', { method: 'DELETE' }),
  addAdminComment: (data) => request('/comments/admin', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }),
};
