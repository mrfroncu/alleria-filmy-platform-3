const BASE = '/api';

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = { ...(options.headers || {}) };
  const isFormData = options.body instanceof FormData;
  if (!isFormData && options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (method !== 'GET' && method !== 'HEAD') {
    headers['X-Requested-With'] = 'XMLHttpRequest';
  }

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    method,
    headers,
    credentials: 'include',
    body: isFormData || options.body === undefined ? options.body : JSON.stringify(options.body),
  });

  if (res.status === 401) {
    if (!path.startsWith('/auth/me')) {
      window.location.href = `/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    }
    throw new ApiError('Nieautoryzowany', 401, null);
  }

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    throw new ApiError(data?.error || `Błąd żądania (${res.status})`, res.status, data);
  }
  return data;
}

export const api = {
  // auth
  me: () => request('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),
  loginTeamspeak6: () => request('/auth/teamspeak', { method: 'POST' }),
  loginTeamspeak3: () => request('/auth/teamspeak3', { method: 'POST' }),
  verifyTeamspeak6: (challengeId, code) => request('/auth/teamspeak/verify', { method: 'POST', body: { challengeId, code } }),
  verifyTeamspeak3: (challengeId, code) => request('/auth/teamspeak3/verify', { method: 'POST', body: { challengeId, code } }),
  getHealth: () => request('/health'),

  // config / version / health
  getConfig: () => request('/config'),
  getVersion: () => request('/version'),
  getStreamingVersion: () => request('/version/streaming'),

  // videos
  getVideos: (params = {}) => request(`/videos?${new URLSearchParams(params)}`),
  getVideo: (id) => request(`/videos/${id}`),
  toggleFavorite: (videoId, isFav) => request(`/favorites/${videoId}`, { method: isFav ? 'DELETE' : 'POST' }),
  checkFavorite: (videoId) => request(`/favorites/check/${videoId}`),

  // categories / tags / authors
  getCategories: () => request('/categories'),
  getTags: (search = '') => request(`/tags?${new URLSearchParams(search ? { search } : {})}`),
  getTagsForCategory: (slug) => request(`/tags/category/${slug}`),
  getAuthors: () => request('/authors'),
  getAuthor: (id) => request(`/authors/${id}`),
  getAllUsers: () => request('/users/all'),

  // progress (continue watching)
  getProgressList: () => request('/progress'),
  getProgress: (videoId) => request(`/progress/${videoId}`),
  saveProgress: (videoId, position, duration) =>
    request(`/progress/${videoId}`, { method: 'PUT', body: { position, duration } }),
  clearProgress: (videoId) => request(`/progress${videoId ? `/${videoId}` : ''}`, { method: 'DELETE' }),

  // favorites / history / stats
  getFavorites: () => request('/favorites'),
  getHistory: () => request('/history'),
  getStats: () => request('/stats'),

  // profile
  getProfile: () => request('/profile'),
  updateProfile: (body) => request('/profile', { method: 'PUT', body }),
  refreshDiscordAvatar: () => request('/profile/refresh-discord', { method: 'POST' }),

  // comments
  getComments: (videoId) => request(`/videos/${videoId}/comments`),
  addComment: (videoId, content, parentId) => request(`/videos/${videoId}/comments`, { method: 'POST', body: { content, parent_id: parentId } }),
  updateComment: (id, content, silent) => request(`/comments/${id}${silent ? '?silent=true' : ''}`, { method: 'PUT', body: { content, silent } }),
  deleteComment: (id) => request(`/comments/${id}`, { method: 'DELETE' }),
  hardDeleteComment: (id) => request(`/comments/${id}/hard`, { method: 'DELETE' }),
  addAdminComment: (body) => request('/comments/admin', { method: 'POST', body }),

  // video CRUD / bulk (admin)
  createVideo: (formData) => request('/videos', { method: 'POST', body: formData }),
  updateVideo: (id, formData) => request(`/videos/${id}`, { method: 'PUT', body: formData }),
  deleteVideo: (id) => request(`/videos/${id}`, { method: 'DELETE' }),
  bulkVideos: (action, videoIds, value) => request('/videos/bulk', { method: 'POST', body: { action, video_ids: videoIds, value } }),
  getVideoAccess: (id) => request(`/videos/${id}/access`),
  setVideoAccess: (id, body) => request(`/videos/${id}/access`, { method: 'POST', body }),

  // tags (admin)
  deleteTag: (id) => request(`/tags/${id}`, { method: 'DELETE' }),

  // categories (dev)
  createCategory: (body) => request('/categories', { method: 'POST', body }),
  updateCategory: (id, body) => request(`/categories/${id}`, { method: 'PUT', body }),
  deleteCategory: (id) => request(`/categories/${id}`, { method: 'DELETE' }),
  setCategoryAccess: (id, body) => request(`/categories/${id}/access`, { method: 'POST', body }),
  getCategoryUserAccess: (id) => request(`/categories/${id}/user-access`),

  // ranks (dev/admin)
  getRanks: () => request('/ranks'),
  createRank: (body) => request('/ranks', { method: 'POST', body }),
  updateRank: (id, body) => request(`/ranks/${id}`, { method: 'PUT', body }),
  deleteRank: (id) => request(`/ranks/${id}`, { method: 'DELETE' }),
  getUserRanks: (userId) => request(`/users/${userId}/ranks`),
  setUserRanks: (userId, rankIds) => request(`/users/${userId}/ranks`, { method: 'POST', body: { rank_ids: rankIds } }),

  // users (admin)
  getUsers: () => request('/users'),
  deleteUser: (id) => request(`/users/${id}`, { method: 'DELETE' }),
  createUser: (body) => request('/debug/create-user', { method: 'POST', body }),

  // logs (admin/dev)
  getWatchLogs: (page = 1) => request(`/logs/watch?page=${page}`),
  clearWatchLogs: () => request('/logs/watch/clear', { method: 'DELETE' }),
  getLoginLogs: (page = 1) => request(`/logs/login?page=${page}`),
  clearLoginLogs: () => request('/logs/login/clear', { method: 'DELETE' }),
  getAuditLogs: (params = {}) => request(`/audit-logs?${new URLSearchParams(params)}`),
  clearAuditLogs: () => request('/audit-logs/clear', { method: 'DELETE' }),
  getWatchPartyLogs: (params = {}) => request(`/logs/watch-party?${new URLSearchParams(params)}`),
  clearWatchPartyLogs: (code) => request(`/logs/watch-party/clear${code ? `?code=${code}` : ''}`, { method: 'DELETE' }),

  // watch party admin
  getActiveParties: () => request('/admin/watch-parties'),
  forceEndParty: (code) => request(`/admin/watch-parties/${code}`, { method: 'DELETE' }),

  // watch party (member)
  getWatchPartyToken: () => request('/watch-party/token'),
  createWatchParty: () => request('/watch-party', { method: 'POST' }),
  getWatchParty: (code) => request(`/watch-party/${code}`),
  endWatchParty: (code) => request(`/watch-party/${code}`, { method: 'DELETE' }),

  // chunked upload
  initUpload: (body) => request('/stream/upload/init', { method: 'POST', body }),
  uploadChunk: (formData) => request('/stream/upload/chunk', { method: 'POST', body: formData }),
  completeUpload: (body) => request('/stream/upload/complete', { method: 'POST', body }),
  getUploadStatus: (videoId) => request(`/stream/status/${videoId}`),

  // streaming (admin/dev)
  getStreamStats: () => request('/stream/stats'),
  getStreamFiles: () => request('/stream/files'),
  getTranscodingJobs: () => request('/stream/transcoding'),
  getStreamCleanupCandidates: () => request('/stream/cleanup'),
  runStreamCleanup: (body) => request('/stream/cleanup', { method: 'POST', body }),
  deleteStreamVideo: (videoId) => request(`/stream/video/${videoId}`, { method: 'DELETE' }),
  checkStreamStatus: (dbVideoId) => request(`/stream/check/${dbVideoId}`),

  // settings / debug (dev)
  getAccessDebug: (type, id) => request(`/debug/access/${type}/${id}`),
  getCategoryRoleOverview: () => request('/debug/category-role-overview'),
  getEnvCheck: () => request('/debug/env-check'),
  getSettings: () => request('/debug/settings'),
  setSettings: (body) => request('/debug/settings', { method: 'POST', body }),
  getDbStats: () => request('/debug/db-stats'),
  exportDb: () => `${BASE}/debug/export`,
  importDb: (formData) => request('/debug/import', { method: 'POST', body: formData }),
  clearDb: () => request('/debug/clear', { method: 'POST' }),
  runSql: (query) => request('/debug/sql', { method: 'POST', body: { query } }),
};

export { ApiError };
