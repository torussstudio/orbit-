const notificationService = require("../services/notificationService");

async function getNotifications(req, res, next) {
  try { res.json(await notificationService.getNotifications(req.user.id)); } catch (err) { next(err); }
}

async function markAllRead(req, res, next) {
  try { res.json(await notificationService.markAllRead(req.user.id)); } catch (err) { next(err); }
}

async function markOneRead(req, res, next) {
  try {
    const notif = await notificationService.markOneRead(req.params.id, req.user.id);
    if (!notif) return res.status(404).json({ error: "Notification not found" });
    res.json(notif);
  } catch (err) { next(err); }
}

async function deleteNotification(req, res, next) {
  try {
    const ok = await notificationService.deleteNotification(req.params.id, req.user.id);
    if (!ok) return res.status(404).json({ error: "Notification not found" });
    res.json({ success: true });
  } catch (err) { next(err); }
}

async function pushSubscribe(req, res, next) {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: "Invalid subscription object" });
    }
    await notificationService.savePushSubscription(req.user.id, endpoint, keys.p256dh, keys.auth);
    res.json({ success: true });
  } catch (err) { next(err); }
}

async function pushUnsubscribe(req, res, next) {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: "endpoint is required" });
    await notificationService.removePushSubscription(req.user.id, endpoint);
    res.json({ success: true });
  } catch (err) { next(err); }
}

function getVapidPublicKey(req, res) {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return res.status(503).json({ error: "Push not configured" });
  res.json({ publicKey: key });
}

module.exports = { getNotifications, markAllRead, markOneRead, deleteNotification, pushSubscribe, pushUnsubscribe, getVapidPublicKey };
