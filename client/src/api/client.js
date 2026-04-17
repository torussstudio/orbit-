import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:4000/api',
  timeout: 30000
});

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('orbit_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  r => r,
  err => {
    // Handle 401 Unauthorized
    if (err.response?.status === 401) {
      localStorage.removeItem('orbit_token');
      window.location.href = '/login';
      return Promise.reject(err);
    }

    // Handle network errors
    if (!err.response) {
      console.error('Network Error:', err.message);
      err.message = 'Network error. Please check your connection.';
      return Promise.reject(err);
    }

    // Handle timeout
    if (err.code === 'ECONNABORTED') {
      err.message = 'Request timeout. Please try again.';
      return Promise.reject(err);
    }

    // Pass through other errors
    return Promise.reject(err);
  }
);

export default api;
