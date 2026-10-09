const { verifyAccessToken } = require("../utils/jwt");
const db = require("../db");
const authCache = require("../services/authCache");
const sessionCache = require("../services/sessionCache");
const { isSessionActive } = require("../models/refreshTokens");

/*
 * Kill switch for the session check below.
 *
 * SESSION_CHECK_ENABLED=false: the middleware skips the check completely
 * (no cache lookup, no query) and behaves exactly as it did before the
 * check existed. Anything else, or not set: on.
 */
function sessionCheckEnabled() {
  return process.env.SESSION_CHECK_ENABLED !== "false";
}

// Logged once, when the server starts.
console.log(
  sessionCheckEnabled()
    ? "[auth] Session check on: access tokens of revoked sessions are refused."
    : "[auth] Session check OFF (SESSION_CHECK_ENABLED=false): a revoked session keeps working until its access token expires.",
);

async function authenticate(req, res, next) {
  const authHeader =
    req.get("authorization") ||
    req.get("Authorization");

  if (
    typeof authHeader !== "string" ||
    !authHeader.startsWith("Bearer ")
  ) {
    return res.status(401).json({
      error: "NOT_AUTHENTICATED",
    });
  }

  const token = authHeader
    .slice("Bearer ".length)
    .trim();

  if (!token) {
    return res.status(401).json({
      error: "NOT_AUTHENTICATED",
    });
  }

  try {
    const payload =
      verifyAccessToken(token);

    /*
     * New access token structure:
     *
     * {
     *   sub: user id,
     *   sid: session id,
     *   role: user role,
     *   type: "access"
     * }
     *
     * sid is required so the access token
     * is always associated with one
     * specific Orbit session.
     */
    if (
      payload?.type !== "access" ||
      !payload?.sub ||
      !payload?.sid
    ) {
      return res.status(401).json({
        error: "INVALID_TOKEN",
      });
    }

    /*
     * The member row is cached for a short
     * time (services/authCache.js), so most
     * requests skip this query. The entry is
     * cleared as soon as the member's access
     * changes.
     */
    let member = authCache.get(payload.sub);

    if (!member) {
      const { rows } = await db.query(
        `
          SELECT id, role, active
          FROM members
          WHERE id = $1
          LIMIT 1
        `,
        [payload.sub],
      );

      member = rows[0];

      if (!member || !member.active) {
        return res.status(401).json({
          error: "NOT_AUTHENTICATED",
        });
      }

      authCache.set(member);
    }

    /*
     * The session this access token belongs to must
     * still be active (not revoked, not expired), so
     * signing a device out takes effect on its next
     * request instead of when its access token runs
     * out.
     *
     * Cached for a short time
     * (services/sessionCache.js). Only active
     * sessions are cached, and the entry is cleared
     * as soon as the session is revoked.
     *
     * 401 like every other refusal here: the client
     * then tries to refresh, the refresh is refused
     * too, and its normal "session expired" flow
     * signs the tab out.
     */
    if (
      sessionCheckEnabled() &&
      !sessionCache.get(payload.sid, member.id)
    ) {
      const active = await isSessionActive(
        payload.sid,
        member.id,
      );

      if (!active) {
        return res.status(401).json({
          error: "SESSION_ENDED",
        });
      }

      sessionCache.set(payload.sid, member.id);
    }

    /*
     * Keep sessionId in req.user.
     *
     * Controllers/services can use this when
     * an operation needs to identify the
     * current Orbit session.
     */
    /*
     * tokenExp: when this (verified) access
     * token expires, in seconds since 1970.
     * The live events stream uses it to close
     * itself when the token runs out.
     */
    req.user = {
      id: member.id,
      role: member.role,
      sessionId: payload.sid,
      tokenExp: payload.exp,
    };

    return next();
  } catch (err) {
    if (
      err.name === "TokenExpiredError"
    ) {
      return res.status(401).json({
        error: "TOKEN_EXPIRED",
      });
    }

    if (
      err.name === "JsonWebTokenError" ||
      err.name === "NotBeforeError"
    ) {
      return res.status(401).json({
        error: "INVALID_TOKEN",
      });
    }

    return res.status(401).json({
      error: "INVALID_TOKEN",
    });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (
      !req.user ||
      !roles.includes(req.user.role)
    ) {
      return res.status(403).json({
        error: "FORBIDDEN_ROLE",
      });
    }

    next();
  };
}

function requireSelfOrRole(
  paramName,
  role,
) {
  return (req, res, next) => {
    if (
      req.user?.role === role ||
      String(req.user?.id) ===
        String(req.params[paramName])
    ) {
      return next();
    }

    return res.status(403).json({
      error: "FORBIDDEN",
    });
  };
}

const auth = authenticate;

const managerOnly =
  requireRole("manager");

module.exports = {
  authenticate,
  auth,
  requireRole,
  requireSelfOrRole,
  managerOnly,
};