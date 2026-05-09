import axios from 'axios';
import { getAccessToken, setAccessToken, clearAccessToken } from './tokenStore';

// =========================
// 🌐 AXIOS INSTANCE
// withCredentials: true ensures the httpOnly auth cookie is
// automatically sent with every request. No token handling in JS.
// =========================
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:4000/api',
  timeout: 30000,
  withCredentials: true, // Send refresh cookie on refresh calls
});

// =========================
// 🧾 REQUEST INTERCEPTOR
// Adds Authorization header from in-memory token store.
// =========================
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// =========================
// 📡 RESPONSE INTERCEPTOR
// Handles token expiry with one refresh attempt (no infinite loops).
// =========================
let refreshPromise = null;
let isLoggingOut = false;

export function setLogoutInProgress(value) {
  isLoggingOut = Boolean(value);
}

export function clearClientAuthState() {
  clearAccessToken();
  delete api.defaults.headers.common.Authorization;
}

api.interceptors.response.use(
  r => r,
  async err => {
    const status = err.response?.status;
    const originalRequest = err.config;

    if (
      !isLoggingOut &&
      status === 401 &&
      originalRequest &&
      !originalRequest._orbitRetry &&
      !String(originalRequest.url || '').includes('/auth/refresh') &&
      !String(originalRequest.url || '').includes('/auth/logout') &&
      !String(originalRequest.url || '').includes('/auth/login')
    ) {
      originalRequest._orbitRetry = true;

      try {
        if (!refreshPromise) {
          refreshPromise = api
            .post('/auth/refresh')
            .then((res) => {
              const token = res.data?.accessToken;
              if (!token) {
                throw new Error('Missing accessToken from refresh response');
              }
              setAccessToken(token);
              window.dispatchEvent(new Event('orbit:auth-updated'));
              return token;
            })
            .finally(() => {
              refreshPromise = null;
            });
        }

        const newToken = await refreshPromise;
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api.request(originalRequest);
      } catch (refreshErr) {
        clearClientAuthState();
        window.dispatchEvent(new Event('orbit:logout'));
        if (!window.location.pathname.includes('/login')) {
          window.location.href = '/login';
        }
        return Promise.reject(refreshErr);
      }
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
