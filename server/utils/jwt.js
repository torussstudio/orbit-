const jwt = require("jsonwebtoken");
const { config } = require("../config/env");

function requireSecret(name, value) {
  if (!value) {
    throw new Error(
      `Missing required JWT secret: ${name}`,
    );
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

  const value = expiresIn.trim();

  const match = value.match(/^(\d+)\s*([smhd])$/i);

  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();

  if (!Number.isFinite(amount)) {
    return null;
  }

  switch (unit) {
    case "s":
      return amount * 1000;

    case "m":
      return amount * 60 * 1000;

    case "h":
      return amount * 60 * 60 * 1000;

    case "d":
      return amount * 24 * 60 * 60 * 1000;

    default:
      return null;
  }
}

function nowPlusExpiresIn(expiresIn) {
  const ms = parseExpiresInToMs(expiresIn);

  if (!ms) {
    return null;
  }

  return new Date(Date.now() + ms);
}

function accessSecret() {
  return requireSecret(
    "JWT_ACCESS_SECRET",
    config.jwtAccessSecret,
  );
}

function refreshSecret() {
  return requireSecret(
    "JWT_REFRESH_SECRET",
    config.jwtRefreshSecret,
  );
}

function accessExpiresIn() {
  return config.accessTokenExpiresIn;
}

function refreshExpiresIn() {
  return config.refreshTokenExpiresIn;
}

function signAccessToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      role: user.role,
      type: "access",
    },
    accessSecret(),
    {
      expiresIn: accessExpiresIn(),
      issuer: "orbit-api",
      audience: "orbit-client",
      algorithm: "HS256",
    },
  );
}

function signRefreshToken(user, jti) {
  return jwt.sign(
    {
      sub: String(user.id),
      jti,
      type: "refresh",
    },
    refreshSecret(),
    {
      expiresIn: refreshExpiresIn(),
      issuer: "orbit-api",
      audience: "orbit-client",
      algorithm: "HS256",
    },
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, accessSecret(), {
    issuer: "orbit-api",
    audience: "orbit-client",
    algorithms: ["HS256"],
  });
}

function verifyRefreshToken(token) {
  return jwt.verify(token, refreshSecret(), {
    issuer: "orbit-api",
    audience: "orbit-client",
    algorithms: ["HS256"],
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