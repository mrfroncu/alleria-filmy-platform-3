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
      window.location.href = '/login';
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
  loginTeamspeak: () => request('/auth/teamspeak', { method: 'POST' }),
  loginTeamspeak3: () => request('/auth/teamspeak3', { method: 'POST' }),
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
  getWatchLogs: (page = 1) => request(`/logs/watch?page=${page}`),
  getLoginLogs: (page = 1) => request(`/logs/login?page=${page}`),
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
  envCheck: () => request('/debug/env-check'),
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
  getAuditLogs: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return request(`/audit-logs${q ? `?${q}` : ''}`);
  },
  clearAuditLogs: () => request('/audit-logs/clear', { method: 'DELETE' }),
  addAdminComment: (data) => request('/comments/admin', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  }),
};
