require("dotenv").config();

const isProd = process.env.NODE_ENV === "production";
const isVercel = Boolean(process.env.VERCEL);

function requireSecret(name, legacyFallback = null) {
  const value = process.env[name] || legacyFallback;

  if (!value && isProd) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value || null;
}

function parseOrigins(value) {
  if (!value) return [];

  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const developmentOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5173",
];

const configuredOrigins = [
  ...(isProd ? [] : developmentOrigins),
  ...parseOrigins(process.env.CLIENT_ORIGIN),
  ...parseOrigins(process.env.CLIENT_ORIGINS),
];

const clientOrigins = [...new Set(configuredOrigins)];

const config = {
  nodeEnv: process.env.NODE_ENV || "development",

  isProd,

  isVercel,

  port: Number(process.env.PORT) || 4000,

  databaseUrl: process.env.DATABASE_URL || null,

  dbSsl: process.env.DB_SSL === "true",

  /*
   * Production MUST use separate secrets.
   *
   * Development can temporarily fall back to JWT_SECRET,
   * but production cannot.
   */
  jwtAccessSecret: requireSecret(
    "JWT_ACCESS_SECRET",
    process.env.JWT_SECRET,
  ),

  jwtRefreshSecret: requireSecret(
    "JWT_REFRESH_SECRET",
    process.env.JWT_SECRET,
  ),

  /*
   * Leave undefined unless you intentionally need
   * a shared parent-domain cookie.
   *
   * Example:
   * COOKIE_DOMAIN=.example.com
   */
  cookieDomain: process.env.COOKIE_DOMAIN?.trim() || undefined,

  clientOrigins,

  accessTokenExpiresIn:
    process.env.JWT_ACCESS_EXPIRES_IN || "15m",

  refreshTokenExpiresIn:
    process.env.JWT_REFRESH_EXPIRES_IN || "30d",

  refreshCookieMaxAgeMs:
    Number(process.env.REFRESH_COOKIE_MAX_AGE_MS) ||
    30 * 24 * 60 * 60 * 1000,
};

function validateEnv() {
  const warnings = [];

  if (!config.databaseUrl) {
    warnings.push("DATABASE_URL is missing");
  }

  if (!config.jwtAccessSecret) {
    warnings.push(
      "JWT_ACCESS_SECRET (or JWT_SECRET) is missing",
    );
  }

  if (!config.jwtRefreshSecret) {
    warnings.push(
      "JWT_REFRESH_SECRET (or JWT_SECRET) is missing",
    );
  }

  if (isProd) {
    if (!process.env.JWT_ACCESS_SECRET) {
      throw new Error(
        "JWT_ACCESS_SECRET is required in production",
      );
    }

    if (!process.env.JWT_REFRESH_SECRET) {
      throw new Error(
        "JWT_REFRESH_SECRET is required in production",
      );
    }

    if (
      config.jwtAccessSecret === config.jwtRefreshSecret
    ) {
      throw new Error(
        "JWT access and refresh secrets must differ in production",
      );
    }

    if (clientOrigins.length === 0) {
      throw new Error(
        "At least one CLIENT_ORIGIN/CLIENT_ORIGINS is required in production",
      );
    }
  }

  if (
    !isProd &&
    (!process.env.JWT_ACCESS_SECRET ||
      !process.env.JWT_REFRESH_SECRET)
  ) {
    warnings.push(
      "Development is using JWT_SECRET fallback. Configure separate JWT secrets.",
    );
  }

  return warnings;
}

module.exports = {
  config,
  validateEnv,
  isProd,
  isVercel,
};