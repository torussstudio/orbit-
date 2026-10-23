const rateLimit = require("express-rate-limit");

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts. Try again later." },
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many refresh attempts. Try again later." },
});

// Forgot password (POST /auth/forgot-password): sending a code, per IP.
// Each email also has its own limit in passwordResetService (60 s gap,
// 5 codes an hour).
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many reset requests. Try again in a few minutes." },
});

// Forgot password (POST /auth/reset-password): checking a code, per IP.
// Each code also closes after 5 wrong tries.
const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Try again in a few minutes." },
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
});

// Live events stream (GET /api/events/stream). One long-lived request per
// open tab, so it gets its own budget: reconnects (page loads, tab switches,
// network drops) must not use up the general API limit, and a reconnect storm
// still gets stopped.
const streamLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  authLimiter,
  refreshLimiter,
  apiLimiter,
  streamLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
};
