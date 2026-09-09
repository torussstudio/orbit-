import { createContext, useContext, useState, useEffect } from "react";
import api, { clearClientAuthState, setLogoutInProgress } from "../api/client";
import {
  setAccessToken,
  saveSession,
  loadSession,
  clearSession,
} from "../api/tokenStore";

const AuthContext = createContext(null);

/* ══════════════════════════════════════════════════════════════════
   ⚠️ SECURITY TODO — SIMPLE MODE (small-scale use only, fix later)
   Session restore now mirrors the Pulse Pariraksha admin panel:
     1. On mount, read {user, refreshToken} straight from localStorage
        and show the app immediately — no waiting on a network call,
        no login-screen flash.
     2. In the background, silently call /auth/refresh with the stored
        refresh token to get a fresh access token. If that succeeds,
        nothing visible happens. If it genuinely fails (refresh token
        expired/invalid), THEN we sign the user out.
   This is intentionally simple/insecure (token sits in localStorage,
   readable by page JS) — accepted for now per explicit request to
   prioritize "never randomly logs out" over hardening. Revisit later.
   ══════════════════════════════════════════════════════════════════ */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [accessToken, setAccessTokenState] = useState(null);

  const updateUser = (updatedData) => {
    setUser((prev) => (prev ? { ...prev, ...updatedData } : updatedData));
  };

  const clearClientSideAuth = () => {
    // One-time cleanup of legacy/other-app storage keys, kept from the
    // previous implementation.
    localStorage.removeItem("orbit_token");
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("adminToken");
    sessionStorage.removeItem("orbit_token");
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("refreshToken");
    sessionStorage.removeItem("adminToken");

    clearSession();
    clearClientAuthState();
    setAccessTokenState(null);
    setUser(null);
    setError(null);
  };

  useEffect(() => {
    const onLogout = () => {
      clearClientSideAuth();
    };
    window.addEventListener("orbit:logout", onLogout);

    // 1. Instant restore from localStorage — like Pulse admin reading
    //    its Supabase-persisted session before any network call.
    const stored = loadSession();
    if (stored?.user && stored?.refreshToken) {
      setUser(stored.user);
      setLoading(false); // show the app right away, no login-screen flash
    }

    // 2. Silent background verification / access-token refresh.
    api
      .post("/auth/refresh", { refreshToken: stored?.refreshToken })
      .then((r) => {
        const token = r.data?.accessToken;
        const refreshToken = r.data?.refreshToken || stored?.refreshToken;
        const u = r.data?.user;
        if (token) {
          setAccessToken(token);
          setAccessTokenState(token);
        }
        if (u) {
          setUser(u);
          saveSession({ accessToken: token, refreshToken, user: u });
        }
        setError(null);
      })
      .catch((err) => {
        // Only a genuinely dead/invalid refresh token (401) should sign
        // the user out. Anything else — server down/restarting,
        // network blip, timeout — leaves the stored session alone; the
        // user stays logged in on cached data and the next request
        // (via the client.js interceptor) will retry the refresh.
        if (err.response?.status === 401) {
          clearClientSideAuth();
        } else {
          console.error("Auth restore check failed (session kept):", err.message);
          setError(err.message);
        }
      })
      .finally(() => setLoading(false));

    return () => window.removeEventListener("orbit:logout", onLogout);
  }, []);

  // =========================
  // LOGIN
  // Server returns accessToken + refreshToken; both get persisted to
  // localStorage so the session survives closing the browser entirely.
  // =========================
  const login = async (email, password) => {
    try {
      const { data } = await api.post("/auth/login", { email, password });
      setUser(data.user);
      if (data.accessToken) {
        setAccessToken(data.accessToken);
        setAccessTokenState(data.accessToken);
      }
      if (data.refreshToken) {
        saveSession({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          user: data.user,
        });
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
  // The ONLY thing that should ever end a session now. Calls the server
  // to revoke the refresh token, then clears localStorage.
  // =========================
  const logout = async () => {
    setLogoutInProgress(true);
    const stored = loadSession();
    try {
      await api.post("/auth/logout", { refreshToken: stored?.refreshToken });
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
