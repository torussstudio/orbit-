const authService = require("../services/authService");

const SESSION_HEADER = "X-Orbit-Session-Id";

function readSessionId(req) {
  const sessionId = req.get(SESSION_HEADER);

  if (
    typeof sessionId !== "string" ||
    !sessionId.trim()
  ) {
    return null;
  }

  return sessionId.trim();
}

function readRefreshToken(req) {
  const refreshToken = req.body?.refreshToken;

  if (
    typeof refreshToken !== "string" ||
    !refreshToken.trim()
  ) {
    return null;
  }

  return refreshToken.trim();
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
      hasRefreshToken: Boolean(
        readRefreshToken(req),
      ),
      hasSessionId: Boolean(
        readSessionId(req),
      ),
    })}\n`,
  );
}

/*
 * LOGIN
 *
 * Creates a completely independent
 * authentication session for this tab/window.
 *
 * The frontend stores:
 * - accessToken -> memory
 * - refreshToken -> sessionStorage
 * - sessionId -> sessionStorage
 */
async function login(req, res, next) {
  try {
    const { email, password } =
      req.body || {};

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

    return res.json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      sessionId: result.sessionId,
      user: result.user,
    });
  } catch (err) {
    next(err);
  }
}

/*
 * REFRESH
 *
 * No browser-wide cookie is used.
 *
 * The frontend sends:
 * - refreshToken
 * - X-Orbit-Session-Id
 *
 * This allows each browser tab/window
 * to maintain its own authentication session.
 */
async function refresh(req, res, next) {
  try {
    const refreshToken =
      readRefreshToken(req);

    const sessionId =
      readSessionId(req);

    logRefreshEvent(req, "started");

    if (!refreshToken) {
      return res.status(401).json({
        error: "Refresh token required",
      });
    }

    if (!sessionId) {
      return res.status(401).json({
        error: "Session ID required",
      });
    }

    const result =
      await authService.refreshSession({
        refreshToken,
        sessionId,

        userAgent:
          req.get("user-agent") || null,

        ipAddress:
          req.ip || null,
      });

    logRefreshEvent(req, "succeeded", {
      status: 200,
    });

    return res.json({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      sessionId: result.sessionId,
      user: result.user,
    });
  } catch (err) {
    logRefreshEvent(req, "failed", {
      status: err.status || 500,
      reason: err.message,
    });

    return next(err);
  }
}

/*
 * LOGOUT
 *
 * Only the CURRENT session is revoked.
 *
 * It does NOT revoke other users/tabs.
 */
async function logout(req, res, next) {
  try {
    const refreshToken =
      readRefreshToken(req);

    const bearerToken =
      readBearer(req);

    const sessionId =
      readSessionId(req);

    await authService.logoutSession({
      refreshToken,
      bearerToken,
      sessionId,
    });

    return res.json({
      success: true,
    });
  } catch (err) {
    return next(err);
  }
}

/*
 * LOGOUT ALL
 *
 * Explicitly logs the current user out
 * from every active Orbit session.
 */
async function logoutAll(
  req,
  res,
  next,
) {
  try {
    await authService.logoutAllSessions(
      req.user.id,
    );

    return res.json({
      success: true,
    });
  } catch (err) {
    return next(err);
  }
}

/*
 * CURRENT USER
 */
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

/*
 * UPDATE PROFILE
 */
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

/*
 * DELETE ACCOUNT
 *
 * authService.deleteAccount()
 * already revokes all sessions.
 */
async function deleteAccount(
  req,
  res,
  next,
) {
  try {
    await authService.deleteAccount(
      req.user.id,
    );

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
  logoutAll,
  me,
  updateProfile,
  deleteAccount,
};