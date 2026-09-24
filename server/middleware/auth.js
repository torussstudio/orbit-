const { verifyAccessToken } = require("../utils/jwt");
const db = require("../db");

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

    const { rows } = await db.query(
      `
        SELECT id, role, active
        FROM members
        WHERE id = $1
        LIMIT 1
      `,
      [payload.sub],
    );

    const member = rows[0];

    if (!member || !member.active) {
      return res.status(401).json({
        error: "NOT_AUTHENTICATED",
      });
    }

    /*
     * Keep sessionId in req.user.
     *
     * Controllers/services can use this when
     * an operation needs to identify the
     * current Orbit session.
     */
    req.user = {
      id: member.id,
      role: member.role,
      sessionId: payload.sid,
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