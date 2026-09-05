const API = import.meta.env.VITE_API_URL || '';

export function getToken() { return localStorage.getItem('ag_token'); }
export function setToken(t) { localStorage.setItem('ag_token', t); }
export function clearToken() { localStorage.removeItem('ag_token'); }

export async function api(path, opts = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const authApi = {
  login: (username, password) => api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  me: () => api('/api/auth/me'),
  users: () => api('/api/auth/users'),
  register: (d) => api('/api/auth/register', { method: 'POST', body: JSON.stringify(d) }),
  updateRole: (id, role) => api(`/api/auth/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),
  deleteUser: (id) => api(`/api/auth/users/${id}`, { method: 'DELETE' }),
};

export const devicesApi = {
  list: (q = '') => api(`/api/devices${q ? '?' + q : ''}`),
  get: (id) => api(`/api/devices/${id}`),
  create: (d) => api('/api/devices', { method: 'POST', body: JSON.stringify(d) }),
  update: (id, d) => api(`/api/devices/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  delete: (id) => api(`/api/devices/${id}`, { method: 'DELETE' }),
  qr: (id) => api(`/api/devices/${id}/qr`),
  addTag: (id, tag) => api(`/api/devices/${id}/tags`, { method: 'POST', body: JSON.stringify({ tag }) }),
  removeTag: (id, tag) => api(`/api/devices/${id}/tags/${tag}`, { method: 'DELETE' }),
  setTally: (id, state) => api(`/api/devices/${id}/tally`, { method: 'POST', body: JSON.stringify({ state }) }),
};

export const streamsApi = {
  list: (active) => api(`/api/streams${active ? '?active=1' : ''}`),
  get: (id) => api(`/api/streams/${id}`),
  create: (d) => api('/api/streams', { method: 'POST', body: JSON.stringify(d) }),
  end: (id) => api(`/api/streams/${id}/end`, { method: 'POST' }),
  updateMetrics: (id, d) => api(`/api/streams/${id}/metrics`, { method: 'PUT', body: JSON.stringify(d) }),
};

export const eventsApi = {
  list: (status) => api(`/api/events${status ? '?status=' + status : ''}`),
  get: (id) => api(`/api/events/${id}`),
  create: (d) => api('/api/events', { method: 'POST', body: JSON.stringify(d) }),
  update: (id, d) => api(`/api/events/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  delete: (id) => api(`/api/events/${id}`, { method: 'DELETE' }),
  launch: (id) => api(`/api/events/${id}/launch`, { method: 'POST' }),
  end: (id) => api(`/api/events/${id}/end`, { method: 'POST' }),
  assignCamera: (id, d) => api(`/api/events/${id}/cameras`, { method: 'POST', body: JSON.stringify(d) }),
  removeCamera: (id, did) => api(`/api/events/${id}/cameras/${did}`, { method: 'DELETE' }),
};

export const vmixApi = {
  connections: () => api('/api/vmix/connections'),
  createConn: (d) => api('/api/vmix/connections', { method: 'POST', body: JSON.stringify(d) }),
  updateConn: (id, d) => api(`/api/vmix/connections/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  deleteConn: (id) => api(`/api/vmix/connections/${id}`, { method: 'DELETE' }),
  test: (id) => api(`/api/vmix/${id}/test`, { method: 'POST' }),
  status: (id) => api(`/api/vmix/${id}/status`),
  action: (id, action, params) => api(`/api/vmix/${id}/action`, { method: 'POST', body: JSON.stringify({ action, params }) }),
};

export const atemApi = {
  connections: () => api('/api/atem/connections'),
  createConn: (d) => api('/api/atem/connections', { method: 'POST', body: JSON.stringify(d) }),
  updateConn: (id, d) => api(`/api/atem/connections/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  deleteConn: (id) => api(`/api/atem/connections/${id}`, { method: 'DELETE' }),
  test: (id) => api(`/api/atem/${id}/test`, { method: 'POST' }),
  status: (id) => api(`/api/atem/${id}/status`),
  action: (id, action, params) => api(`/api/atem/${id}/action`, { method: 'POST', body: JSON.stringify({ action, params }) }),
};

export const analyticsApi = {
  realtime: () => api('/api/analytics/realtime'),
  history: (deviceId, limit) => api(`/api/analytics/history?device_id=${deviceId || ''}&limit=${limit || 100}`),
  dashboard: () => api('/api/analytics/dashboard'),
  logs: (type, limit) => api(`/api/analytics/logs?type=${type || ''}&limit=${limit || 50}`),
  settings: (cat) => api(`/api/analytics/settings${cat ? '?category=' + cat : ''}`),
  setSetting: (key, value, category) => api('/api/analytics/settings', { method: 'PUT', body: JSON.stringify({ key, value, category }) }),
  layouts: () => api('/api/analytics/layouts'),
  saveLayout: (d) => api('/api/analytics/layouts', { method: 'POST', body: JSON.stringify(d) }),
};

export const rtmpApi = {
  status: () => api('/api/rtmp/status'),
  streams: () => api('/api/rtmp/streams'),
};
