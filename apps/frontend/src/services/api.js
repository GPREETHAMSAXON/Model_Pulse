import axios from 'axios';

// Production API URL — falls back to local proxy in development
const BASE_URL = import.meta.env.VITE_API_URL
  || (import.meta.env.PROD ? 'https://model-pulse.onrender.com/api/v1' : '/api/v1');

const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('mp_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Redirect to login on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('mp_token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ── Auth
export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login:    (data) => api.post('/auth/login', data),
  me:       ()     => api.get('/auth/me'),
};

// ── Models
export const modelsApi = {
  list:          ()          => api.get('/models'),
  get:           (id)        => api.get(`/models/${id}`),
  create:        (data)      => api.post('/models', data),
  update:        (id, data)  => api.patch(`/models/${id}`, data),
  archive:       (id)        => api.delete(`/models/${id}`),
  generateKey:   (id, data)  => api.post(`/models/${id}/keys`, data),
  listKeys:      (id)        => api.get(`/models/${id}/keys`),
  revokeKey:     (id, keyId) => api.delete(`/models/${id}/keys/${keyId}`),
  listSnapshots: (id)        => api.get(`/models/${id}/snapshots`),
};

// ── Predictions
export const predictionsApi = {
  getByModel: (modelId, params) => api.get(`/predictions/${modelId}`, { params }),
};

// ── Alerts
export const alertsApi = {
  list:   (modelId) => api.get(`/alerts/${modelId}`),
  create: (data)    => api.post('/alerts', data),
  ack:    (id)      => api.patch(`/alerts/${id}/acknowledge`),
};

export default api;
