import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('orbit_token');
    if (token) {
      api.get('/auth/me')
        .then(r => setUser(r.data))
        .catch(err => {
          console.error('Auth check failed:', err.message);
          localStorage.removeItem('orbit_token');
          setError(err.message);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    try {
      const { data } = await api.post('/auth/login', { email, password });
      localStorage.setItem('orbit_token', data.token);
      setUser(data.user);
      setError(null);
      return data.user;
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
      throw err;
    }
  };

  const logout = () => {
    localStorage.removeItem('orbit_token');
    setUser(null);
    setError(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, error, isManager: user?.role === 'manager' }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
