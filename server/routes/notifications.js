'use strict';

const router = require('express').Router();

const { auth } = require('../middleware/auth');
const { testNotificationLimiter } = require('../middleware/rateLimit');

const notificationController =
  require('../controllers/notificationController');

// ============================================================
// READ
// ============================================================

router.get(
  '/',
  auth,
  notificationController.getNotifications,
);
router.get(
  '/unread-count',
  auth,
  notificationController.getUnreadCount,
);

// ============================================================
// PREFERENCES (per member, per type) + TEST
// ============================================================

router.get(
  '/preferences',
  auth,
  notificationController.getPreferences,
);

router.put(
  '/preferences',
  auth,
  notificationController.savePreferences,
);

// `auth` first: the limiter counts per member.
router.post(
  '/test',
  auth,
  testNotificationLimiter,
  notificationController.sendTest,
);

// ============================================================
// READ STATE
// ============================================================

router.patch(
  '/read-all',
  auth,
  notificationController.markAllRead,
);

router.patch(
  '/:id/read',
  auth,
  notificationController.markOneRead,
);

// ============================================================
// PUSH
// ============================================================

router.post(
  '/push-subscribe',
  auth,
  notificationController.pushSubscribe,
);

router.delete(
  '/push-subscribe',
  auth,
  notificationController.pushUnsubscribe,
);

router.get(
  '/vapid-public-key',
  auth,
  notificationController.getVapidPublicKey,
);

// ============================================================
// DELETE
// ============================================================

router.delete(
  '/:id',
  auth,
  notificationController.deleteNotification,
);

module.exports = router;