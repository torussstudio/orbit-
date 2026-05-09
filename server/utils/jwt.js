const jwt = require("jsonwebtoken");

function requireEnv(name, fallback) {
  const value = process.env[name] || fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseExpiresInToMs(expiresIn) {
  if (typeof expiresIn === "number") {
    return expiresIn * 1000;
  }
  if (typeof expiresIn !== "string") {
    return null;
  }

  const m = expiresIn.trim().match(/^(\d+)\s*([smhd])$/i);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  if (!Number.isFinite(n)) return null;

  switch (unit) {
    case "s":
      return n * 1000;
    case "m":
      return n * 60 * 1000;
    case "h":
      return n * 60 * 60 * 1000;
    case "d":
      return n * 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}

function nowPlusExpiresIn(expiresIn) {
  const ms = parseExpiresInToMs(expiresIn);
  if (!ms) return null;
  return new Date(Date.now() + ms);
}

function accessSecret() {
  return requireEnv("JWT_ACCESS_SECRET", process.env.JWT_SECRET);
}

function refreshSecret() {
  return requireEnv("JWT_REFRESH_SECRET", process.env.JWT_SECRET);
}

function accessExpiresIn() {
  return process.env.JWT_ACCESS_EXPIRES_IN || "5m";
}

function refreshExpiresIn() {
  return process.env.JWT_REFRESH_EXPIRES_IN || "7d";
}

function signAccessToken(user) {
  const payload = {
    sub: String(user.id),
    id: user.id,
    role: user.role,
  };

return jwt.sign(payload, accessSecret(), {
  expiresIn: accessExpiresIn(),
  issuer: "orbit-api",
  audience: "orbit-client",
});
}

function signRefreshToken(user, jti) {
  const payload = {
    sub: String(user.id),
    id: user.id,
    role: user.role,
    jti,
    typ: "refresh",
  };

 return jwt.sign(payload, refreshSecret(), {
  expiresIn: refreshExpiresIn(),
  issuer: "orbit-api",
  audience: "orbit-client",
});
}

function verifyAccessToken(token) {
  return jwt.verify(token, accessSecret(), {
  issuer: "orbit-api",
  audience: "orbit-client",
});
}

function verifyRefreshToken(token) {
 return jwt.verify(token, refreshSecret(), {
  issuer: "orbit-api",
  audience: "orbit-client",
});
}

function computeAccessExpiry() {
  return nowPlusExpiresIn(accessExpiresIn());
}

function computeRefreshExpiry() {
  return nowPlusExpiresIn(refreshExpiresIn());
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  computeAccessExpiry,
  computeRefreshExpiry,
  accessExpiresIn,
  refreshExpiresIn,
};

