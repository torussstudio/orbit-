const db = require("../db");

async function getNotifications(userId) {
  const { rows } = await db.query(
    `SELECT id, message, read, created_at FROM notifications WHERE member_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [userId],
  );
  return rows;
}

async function markAllRead(userId) {
  const { rowCount } = await db.query(
    `UPDATE notifications SET read = true WHERE member_id = $1 AND read = false`,
    [userId],
  );
  return { updated: rowCount };
}

async function markOneRead(id, userId) {
  const { rows } = await db.query(
    `UPDATE notifications SET read = true WHERE id = $1 AND member_id = $2 RETURNING id, message, read, created_at`,
    [id, userId],
  );
  return rows[0] || null;
}

async function deleteNotification(id, userId) {
  const { rowCount } = await db.query(
    `DELETE FROM notifications WHERE id = $1 AND member_id = $2`,
    [id, userId],
  );
  return rowCount > 0;
}

async function savePushSubscription(userId, endpoint, p256dh, auth) {
  await db.query(
    `INSERT INTO push_subscriptions (member_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE SET member_id = $1, p256dh = $3, auth = $4, created_at = NOW()`,
    [userId, endpoint, p256dh, auth],
  );
}

async function removePushSubscription(userId, endpoint) {
  await db.query(
    `DELETE FROM push_subscriptions WHERE endpoint = $1 AND member_id = $2`,
    [endpoint, userId],
  );
}

module.exports = { getNotifications, markAllRead, markOneRead, deleteNotification, savePushSubscription, removePushSubscription };
