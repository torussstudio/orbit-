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
 * LOGIN
 *
 * Creates a new independent session.
 *
 * No authentication required.
 */
router.post(
  "/login",
  authLimiter,
  authController.login,
);

/*
 * REFRESH
 *
 * Authentication is based on:
 *
 * - refreshToken
 * - X-Orbit-Session-Id
 *
 * Both belong to the current
 * browser tab/window.
 */
router.post(
  "/refresh",
  refreshLimiter,
  requireClientHeader,
  authController.refresh,
);

/*
 * LOGOUT CURRENT SESSION
 *
 * Only the current tab/window session
 * is revoked.
 */
router.post(
  "/logout",
  requireClientHeader,
  authController.logout,
);

/*
 * LOGOUT ALL SESSIONS
 *
 * Explicit action.
 *
 * Revokes all active sessions belonging
 * to the authenticated user.
 */
router.post(
  "/logout-all",
  auth,
  requireClientHeader,
  authController.logoutAll,
);

/*
 * CURRENT USER
 */
router.get(
  "/me",
  auth,
  authController.me,
);

/*
 * UPDATE PROFILE
 */
router.put(
  "/profile",
  auth,
  authController.updateProfile,
);

/*
 * DELETE ACCOUNT
 */
router.delete(
  "/account",
  auth,
  authController.deleteAccount,
);

module.exports = router;