const REFRESH_COOKIE_NAME = "orbit_refresh";

/*
 * Orbit no longer uses browser-wide refresh
 * cookies for authentication.
 *
 * Authentication is session-scoped:
 *
 * sessionStorage
 * ├── orbit_session_id
 * └── orbit_refresh_token
 *
 * These helpers are kept temporarily so that
 * any legacy imports do not immediately crash.
 *
 * They should not be used by the new auth flow.
 */

function getRefreshCookieOptions() {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/api/auth",
  };
}

function clearAuthCookies(res) {
  /*
   * IMPORTANT:
   *
   * Do not clear auth cookies during normal
   * login/logout.
   *
   * Cookies are browser-wide and clearing them
   * from one tab can affect another tab.
   *
   * This function is retained only for legacy
   * compatibility.
   */

  const names = [
    REFRESH_COOKIE_NAME,
    "orbit_token",
    "refreshToken",
    "adminToken",
    "token",
  ];

  const paths = [
    "/api/auth",
    "/",
    "/api/auth/refresh",
  ];

  for (const path of paths) {
    for (const name of names) {
      res.clearCookie(name, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        path,
      });
    }
  }
}

module.exports = {
  REFRESH_COOKIE_NAME,
  getRefreshCookieOptions,
  clearAuthCookies,
};