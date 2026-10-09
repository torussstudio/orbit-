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

// "Send me a test notification" (POST /api/notifications/test). Each click
// saves a notification and sends a push, so it gets a small budget of its own.
// Counted per member, not per IP: the route runs after `auth`, and members
// who share an office address must not use up each other's tests.
const testNotificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `member:${req.user?.id}`,
  message: { error: "Too many test notifications. Try again later." },
});

module.exports = {
  authLimiter,
  refreshLimiter,
  apiLimiter,
  streamLimiter,
  testNotificationLimiter,
};
