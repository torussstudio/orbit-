import axios from 'axios';

// =========================
// 🌐 AXIOS INSTANCE
// withCredentials: true ensures the httpOnly auth cookie is
// automatically sent with every request. No token handling in JS.
// =========================
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:4000/api',
  timeout: 30000,
  withCredentials: true, // Send cookies (httpOnly orbit_token) on every request
});

// =========================
// 📡 RESPONSE INTERCEPTOR
// Handles global error cases. 401 → redirect to login.
// No localStorage interaction needed — cookies are managed by the browser.
// =========================
api.interceptors.response.use(
  r => r,
  err => {
    // Handle 401 Unauthorized — cookie is invalid/expired, force re-login
    if (err.response?.status === 401) {
      // Only redirect if not already on /login to avoid redirect loops
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
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
