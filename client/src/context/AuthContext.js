import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

// =========================
// 🔐 AUTH PROVIDER
// Session is determined by the httpOnly cookie, not localStorage.
// On mount, we always call /auth/me — if the cookie is present and valid,
// it succeeds and restores the session. If not, we stay logged out.
// =========================
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Attempt to restore session on app mount by calling /auth/me.
  // The httpOnly cookie is sent automatically by the browser.
  // No localStorage check needed.
  useEffect(() => {
    // Proactively clean up any legacy localStorage tokens to fix hybrid state
    localStorage.removeItem('orbit_token');
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('adminToken');

    api.get('/auth/me')
      .then(r => {
        setUser(r.data);
        setError(null);
      })
      .catch(err => {
        // 401 means no valid session — this is expected when logged out
        // Don't treat 401 as an error, just leave user as null
        if (err.response?.status !== 401) {
          console.error('Auth check failed:', err.message);
          setError(err.message);
        }
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // =========================
  // LOGIN
  // Posts credentials; server sets httpOnly cookie in response.
  // No token is returned to or stored by JS.
  // =========================
  const login = async (email, password) => {
    try {
      const { data } = await api.post('/auth/login', { email, password });
      setUser(data.user);
      setError(null);
      return data.user;
    } catch (err) {
      const message = err.response?.data?.error || 'Login failed';
      setError(message);
      throw err;
    }
  };

  // =========================
  // LOGOUT
  // Calls the server logout endpoint which clears the httpOnly cookie.
  // Then clears client-side user state.
  // =========================
  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      // Even if the server call fails, clear local state
      console.error('Logout request failed:', err.message);
    } finally {
      // Clear any legacy localStorage tokens just to be sure
      localStorage.removeItem('orbit_token');
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('adminToken');
      
      setUser(null);
      setError(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, error, isManager: user?.role === 'manager' }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
