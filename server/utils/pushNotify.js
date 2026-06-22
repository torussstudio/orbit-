'use strict';

const webpush = require('web-push');
const db      = require('../db');

// ─── VAPID setup ──────────────────────────────────────────────────
const { VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;

if (!VAPID_SUBJECT || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.warn('[pushNotify] ⚠️  VAPID env vars missing — push notifications disabled.');
} else {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

const VAPID_READY = Boolean(VAPID_SUBJECT && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

// ─── Save notification row to DB ──────────────────────────────────
async function _saveNotificationRow(userId, title, body) {
  const message = body ? `${title}: ${body}` : title;
  const { rows } = await db.query(
    `INSERT INTO notifications (member_id, message)
     VALUES ($1, $2)
     RETURNING id, member_id, message, read, created_at`,
    [userId, message]
  );
  return rows[0];
}

// ─── Send Web Push to all subscriptions for a user ────────────────
async function _sendPushToUser(userId, title, body, data = {}) {
  if (!VAPID_READY) return;

  const { rows: subs } = await db.query(
    `SELECT id, endpoint, p256dh, auth
     FROM push_subscriptions
     WHERE member_id = $1`,
    [userId]
  );

  if (!subs.length) return;

  const payload = JSON.stringify({
    title,
    body,
    icon:  '/orbit-icon-192.png',
    badge: '/orbit-icon-192.png',
    data,
  });

  const expiredEndpoints = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 4 * 60 * 60 }
        );
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          expiredEndpoints.push(sub.endpoint);
        } else {
          console.error(`[pushNotify] Push failed for userId=${userId}:`, err.statusCode || err.message);
        }
      }
    })
  );

  // Remove dead subscriptions
  if (expiredEndpoints.length) {
    await db.query(
      `DELETE FROM push_subscriptions WHERE endpoint = ANY($1)`,
      [expiredEndpoints]
    );
  }
}

// ─── Public: send one notification ────────────────────────────────
async function createNotification(userId, title, body, data = {}) {
  try {
    const row = await _saveNotificationRow(userId, title, body);

    // Fire push in background — never crash the caller
    _sendPushToUser(userId, title, body, data).catch((err) => {
      console.error('[pushNotify] Background push error:', err.message);
    });

    return row;
  } catch (err) {
    console.error('[pushNotify] createNotification failed:', err.message);
    return null;
  }
}

// ─── Public: send to many users at once ───────────────────────────
async function sendToMany(userIds, title, body, data = {}) {
  if (!userIds || !userIds.length) return;
  const BATCH = 10;
  for (let i = 0; i < userIds.length; i += BATCH) {
    const chunk = userIds.slice(i, i + BATCH);
    await Promise.all(chunk.map((id) => createNotification(id, title, body, data)));
  }
}

module.exports = { createNotification, sendToMany };