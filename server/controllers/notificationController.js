'use strict';

const notificationService = require('../services/notificationService');

// ============================================================
// GET NOTIFICATIONS
// ============================================================

async function getNotifications(req, res, next) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        error: 'Authentication required',
      });
    }

    const notifications =
      await notificationService.getNotifications(
        req.user.id,
      );

    return res.json(notifications);
  } catch (err) {
    return next(err);
  }
}

// ============================================================
// GET UNREAD COUNT
// ============================================================

async function getUnreadCount(req, res, next) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        error: 'Authentication required',
      });
    }

    const count =
      await notificationService.getUnreadCount(
        req.user.id,
      );

    return res.json({
      count: Number(count || 0),
    });
  } catch (err) {
    return next(err);
  }
}

// ============================================================
// MARK ALL READ
// ============================================================

async function markAllRead(req, res, next) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        error: 'Authentication required',
      });
    }

    const result =
      await notificationService.markAllRead(
        req.user.id,
      );

    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

// ============================================================
// MARK ONE READ
// ============================================================

async function markOneRead(req, res, next) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        error: 'Authentication required',
      });
    }

    const notification =
      await notificationService.markOneRead(
        req.params.id,
        req.user.id,
      );

    if (!notification) {
      return res.status(404).json({
        error: 'Notification not found',
      });
    }

    return res.json(notification);
  } catch (err) {
    return next(err);
  }
}

// ============================================================
// DELETE
// ============================================================

async function deleteNotification(req, res, next) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        error: 'Authentication required',
      });
    }

    const deleted =
      await notificationService.deleteNotification(
        req.params.id,
        req.user.id,
      );

    if (!deleted) {
      return res.status(404).json({
        error: 'Notification not found',
      });
    }

    return res.json({
      success: true,
    });
  } catch (err) {
    return next(err);
  }
}

// ============================================================
// PUSH SUBSCRIBE
// ============================================================

async function pushSubscribe(req, res, next) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        error: 'Authentication required',
      });
    }

    const {
      endpoint,
      keys,
    } = req.body || {};

    if (
      !endpoint ||
      !keys?.p256dh ||
      !keys?.auth
    ) {
      return res.status(400).json({
        error: 'Invalid subscription object',
      });
    }

    await notificationService.savePushSubscription(
      req.user.id,
      endpoint,
      keys.p256dh,
      keys.auth,
    );

    return res.json({
      success: true,
    });
  } catch (err) {
    return next(err);
  }
}

// ============================================================
// PUSH UNSUBSCRIBE
// ============================================================

async function pushUnsubscribe(req, res, next) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        error: 'Authentication required',
      });
    }

    const {
      endpoint,
    } = req.body || {};

    if (!endpoint) {
      return res.status(400).json({
        error: 'endpoint is required',
      });
    }

    await notificationService.removePushSubscription(
      req.user.id,
      endpoint,
    );

    return res.json({
      success: true,
    });
  } catch (err) {
    return next(err);
  }
}

// ============================================================
// VAPID PUBLIC KEY
// ============================================================

function getVapidPublicKey(req, res) {
  const key =
    process.env.VAPID_PUBLIC_KEY;

  if (!key) {
    return res.status(503).json({
      error: 'Push notifications are not configured',
    });
  }

  return res.json({
    publicKey: key,
  });
}

module.exports = {
  getNotifications,
  getUnreadCount,
  markAllRead,
  markOneRead,
  deleteNotification,
  pushSubscribe,
  pushUnsubscribe,
  getVapidPublicKey,
};