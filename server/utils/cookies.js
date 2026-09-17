const { config, isProd } = require("../config/env");

const REFRESH_COOKIE_NAME = "orbit_refresh";

function baseCookieOptions() {
  const options = {
    httpOnly: true,

    secure: isProd,

    /*
     * Production cross-origin SPA/API:
     * SameSite=None requires Secure=true.
     *
     * Local development:
     * SameSite=Lax works with localhost.
     */
    sameSite: isProd ? "none" : "lax",

    path: "/api/auth",

    overwrite: true,
  };

  /*
   * Only set Domain when explicitly configured.
   *
   * Host-only cookies are safer and avoid
   * accidental domain mismatch.
   */
  if (config.cookieDomain) {
    options.domain = config.cookieDomain;
  }

  return options;
}

function getRefreshCookieOptions() {
  return {
    ...baseCookieOptions(),
    maxAge: config.refreshCookieMaxAgeMs,
  };
}

function clearAuthCookies(res) {
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
      const options = {
        ...baseCookieOptions(),
        path,
      };

      res.clearCookie(name, options);
    }
  }
}

module.exports = {
  REFRESH_COOKIE_NAME,
  getRefreshCookieOptions,
  clearAuthCookies,
};