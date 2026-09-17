const router =
  require("express").Router();

const {
  auth,
} = require("../middleware/auth");

const {
  requireClientHeader,
} = require("../middleware/csrf");

const {
  authLimiter,
  refreshLimiter,
} = require("../middleware/rateLimit");

const authController =
  require("../controllers/authController");

/*
 * Login
 *
 * No access token required.
 */
router.post(
  "/login",
  authLimiter,
  authController.login,
);

/*
 * Refresh
 *
 * Authentication comes from the
 * HttpOnly refresh cookie.
 */
router.post(
  "/refresh",
  refreshLimiter,
  requireClientHeader,
  authController.refresh,
);

/*
 * Logout
 *
 * Uses refresh cookie and optionally
 * access token.
 */
router.post(
  "/logout",
  requireClientHeader,
  authController.logout,
);

/*
 * Protected routes.
 */
router.get(
  "/me",
  auth,
  authController.me,
);

router.put(
  "/profile",
  auth,
  authController.updateProfile,
);

router.delete(
  "/account",
  auth,
  authController.deleteAccount,
);

module.exports = router;