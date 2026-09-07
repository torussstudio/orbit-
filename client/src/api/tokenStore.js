/* ══════════════════════════════════════════════════════════════════
   ⚠️ SECURITY TODO — SIMPLE MODE (small-scale use only, fix later)
   Session (accessToken + refreshToken + user) now lives in
   localStorage, mirroring how the Pulse Pariraksha admin panel keeps
   Supabase's session persisted. This makes login "permanent" (like
   WhatsApp/Telegram Web) — restored instantly on page load, only
   cleared by an explicit logout.
   Trade-off accepted for now: a token in localStorage is readable by
   any JS on the page (XSS risk), unlike an httpOnly cookie. Revisit
   when it's time to harden this properly.
   ══════════════════════════════════════════════════════════════════ */

const SESSION_KEY = "orbit_session";

let accessToken = null;

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token) {
  accessToken = token || null;
}

export function clearAccessToken() {
  accessToken = null;
}

// -------- Persistent session (localStorage) --------

export function saveSession({ accessToken: at, refreshToken, user }) {
  setAccessToken(at);
  try {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ refreshToken, user, ts: Date.now() }),
    );
  } catch (e) {
    console.warn("Failed to persist session:", e);
  }
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.refreshToken) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

export function getStoredRefreshToken() {
  return loadSession()?.refreshToken || null;
}

export function clearSession() {
  clearAccessToken();
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (e) {
    // ignore
  }
}
