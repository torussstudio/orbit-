function isProd() {
  return process.env.NODE_ENV === "production";
}

function cookieDomain() {
  return process.env.COOKIE_DOMAIN || undefined;
}

function baseCookieOptions() {
  const prod = isProd();
  return {
    httpOnly: true,
    secure: prod,
    sameSite: "lax",
    path: "/",
    domain: cookieDomain(),
  };
}

function getRefreshCookieOptions() {
  // Keep refresh cookie available to all auth endpoints (refresh/logout)
  // so logout can reliably revoke and clear it server-side.
  return {
    ...baseCookieOptions(),
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

function getLegacySessionCookieOptions() {
  // Matches previous `orbit_token` cookie settings for best-effort cleanup.
  return {
    ...baseCookieOptions(),
    path: "/",
  };
}

function clearAuthCookies(res) {
  const prod = isProd();

  const namesToClear = [
    "orbit_refresh",
    "orbit_token",
    "refreshToken",
    "adminToken",
    "token",
  ];

  const optionSets = [
    // Current production/dev defaults
    { httpOnly: true, secure: prod, sameSite: prod ? "none" : "lax", path: "/" },
    // Legacy variants that might exist in browsers
    { httpOnly: true, secure: true, sameSite: "none", path: "/" },
    { httpOnly: true, secure: false, sameSite: "lax", path: "/" },
    { path: "/" },
    // Legacy path that may exist from earlier rollout
    { httpOnly: true, secure: prod, sameSite: prod ? "none" : "lax", path: "/api/auth/refresh" },
    { httpOnly: true, secure: true, sameSite: "none", path: "/api/auth/refresh" },
    { path: "/api/auth/refresh" },
  ];

  for (const name of namesToClear) {
    for (const options of optionSets) {
      res.clearCookie(name, { ...options, domain: cookieDomain() });
    }
  }
}

module.exports = {
  getRefreshCookieOptions,
  getLegacySessionCookieOptions,
  clearAuthCookies,
};

