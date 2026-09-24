const SESSION_ID_KEY =
  "orbit_session_id";

const REFRESH_TOKEN_KEY =
  "orbit_refresh_token";

/*
 * ============================================================
 * ACCESS TOKEN
 * ============================================================
 *
 * Access token is intentionally stored
 * ONLY in memory.
 *
 * It is never written to:
 *
 * - localStorage
 * - sessionStorage
 * - cookies
 */

let accessToken = null;

/*
 * ============================================================
 * ACCESS TOKEN
 * ============================================================
 */

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(
  token,
) {
  accessToken =
    typeof token === "string" &&
    token.trim()
      ? token
      : null;
}

export function clearAccessToken() {
  accessToken = null;
}

/*
 * ============================================================
 * SESSION STORAGE HELPERS
 * ============================================================
 *
 * sessionStorage is isolated per browser tab.
 *
 * Example:
 *
 * Tab A
 *   orbit_session_id = A
 *   orbit_refresh_token = A
 *
 * Tab B
 *   orbit_session_id = B
 *   orbit_refresh_token = B
 *
 * Therefore logout/login in one tab does
 * not overwrite another tab's auth state.
 * ============================================================
 */

function getSessionStorage() {
  if (
    typeof window ===
    "undefined"
  ) {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/*
 * ============================================================
 * SESSION ID
 * ============================================================
 */

export function getSessionId() {
  const storage =
    getSessionStorage();

  if (!storage) {
    return null;
  }

  try {
    const value =
      storage.getItem(
        SESSION_ID_KEY,
      );

    return value?.trim() || null;
  } catch {
    return null;
  }
}

export function setSessionId(
  sessionId,
) {
  const storage =
    getSessionStorage();

  if (!storage) {
    return;
  }

  try {
    if (
      typeof sessionId ===
        "string" &&
      sessionId.trim()
    ) {
      storage.setItem(
        SESSION_ID_KEY,
        sessionId.trim(),
      );
    } else {
      storage.removeItem(
        SESSION_ID_KEY,
      );
    }
  } catch {
    // Ignore storage failures.
  }
}

/*
 * ============================================================
 * REFRESH TOKEN
 * ============================================================
 *
 * Refresh token is stored only in
 * sessionStorage.
 *
 * It is NOT stored in localStorage.
 *
 * NOTE:
 * This is required for independent
 * same-browser-tab sessions because an
 * HttpOnly cookie is shared across tabs.
 * ============================================================
 */

export function getStoredRefreshToken() {
  const storage =
    getSessionStorage();

  if (!storage) {
    return null;
  }

  try {
    const value =
      storage.getItem(
        REFRESH_TOKEN_KEY,
      );

    return value?.trim() || null;
  } catch {
    return null;
  }
}

export function setRefreshToken(
  token,
) {
  const storage =
    getSessionStorage();

  if (!storage) {
    return;
  }

  try {
    if (
      typeof token ===
        "string" &&
      token.trim()
    ) {
      storage.setItem(
        REFRESH_TOKEN_KEY,
        token.trim(),
      );
    } else {
      storage.removeItem(
        REFRESH_TOKEN_KEY,
      );
    }
  } catch {
    // Ignore storage failures.
  }
}

export function clearRefreshToken() {
  const storage =
    getSessionStorage();

  if (!storage) {
    return;
  }

  try {
    storage.removeItem(
      REFRESH_TOKEN_KEY,
    );
  } catch {
    // Ignore storage failures.
  }
}

/*
 * ============================================================
 * CLEAR CURRENT TAB SESSION
 * ============================================================
 *
 * IMPORTANT:
 *
 * Do NOT use localStorage.
 * Do NOT broadcast a global logout.
 *
 * Only this browser tab's session is cleared.
 * ============================================================
 */

export function clearSession() {
  clearAccessToken();

  const storage =
    getSessionStorage();

  if (!storage) {
    return;
  }

  try {
    storage.removeItem(
      SESSION_ID_KEY,
    );

    storage.removeItem(
      REFRESH_TOKEN_KEY,
    );
  } catch {
    // Ignore storage failures.
  }
}

/*
 * ============================================================
 * AUTH SESSION CHECK
 * ============================================================
 */

export function hasStoredSession() {
  return Boolean(
    getSessionId() &&
      getStoredRefreshToken(),
  );
}