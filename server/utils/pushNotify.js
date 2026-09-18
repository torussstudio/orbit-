'use strict';

const db = require('../db');
const webpush = require('web-push');

// ── VAPID setup ──────────────────────────────────────────────────
// web-push was already a dependency in package.json but nothing ever
// called it — createNotification only wrote a DB row and assumed an
// external Supabase webhook/Edge Function (not present in this repo)
// would pick it up and send the actual push. That's the root cause of
// "assigned but no notification arrives". This wires up real sending,
// in-repo, using the subscriptions already saved in push_subscriptions.
let vapidConfigured = false;
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@torusdxn.in',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  vapidConfigured = true;
} else {
  console.warn(
    '[pushNotify] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY not set — push notifications will be saved in-app only, not delivered to the browser.',
  );
}

// Sends the actual browser push to every device this member is
// subscribed on. Matches the payload shape client/public/sw.js expects:
// { title, body, icon, badge, data }.
async function deliverPush(userId, title, body, data = {}) {
  if (!vapidConfigured) return;

  const { rows: subs } = await db.query(
    `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE member_id = $1`,
    [userId],
  );
  if (!subs.length) return;

  const payload = JSON.stringify({
    title,
    body,
    icon: '/orbit-icon-192.png',
    badge: '/orbit-icon-192.png',
    data,
  });

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
        );
      } catch (err) {
        // Provider rejection means the endpoint is no longer usable. Remove
        // it so future notifications do not repeatedly retry a dead device.
        if ([400, 401, 403, 404, 410].includes(err.statusCode)) {
          await db
            .query(`DELETE FROM push_subscriptions WHERE id = $1`, [sub.id])
            .catch(() => {});
        } else {
          console.error(
            '[pushNotify] sendNotification failed:',
            err.statusCode,
            err.message,
          );
        }
      }
    }),
  );
}

// Save notification row to DB (for the in-app bell list) AND deliver a
// real browser push to every device the member is subscribed on.
async function createNotification(userId, title, body, data = {}) {
  try {
    const message = body ? `${title}: ${body}` : title;
    const metadata = { ...data };
    const dedupeKey = metadata.eventKey || null;
    delete metadata.eventKey;

    const { rows } = await db.query(
      `INSERT INTO notifications
         (member_id, message, type, title, body, related_entity_id,
          related_entity_type, metadata, dedupe_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (member_id, dedupe_key) WHERE dedupe_key IS NOT NULL
       DO NOTHING
       RETURNING id, member_id, type, title, body, message, related_entity_id,
                 related_entity_type, metadata, read, created_at`,
      [
        userId,
        message,
        data.type || "general",
        title,
        body || null,
        data.entityId == null ? null : String(data.entityId),
        data.entityType || null,
        JSON.stringify(metadata),
        dedupeKey,
      ],
    );

    const created = Boolean(rows[0]);
    const notification = rows[0] || (dedupeKey
      ? (await db.query(
        `SELECT id, member_id, type, title, body, message, related_entity_id,
                related_entity_type, metadata, read, created_at
           FROM notifications WHERE member_id = $1 AND dedupe_key = $2`,
        [userId, dedupeKey],
      )).rows[0]
      : null);

    if (!notification) return null;

    // Fire-and-forget: don't let a push delivery failure block the
    // in-app notification from being saved/returned.
    if (created) {
      deliverPush(userId, title, body, metadata).catch((err) => {
        console.error('[pushNotify] deliverPush failed:', err.message);
      });
    }

    return notification;
  } catch (err) {
    console.error('[pushNotify] createNotification failed:', err.message);
    return null;
  }
}

// Send to many users at once (daily reminders)
async function sendToMany(userIds, title, body, data = {}) {
  if (!userIds || !userIds.length) return;
  const BATCH = 10;
  for (let i = 0; i < userIds.length; i += BATCH) {
    const chunk = userIds.slice(i, i + BATCH);
    await Promise.all(chunk.map((id) => createNotification(id, title, body, data)));
  }
}

module.exports = { createNotification, sendToMany };
