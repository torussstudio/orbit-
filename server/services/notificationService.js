'use strict';

const db = require('../db');
const { isUuid } = require('../utils/sessionInfo');

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
// GET NOTIFICATIONS
// ============================================================
//
// The bell only ever shows rows with in_app = true. A notification the
// member chose to get as "push only" is saved with in_app = false (the row
// carries the dedupe key) and is left out of the list and the unread count.
// Those rows are saved as already read, so "mark all read" has nothing to
// do for them, and they cannot be opened or deleted from the bell because
// the bell never learns their id.

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
      AND in_app = true
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
      AND in_app = true
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

// sessionId: the session (browser tab) that saved the subscription, so the
// subscription can be removed when that session is revoked. Optional; rows
// saved before this existed have none.
async function savePushSubscription(
  userId,
  endpoint,
  p256dh,
  auth,
  sessionId = null,
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
      auth,
      session_id
    )
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (endpoint)
    DO UPDATE SET
      member_id = EXCLUDED.member_id,
      p256dh = EXCLUDED.p256dh,
      auth = EXCLUDED.auth,
      session_id = EXCLUDED.session_id,
      created_at = NOW()
    `,
    [
      userId,
      endpoint,
      p256dh,
      auth,
      isUuid(sessionId) ? sessionId : null,
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
// REMOVE PUSH SUBSCRIPTIONS OF REVOKED SESSIONS
// ============================================================
//
// A device that was signed out must stop getting push notifications, so
// each of these runs right after the matching sessions are revoked
// (services/authService.js). member_id is always part of the WHERE.

// The subscriptions saved by these sessions (logout, "Sign out" next to a
// device).
async function removePushSubscriptionsForSessions(
  userId,
  sessionIds,
) {
  const ids = (sessionIds || []).filter(isUuid);

  if (!userId || ids.length === 0) {
    return;
  }

  await db.query(
    `
    DELETE FROM push_subscriptions
    WHERE member_id = $1
      AND session_id = ANY($2::uuid[])
    `,
    [userId, ids],
  );
}

// The subscriptions of every session except one ("Sign out all other
// devices", own password change).
// includeLegacy: also remove rows that have no session (saved before
// subscriptions were linked to a session). Only a password change does that.
async function removePushSubscriptionsOfOtherSessions(
  userId,
  keepSessionId,
  { includeLegacy = false } = {},
) {
  if (!userId || !isUuid(keepSessionId)) {
    return;
  }

  await db.query(
    `
    DELETE FROM push_subscriptions
    WHERE member_id = $1
      AND (
        session_id <> $2::uuid
        OR ($3::boolean AND session_id IS NULL)
      )
    `,
    [userId, keepSessionId, includeLegacy === true],
  );
}

// Every subscription of the member, with or without a session (log out
// everywhere, account deleted).
async function removeAllPushSubscriptionsForMember(userId) {
  if (!userId) {
    return;
  }

  await db.query(
    `
    DELETE FROM push_subscriptions
    WHERE member_id = $1
    `,
    [userId],
  );
}

module.exports = {
  getNotifications,
  getUnreadCount,
  markAllRead,
  markOneRead,
  deleteNotification,
  savePushSubscription,
  removePushSubscription,
  removePushSubscriptionsForSessions,
  removePushSubscriptionsOfOtherSessions,
  removeAllPushSubscriptionsForMember,
};