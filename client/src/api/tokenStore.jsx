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
 * TRUSTED DEVICE (persistent) STORAGE
 * ============================================================
 *
 * "Trust this device" at login keeps the session id and the
 * refresh token in localStorage instead, so the member stays
 * signed in after the tab or browser is closed, until they
 * press Logout (or the server ends the session).
 *
 * Without it nothing changes: the session lives in this tab's
 * sessionStorage and ends when the tab closes.
 *
 * A tab's own sessionStorage session always wins over the
 * trusted one, so a normal sign-in in one tab never touches
 * the trusted session used by other tabs.
 * ============================================================
 */

function getLocalStorage() {
  if (
    typeof window ===
    "undefined"
  ) {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readItem(storage, key) {
  if (!storage) {
    return null;
  }

  try {
    return storage.getItem(key)?.trim() || null;
  } catch {
    return null;
  }
}

function writeItem(storage, key, value) {
  if (!storage) {
    return;
  }

  try {
    if (
      typeof value ===
        "string" &&
      value.trim()
    ) {
      storage.setItem(
        key,
        value.trim(),
      );
    } else {
      storage.removeItem(key);
    }
  } catch {
    // Ignore storage failures.
  }
}

function readKey(key) {
  return (
    readItem(
      getSessionStorage(),
      key,
    ) ||
    readItem(
      getLocalStorage(),
      key,
    )
  );
}

/*
 * Rotation and refreshes write back to wherever this
 * session already lives.
 */
function writeKey(key, value) {
  const session =
    getSessionStorage();

  const local =
    getLocalStorage();

  if (
    readItem(session, key) ||
    !readItem(local, key)
  ) {
    writeItem(session, key, value);
  } else {
    writeItem(local, key, value);
  }
}

/*
 * Called once at login with both values.
 */
export function storeSession({
  sessionId,
  refreshToken,
  trusted = false,
}) {
  const session =
    getSessionStorage();

  const local =
    getLocalStorage();

  const target = trusted
    ? local || session
    : session;

  const other =
    target === session
      ? local
      : session;

  writeItem(
    target,
    SESSION_ID_KEY,
    sessionId,
  );

  writeItem(
    target,
    REFRESH_TOKEN_KEY,
    refreshToken,
  );

  /*
   * Never leave a second copy behind. A trusted login
   * replaces this tab's own session, and the other way round.
   */
  if (other !== target) {
    if (trusted || !readItem(other, SESSION_ID_KEY)) {
      writeItem(other, SESSION_ID_KEY, null);
      writeItem(other, REFRESH_TOKEN_KEY, null);
    }
  }
}

export function isTrustedDeviceSession() {
  return (
    !readItem(
      getSessionStorage(),
      SESSION_ID_KEY,
    ) &&
    Boolean(
      readItem(
        getLocalStorage(),
        SESSION_ID_KEY,
      ),
    )
  );
}

/*
 * ============================================================
 * SESSION ID
 * ============================================================
 */

export function getSessionId() {
  return readKey(SESSION_ID_KEY);
}

export function setSessionId(
  sessionId,
) {
  writeKey(
    SESSION_ID_KEY,
    sessionId,
  );
}

/*
 * ============================================================
 * REFRESH TOKEN
 * ============================================================
 *
 * Refresh token is stored in sessionStorage (this tab only),
 * or in localStorage for a trusted device. It is never put
 * in a cookie.
 * ============================================================
 */

export function getStoredRefreshToken() {
  return readKey(
    REFRESH_TOKEN_KEY,
  );
}

export function setRefreshToken(
  token,
) {
  writeKey(
    REFRESH_TOKEN_KEY,
    token,
  );
}

export function clearRefreshToken() {
  writeItem(
    getSessionStorage(),
    REFRESH_TOKEN_KEY,
    null,
  );
}

/*
 * ============================================================
 * CLEAR CURRENT SESSION
 * ============================================================
 *
 * Clears the session this tab is using: its own sessionStorage
 * session, or else the trusted-device session. A tab that has
 * its own session never wipes the trusted one.
 *
 * Do NOT broadcast a global logout.
 * ============================================================
 */

export function clearSession() {
  clearAccessToken();

  const session =
    getSessionStorage();

  const target =
    readItem(
      session,
      SESSION_ID_KEY,
    ) ||
    readItem(
      session,
      REFRESH_TOKEN_KEY,
    )
      ? session
      : getLocalStorage();

  writeItem(
    target,
    SESSION_ID_KEY,
    null,
  );

  writeItem(
    target,
    REFRESH_TOKEN_KEY,
    null,
  );

  // Make sure nothing half-cleared stays in this tab.
  if (target !== session) {
    writeItem(
      session,
      SESSION_ID_KEY,
      null,
    );

    writeItem(
      session,
      REFRESH_TOKEN_KEY,
      null,
    );
  }
}

/*
 * ============================================================
 * LOGOUT NOTICE
 * ============================================================
 *
 * Why this tab was signed out, when it was not the member's
 * own doing. Today the only reason is "revoked": the session
 * was ended from another device.
 *
 * Kept in this tab's sessionStorage because the sign-out
 * reloads the page on its way to the login screen. The login
 * screen shows it once and clears it. clearSession() leaves
 * it alone on purpose.
 * ============================================================
 */

const LOGOUT_NOTICE_KEY =
  "orbit_logout_notice";

export function setLogoutNotice(reason) {
  const storage =
    getSessionStorage();

  if (!storage) {
    return;
  }

  try {
    storage.setItem(
      LOGOUT_NOTICE_KEY,
      String(reason),
    );
  } catch {
    // Ignore storage failures.
  }
}

export function getLogoutNotice() {
  const storage =
    getSessionStorage();

  if (!storage) {
    return null;
  }

  try {
    return (
      storage.getItem(
        LOGOUT_NOTICE_KEY,
      ) || null
    );
  } catch {
    return null;
  }
}

export function clearLogoutNotice() {
  const storage =
    getSessionStorage();

  if (!storage) {
    return;
  }

  try {
    storage.removeItem(
      LOGOUT_NOTICE_KEY,
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