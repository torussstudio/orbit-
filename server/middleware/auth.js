const { verifyAccessToken } = require("../utils/jwt");

// =========================
// 🔐 AUTH MIDDLEWARE
// Reads access token from Authorization: Bearer.
// =========================
const auth = (req, res, next) => {
  const authHeader = req.get("authorization") || req.get("Authorization");
  const bearerToken =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : null;
  const token = bearerToken;

  if (!token) {
    return res.status(401).json({ error: "NOT_AUTHENTICATED" });
  }

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "TOKEN_EXPIRED" });
    }
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "INVALID_TOKEN" });
    }
    return res.status(401).json({ error: "INVALID_TOKEN" });
  }
};

// =========================
// 🛡️ ROLE GUARD
// Must be used AFTER auth middleware so req.user is populated.
// =========================
const managerOnly = (req, res, next) => {
  if (!req.user || req.user.role !== "manager") {
    return res.status(403).json({ error: "FORBIDDEN_ROLE" });
  }
  next();
};

module.exports = { auth, managerOnly };
