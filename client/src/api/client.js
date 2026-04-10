import axios from 'axios';

const api = axios.create({ baseURL: process.env.REACT_APP_API_URL || 'http://localhost:4000/api' });

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('orbit_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(r => r, err => {
  if (err.response?.status === 401) {
    localStorage.removeItem('orbit_token');
    window.location.href = '/login';
  }
  return Promise.reject(err);
});

export default api;
