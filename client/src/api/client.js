import axios from 'axios';
import {
  getAccessToken,
  setAccessToken,
  clearAccessToken,
  getStoredRefreshToken,
  clearSession,
} from './tokenStore';

// =========================
// 🌐 AXIOS INSTANCE
// withCredentials kept for backward-compat with the httpOnly cookie
// fallback, but the primary flow now sends the refresh token explicitly
// from localStorage (see tokenStore.js SIMPLE MODE note).
// =========================
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:4000/api',
  timeout: 30000,
  withCredentials: true,
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
// SIMPLE MODE: a failed refresh only clears THIS session — the backend
// no longer revokes other sessions on a rotated/stale token, so this
// path is now only hit on a genuinely dead/expired refresh token.
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
          const storedRefreshToken = getStoredRefreshToken();
          refreshPromise = api
            .post('/auth/refresh', { refreshToken: storedRefreshToken })
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
        const refreshStatus = refreshErr.response?.status;
        if (refreshStatus === 401) {
          // Genuinely dead refresh token (expired / explicitly revoked)
          // — this is the only case that should sign the user out.
          clearSession();
          clearClientAuthState();
          window.dispatchEvent(new Event('orbit:logout'));
          if (!window.location.pathname.includes('/login')) {
            window.location.href = '/login';
          }
        } else {
          // Server hiccup (down/restarting/network blip) while trying
          // to refresh — the stored refresh token itself is still
          // fine, we just couldn't reach the server this time. Leave
          // the session alone; the next request retries the refresh
          // instead of forcing a re-login over a transient failure.
          console.error('Refresh check failed (session kept):', refreshErr.message);
        }
        return Promise.reject(refreshErr);
      }
    }

    // Handle network errors — never treat these as a logout signal.
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
