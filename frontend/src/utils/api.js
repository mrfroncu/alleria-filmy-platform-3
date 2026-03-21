const API = '/api';

async function request(url, options = {}) {
  const res = await fetch(API + url, {
    ...options,
    headers: { ...options.headers },
    credentials: 'include',
  });
  if (res.status === 401) {
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    throw new Error('Unauthorized');
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

  // Videos
  getVideos: (params = {}) => {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.tags) q.set('tags', params.tags);
    if (params.author) q.set('author', params.author);
    if (params.sort) q.set('sort', params.sort);
    return request(`/videos?${q}`);
  },
  getVideo: (id) => request(`/videos/${id}`),
  createVideo: (formData) => request('/videos', { method: 'POST', body: formData }),
  updateVideo: (id, formData) => request(`/videos/${id}`, { method: 'PUT', body: formData }),
  deleteVideo: (id) => request(`/videos/${id}`, { method: 'DELETE' }),

  // Tags
  getTags: (search) => request(`/tags${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  deleteTag: (id) => request(`/tags/${id}`, { method: 'DELETE' }),

  // Authors
  getAuthors: () => request('/authors'),

  // Users
  getUsers: () => request('/users'),
  getAllUsers: () => request('/users/all'),

  // Logs
  getWatchLogs: () => request('/logs/watch'),
  getLoginLogs: () => request('/logs/login'),

  // Debug
  exportDB: () => request('/debug/export'),
  importDB: (data) => request('/debug/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
  clearDB: () => request('/debug/clear', { method: 'POST' }),
  createUser: (data) => request('/debug/create-user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
};
