const authService = require("../services/authService");

const {
  REFRESH_COOKIE_NAME,
  getRefreshCookieOptions,
  clearAuthCookies,
} = require("../utils/cookies");

function readRefreshToken(req) {
  return req.cookies?.[REFRESH_COOKIE_NAME] || null;
}

function readBearer(req) {
  const authHeader =
    req.get("authorization") ||
    req.get("Authorization");

  if (
    typeof authHeader === "string" &&
    authHeader.startsWith("Bearer ")
  ) {
    return authHeader
      .slice("Bearer ".length)
      .trim();
  }

  return null;
}

function logRefreshEvent(
  req,
  outcome,
  details = {},
) {
  process.stdout.write(
    `${JSON.stringify({
      event: "auth_refresh",
      outcome,
      status: details.status,
      reason: details.reason,
      hasRefreshCookie: Boolean(
        req.cookies?.[REFRESH_COOKIE_NAME],
      ),
    })}\n`,
  );
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password required",
      });
    }

    const result =
      await authService.loginWithPassword({
        email: String(email)
          .trim()
          .toLowerCase(),

        password,

        userAgent:
          req.get("user-agent") || null,

        ipAddress:
          req.ip || null,
      });

    clearAuthCookies(res);

    res.cookie(
      REFRESH_COOKIE_NAME,
      result.refreshToken,
      getRefreshCookieOptions(),
    );

    /*
     * Only access token is returned.
     *
     * Refresh token stays HttpOnly cookie.
     * User profile is loaded through /auth/me.
     */
    return res.json({
      accessToken: result.accessToken,
    });
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const refreshToken =
      readRefreshToken(req);

    logRefreshEvent(req, "started");

    const result =
      await authService.refreshSession({
        refreshToken,

        userAgent:
          req.get("user-agent") || null,

        ipAddress:
          req.ip || null,
      });

    /*
     * Rotate cookie after successful refresh.
     */
    res.cookie(
      REFRESH_COOKIE_NAME,
      result.refreshToken,
      getRefreshCookieOptions(),
    );

    logRefreshEvent(req, "succeeded", {
      status: 200,
    });

    return res.json({
      accessToken: result.accessToken,
    });
  } catch (err) {
    /*
     * Invalid/revoked refresh token means
     * client session is no longer valid.
     */
    if (err.status === 401) {
      clearAuthCookies(res);
    }

    logRefreshEvent(req, "failed", {
      status: err.status || 500,
      reason: err.message,
    });

    next(err);
  }
}

async function logout(req, res, next) {
  try {
    await authService.logoutSession({
      refreshToken:
        readRefreshToken(req),

      bearerToken:
        readBearer(req),
    });

    clearAuthCookies(res);

    return res.json({
      success: true,
    });
  } catch (err) {
    clearAuthCookies(res);
    next(err);
  }
}

async function me(req, res, next) {
  try {
    const profile =
      await authService.getProfile(
        req.user.id,
      );

    if (!profile) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    return res.json(profile);
  } catch (err) {
    next(err);
  }
}

async function updateProfile(
  req,
  res,
  next,
) {
  try {
    const user =
      await authService.updateProfile(
        req.user.id,
        req.body || {},
      );

    return res.json({
      success: true,
      user,
    });
  } catch (err) {
    next(err);
  }
}

async function deleteAccount(
  req,
  res,
  next,
) {
  try {
    await authService.deleteAccount(
      req.user.id,
    );

    clearAuthCookies(res);

    return res.json({
      success: true,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  login,
  refresh,
  logout,
  me,
  updateProfile,
  deleteAccount,
};