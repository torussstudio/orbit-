'use strict';

const db = require('../db');
const webpush = require('web-push');
const liveEvents = require('../services/liveEvents');
const { prefKey, isSecurity } = require('./notificationTypes');

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

// ── Notification preferences ─────────────────────────────────────
// Each member can pause everything, switch a type off, or choose how a type
// reaches them (Account settings -> Notifications). A member who never saved
// the card has no rows and gets what everyone got before: everything, as
// push + in-app.

// As before preferences existed: saved for the bell and pushed.
const SEND_BOTH = { send: true, inApp: true, push: true };
const SEND_NOTHING = { send: false, inApp: false, push: false };
const IN_APP_ONLY = { send: true, inApp: true, push: false };
const PUSH_ONLY = { send: true, inApp: false, push: true };

// One query: the member's pause switch, this type's row, and whether the
// member has any push subscription (needed for "push only").
async function readPrefs(userId, type) {
  const { rows } = await db.query(
    `SELECT
       COALESCE(p.pause_all, false) AS pause_all,
       COALESCE(t.enabled, true) AS enabled,
       COALESCE(t.delivery, 'both') AS delivery,
       EXISTS (
         SELECT 1 FROM push_subscriptions s WHERE s.member_id = m.id
       ) AS has_push
     FROM members m
     LEFT JOIN member_notification_prefs p ON p.member_id = m.id
     LEFT JOIN member_notification_type_prefs t
            ON t.member_id = m.id AND t.type = $2
     WHERE m.id = $1`,
    [userId, prefKey(type)],
  );

  return rows[0] || null;
}

/*
 * What to do with one notification of this type for a member with these
 * preferences (a row from readPrefs, or null when there is none).
 *
 *   send   false = save nothing, send nothing
 *   inApp  the row shows in the bell list (and the live bell event is sent)
 *   push   a browser push is sent
 *
 * - Security alerts ignore "Pause all" and the off switch; only their
 *   delivery can be chosen.
 * - "Push only" needs somewhere to push to. A member with no push
 *   subscription (or a server without VAPID keys) gets it in the bell
 *   instead, so the notification is never lost.
 */
function decideDelivery(type, prefs, pushConfigured = vapidConfigured) {
  if (!prefs) return SEND_BOTH;

  if (!isSecurity(type) && (prefs.pause_all || prefs.enabled === false)) {
    return SEND_NOTHING;
  }

  if (prefs.delivery === 'in_app') return IN_APP_ONLY;

  if (prefs.delivery === 'push') {
    return pushConfigured && prefs.has_push ? PUSH_ONLY : IN_APP_ONLY;
  }

  return SEND_BOTH;
}

// The member's preferences must never be the reason a notification is lost:
// if they cannot be read, it is sent the way everything was sent before.
async function deliveryFor(userId, type) {
  try {
    return decideDelivery(type, await readPrefs(userId, type));
  } catch (err) {
    console.error(
      '[pushNotify] reading notification preferences failed, sending as push + in-app:',
      err.message,
    );
    return SEND_BOTH;
  }
}

// Save notification row to DB (for the in-app bell list) AND deliver a
// real browser push to every device the member is subscribed on, as far as
// the member's notification preferences for this type allow.
//
// Returns the notification row, or null when nothing was saved (the member
// paused notifications or switched this type off, or the save failed).
async function createNotification(userId, title, body, data = {}) {
  try {
    const type = data.type || "general";
    const delivery = await deliveryFor(userId, type);

    if (!delivery.send) return null;

    const message = body ? `${title}: ${body}` : title;
    const metadata = { ...data };
    const dedupeKey = metadata.eventKey || null;
    delete metadata.eventKey;
    // A push-only row is saved because it carries the dedupe key. It is
    // hidden from the bell (in_app = false) and saved as already read, so
    // it can never count towards the unread badge.
    const { rows } = await db.query(
      `INSERT INTO notifications
         (member_id, message, type, title, body, related_entity_id,
          related_entity_type, metadata, dedupe_key, in_app, read)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (member_id, dedupe_key) WHERE dedupe_key IS NOT NULL
       DO NOTHING
       RETURNING id, member_id, type, title, body, message, related_entity_id,
                 related_entity_type, metadata, read, created_at`,
      [
        userId,
        message,
        type,
        title,
        body || null,
        data.entityId == null ? null : String(data.entityId),
        data.entityType || null,
        JSON.stringify(metadata),
        dedupeKey,
        delivery.inApp,
        !delivery.inApp,
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

    // Live update for the bell: sent once the row is saved, so the member's
    // refetch always finds it. Does nothing when live events are off. Not
    // sent for a push-only row: the bell has nothing new to show.
    if (created && delivery.inApp) {
      liveEvents.notificationCreated(userId);
    }

    // Fire-and-forget: don't let a push delivery failure block the
    // in-app notification from being saved/returned.
    if (created && delivery.push) {
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

// Send to many users at once (daily reminders). Each member's own
// preferences apply, because each goes through createNotification.
async function sendToMany(userIds, title, body, data = {}) {
  if (!userIds || !userIds.length) return;
  const BATCH = 10;
  for (let i = 0; i < userIds.length; i += BATCH) {
    const chunk = userIds.slice(i, i + BATCH);
    await Promise.all(chunk.map((id) => createNotification(id, title, body, data)));
  }
}

module.exports = {
  createNotification,
  sendToMany,
  decideDelivery,
};
