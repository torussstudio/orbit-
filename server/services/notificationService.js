const db = require("../db");

async function getNotifications(userId) {
  const { rows } = await db.query(
    `SELECT id, member_id, type, title, body, message, related_entity_id,
            related_entity_type, metadata, read, created_at
       FROM notifications
      WHERE member_id = $1
      ORDER BY created_at DESC
      LIMIT 50`,
    [userId],
  );
  return rows;
}

async function getUnreadCount(userId) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS count FROM notifications WHERE member_id = $1 AND read = false`,
    [userId],
  );
  return rows[0]?.count || 0;
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
    `UPDATE notifications SET read = true
      WHERE id = $1 AND member_id = $2
      RETURNING id, member_id, type, title, body, message, related_entity_id,
                related_entity_type, metadata, read, created_at`,
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
  if (typeof endpoint !== "string" || endpoint.length > 2048) {
    const error = new Error("Invalid push endpoint");
    error.status = 400;
    throw error;
  }
  let parsedEndpoint;
  try {
    parsedEndpoint = new URL(endpoint);
  } catch {
    const error = new Error("Invalid push endpoint");
    error.status = 400;
    throw error;
  }
  if (parsedEndpoint.protocol !== "https:") {
    const error = new Error("Push endpoint must use HTTPS");
    error.status = 400;
    throw error;
  }
  if (![p256dh, auth].every((value) => typeof value === "string" && value.length > 0 && value.length <= 512)) {
    const error = new Error("Invalid push subscription keys");
    error.status = 400;
    throw error;
  }

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

module.exports = { getNotifications, getUnreadCount, markAllRead, markOneRead, deleteNotification, savePushSubscription, removePushSubscription };
