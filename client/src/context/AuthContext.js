import { createContext, useContext, useState, useEffect } from "react";
import api, { clearClientAuthState, setLogoutInProgress } from "../api/client";
import { setAccessToken } from "../api/tokenStore";

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
  const [accessToken, setAccessTokenState] = useState(null);

  const updateUser = (updatedData) => {
    setUser((prev) => (prev ? { ...prev, ...updatedData } : updatedData));
  };

  const clearClientSideAuth = () => {
    localStorage.removeItem("orbit_token");
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("adminToken");
    sessionStorage.removeItem("orbit_token");
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("refreshToken");
    sessionStorage.removeItem("adminToken");

    clearClientAuthState();
    setAccessTokenState(null);
    setUser(null);
    setError(null);
  };

  useEffect(() => {
    // Proactively clean up any legacy browser token storage.
    localStorage.removeItem("orbit_token");
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("adminToken");
    sessionStorage.removeItem("orbit_token");
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("refreshToken");
    sessionStorage.removeItem("adminToken");

    const onLogout = () => {
      clearClientSideAuth();
    };
    window.addEventListener("orbit:logout", onLogout);

    api
      .post("/auth/refresh")
      .then((r) => {
        const token = r.data?.accessToken;
        const u = r.data?.user;
        if (token) {
          setAccessToken(token);
          setAccessTokenState(token);
        }
        if (u) {
          setUser(u);
        }
        setError(null);
      })
      .catch((err) => {
        if (err.response?.status !== 401) {
          console.error("Auth restore failed:", err.message);
          setError(err.message);
        }
        clearClientSideAuth();
      })
      .finally(() => setLoading(false));

    return () => window.removeEventListener("orbit:logout", onLogout);
  }, []);

  // =========================
  // LOGIN
  // Posts credentials; server sets httpOnly cookie in response.
  // No token is returned to or stored by JS.
  // =========================
  const login = async (email, password) => {
    try {
      const { data } = await api.post("/auth/login", { email, password });
      setUser(data.user);
      if (data.accessToken) {
        setAccessToken(data.accessToken);
        setAccessTokenState(data.accessToken);
      }
      setError(null);
      return data.user;
    } catch (err) {
      const message = err.response?.data?.error || "Login failed";
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
    setLogoutInProgress(true);
    try {
      await api.post("/auth/logout");
    } catch (err) {
      console.error("Logout request failed:", err.message);
    } finally {
      clearClientSideAuth();
      setLogoutInProgress(false);
      window.dispatchEvent(new Event("orbit:logout"));
    }
  };

  return (
    <AuthContext.Provider value={{ user, updateUser, accessToken, login, logout, loading, error, isManager: user?.role === 'manager' }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
