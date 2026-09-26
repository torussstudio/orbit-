'use strict';

const db = require('../db');
const webpush = require('web-push');

// ============================================================
// VAPID CONFIG
// ============================================================

let vapidConfigured = false;

if (
  process.env.VAPID_PUBLIC_KEY &&
  process.env.VAPID_PRIVATE_KEY
) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@torusdxn.in',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );

  vapidConfigured = true;
} else {
  console.warn(
    '[pushNotify] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY not set. ' +
      'In-app notifications will work, browser push will be disabled.',
  );
}

// ============================================================
// HELPERS
// ============================================================

function normalizeNotification(row) {
  if (!row) return null;

  let metadata = row.metadata;

  if (typeof metadata === 'string') {
    try {
      metadata = JSON.parse(metadata);
    } catch {
      metadata = {};
    }
  }

  if (!metadata || typeof metadata !== 'object') {
    metadata = {};
  }

  return {
    id: row.id,
    member_id: row.member_id,
    type: row.type || 'general',
    title: row.title || '',
    body: row.body || '',
    message:
      row.message ||
      [row.title, row.body].filter(Boolean).join(': '),
    related_entity_id: row.related_entity_id ?? null,
    related_entity_type: row.related_entity_type ?? null,
    metadata,
    read: Boolean(row.read),
    created_at: row.created_at,
  };
}

// ============================================================
// BROWSER PUSH
// ============================================================

async function deliverPush(userId, title, body, data = {}) {
  if (!vapidConfigured) {
    return;
  }

  try {
    const { rows: subscriptions } = await db.query(
      `
      SELECT id, endpoint, p256dh, auth
      FROM push_subscriptions
      WHERE member_id = $1
      `,
      [userId],
    );

    if (!subscriptions.length) {
      return;
    }

    const payload = JSON.stringify({
      title: title || 'Orbit',
      body: body || '',
      icon: '/orbit-icon-192.png',
      badge: '/orbit-icon-192.png',
      data: data || {},
    });

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth,
              },
            },
            payload,
          );
        } catch (err) {
          const statusCode = err?.statusCode;

          // Subscription is no longer valid.
          if (
            [400, 401, 403, 404, 410].includes(statusCode)
          ) {
            await db
              .query(
                `
                DELETE FROM push_subscriptions
                WHERE id = $1
                `,
                [subscription.id],
              )
              .catch(() => {});
          } else {
            console.error(
              '[pushNotify] sendNotification failed:',
              statusCode,
              err?.message,
            );
          }
        }
      }),
    );
  } catch (err) {
    // Push failure must NEVER break in-app notifications.
    console.error(
      '[pushNotify] deliverPush failed:',
      err?.message,
    );
  }
}

// ============================================================
// CREATE NOTIFICATION
// ============================================================

async function createNotification(
  userId,
  title,
  body,
  data = {},
) {
  try {
    if (!userId) {
      console.warn(
        '[pushNotify] createNotification called without userId',
      );
      return null;
    }

    const safeData =
      data && typeof data === 'object'
        ? { ...data }
        : {};

    const message = body
      ? `${title}: ${body}`
      : title || '';

    const dedupeKey =
      typeof safeData.eventKey === 'string' &&
      safeData.eventKey.trim()
        ? safeData.eventKey.trim()
        : null;

    delete safeData.eventKey;

    const entityId =
      safeData.entityId == null
        ? null
        : String(safeData.entityId);

    const entityType =
      safeData.entityType || null;

    const type =
      safeData.type || 'general';

    // ----------------------------------------------------------
    // Insert
    // ----------------------------------------------------------

    const { rows } = await db.query(
      `
      INSERT INTO notifications (
        member_id,
        message,
        type,
        title,
        body,
        related_entity_id,
        related_entity_type,
        metadata,
        dedupe_key
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9
      )
      ON CONFLICT (member_id, dedupe_key)
      WHERE dedupe_key IS NOT NULL
      DO NOTHING
      RETURNING
        id,
        member_id,
        type,
        title,
        body,
        message,
        related_entity_id,
        related_entity_type,
        metadata,
        read,
        created_at
      `,
      [
        userId,
        message,
        type,
        title || null,
        body || null,
        entityId,
        entityType,
        JSON.stringify(safeData),
        dedupeKey,
      ],
    );

    let notification = rows[0] || null;
    const created = Boolean(notification);

    // ----------------------------------------------------------
    // Existing notification when dedupe key already exists
    // ----------------------------------------------------------

    if (!notification && dedupeKey) {
      const existing = await db.query(
        `
        SELECT
          id,
          member_id,
          type,
          title,
          body,
          message,
          related_entity_id,
          related_entity_type,
          metadata,
          read,
          created_at
        FROM notifications
        WHERE member_id = $1
          AND dedupe_key = $2
        LIMIT 1
        `,
        [userId, dedupeKey],
      );

      notification = existing.rows[0] || null;
    }

    if (!notification) {
      return null;
    }

    notification = normalizeNotification(notification);

    // ----------------------------------------------------------
    // Push only for newly-created notification
    // ----------------------------------------------------------

    if (created) {
      deliverPush(
        userId,
        title,
        body,
        safeData,
      ).catch((err) => {
        console.error(
          '[pushNotify] Background push failed:',
          err?.message,
        );
      });
    }

    return notification;
  } catch (err) {
    console.error(
      '[pushNotify] createNotification failed:',
      err?.message,
    );

    // Notification failure should not break task operations.
    return null;
  }
}

// ============================================================
// GET NOTIFICATIONS
// ============================================================

async function getNotifications(userId) {
  if (!userId) {
    return [];
  }

  const { rows } = await db.query(
    `
    SELECT
      id,
      member_id,
      type,
      title,
      body,
      message,
      related_entity_id,
      related_entity_type,
      metadata,
      read,
      created_at
    FROM notifications
    WHERE member_id = $1
    ORDER BY created_at DESC
    LIMIT 50
    `,
    [userId],
  );

  return rows.map(normalizeNotification);
}

// ============================================================
// UNREAD COUNT
// ============================================================

async function getUnreadCount(userId) {
  if (!userId) {
    return 0;
  }

  const { rows } = await db.query(
    `
    SELECT COUNT(*)::int AS count
    FROM notifications
    WHERE member_id = $1
      AND read = false
    `,
    [userId],
  );

  return Number(rows[0]?.count || 0);
}

// ============================================================
// MARK ALL READ
// ============================================================

async function markAllRead(userId) {
  if (!userId) {
    return { updated: 0 };
  }

  const { rowCount } = await db.query(
    `
    UPDATE notifications
    SET read = true
    WHERE member_id = $1
      AND read = false
    `,
    [userId],
  );

  return {
    updated: rowCount || 0,
  };
}

// ============================================================
// MARK ONE READ
// ============================================================

async function markOneRead(id, userId) {
  if (!id || !userId) {
    return null;
  }

  const { rows } = await db.query(
    `
    UPDATE notifications
    SET read = true
    WHERE id = $1
      AND member_id = $2
    RETURNING
      id,
      member_id,
      type,
      title,
      body,
      message,
      related_entity_id,
      related_entity_type,
      metadata,
      read,
      created_at
    `,
    [id, userId],
  );

  return normalizeNotification(rows[0]);
}

// ============================================================
// DELETE NOTIFICATION
// ============================================================

async function deleteNotification(id, userId) {
  if (!id || !userId) {
    return false;
  }

  const { rowCount } = await db.query(
    `
    DELETE FROM notifications
    WHERE id = $1
      AND member_id = $2
    `,
    [id, userId],
  );

  return rowCount > 0;
}

// ============================================================
// PUSH SUBSCRIPTION
// ============================================================

async function savePushSubscription(
  userId,
  endpoint,
  p256dh,
  auth,
) {
  if (!userId) {
    const error = new Error('User id is required');
    error.status = 400;
    throw error;
  }

  if (
    typeof endpoint !== 'string' ||
    endpoint.length === 0 ||
    endpoint.length > 2048
  ) {
    const error = new Error('Invalid push endpoint');
    error.status = 400;
    throw error;
  }

  let parsedEndpoint;

  try {
    parsedEndpoint = new URL(endpoint);
  } catch {
    const error = new Error('Invalid push endpoint');
    error.status = 400;
    throw error;
  }

  if (parsedEndpoint.protocol !== 'https:') {
    const error = new Error(
      'Push endpoint must use HTTPS',
    );
    error.status = 400;
    throw error;
  }

  if (
    ![p256dh, auth].every(
      (value) =>
        typeof value === 'string' &&
        value.length > 0 &&
        value.length <= 512,
    )
  ) {
    const error = new Error(
      'Invalid push subscription keys',
    );
    error.status = 400;
    throw error;
  }

  await db.query(
    `
    INSERT INTO push_subscriptions (
      member_id,
      endpoint,
      p256dh,
      auth
    )
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (endpoint)
    DO UPDATE SET
      member_id = EXCLUDED.member_id,
      p256dh = EXCLUDED.p256dh,
      auth = EXCLUDED.auth,
      created_at = NOW()
    `,
    [
      userId,
      endpoint,
      p256dh,
      auth,
    ],
  );
}

// ============================================================
// REMOVE PUSH SUBSCRIPTION
// ============================================================

async function removePushSubscription(
  userId,
  endpoint,
) {
  if (!userId || !endpoint) {
    return;
  }

  await db.query(
    `
    DELETE FROM push_subscriptions
    WHERE endpoint = $1
      AND member_id = $2
    `,
    [endpoint, userId],
  );
}

// ============================================================
// SEND TO MANY
// ============================================================

async function sendToMany(
  userIds,
  title,
  body,
  data = {},
) {
  if (!Array.isArray(userIds) || !userIds.length) {
    return;
  }

  const BATCH_SIZE = 10;

  for (
    let i = 0;
    i < userIds.length;
    i += BATCH_SIZE
  ) {
    const chunk = userIds.slice(
      i,
      i + BATCH_SIZE,
    );

    await Promise.all(
      chunk.map((id) =>
        createNotification(
          id,
          title,
          body,
          data,
        ),
      ),
    );
  }
}

module.exports = {
  createNotification,
  sendToMany,
  getNotifications,
  getUnreadCount,
  markAllRead,
  markOneRead,
  deleteNotification,
  savePushSubscription,
  removePushSubscription,
};