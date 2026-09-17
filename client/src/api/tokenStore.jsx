/*
 * Access token is intentionally stored
 * ONLY in memory.
 *
 * Refresh token is HttpOnly and cannot be
 * accessed by JavaScript.
 */

let accessToken = null;

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

export function clearSession() {
  clearAccessToken();
}