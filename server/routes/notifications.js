'use strict';

const router = require('express').Router();

const { auth } = require('../middleware/auth');

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