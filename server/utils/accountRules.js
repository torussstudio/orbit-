'use strict';

const db = require('../db');
const liveEvents = require('../services/liveEvents');

// Applies to NEW passwords only. Existing passwords keep working.
const MIN_PASSWORD_LENGTH = 8;

const PASSWORD_TOO_SHORT_MESSAGE =
  `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;

const EMAIL_TAKEN_MESSAGE =
  'A member with this email already exists';

function httpError(message, status) {
  const err = new Error(message);
  err.status = status;
  err.expose = true;
  return err;
}

// Trimmed + lowercased. null / undefined are returned unchanged.
function normalizeEmail(email) {
  if (email === undefined || email === null) return email;
  return String(email).trim().toLowerCase();
}

function assertPasswordLength(password) {
  if (String(password ?? '').length < MIN_PASSWORD_LENGTH) {
    throw httpError(PASSWORD_TOO_SHORT_MESSAGE, 400);
  }
}

// 409 if another member already uses this email (ignoring case).
async function assertEmailAvailable(email, excludeMemberId = null) {
  if (!email) return;

  const { rows } = await db.query(
    `SELECT id
     FROM members
     WHERE LOWER(BTRIM(email)) = $1
       AND ($2::text IS NULL OR id::text <> $2::text)
     LIMIT 1`,
    [email, excludeMemberId === null ? null : String(excludeMemberId)],
  );

  if (rows[0]) {
    throw httpError(EMAIL_TAKEN_MESSAGE, 409);
  }
}

// Postgres unique_violation on members.email (a race between the check
// above and the write) gets the same friendly 409.
function isEmailUniqueViolation(err) {
  return (
    err?.code === '23505' &&
    String(err?.constraint || '').includes('email')
  );
}

function emailTakenError() {
  return httpError(EMAIL_TAKEN_MESSAGE, 409);
}

// True when this member is an active manager and no other active
// manager exists. `queryable` is the db pool or a transaction client.
async function isLastActiveManager(memberId, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT
       (m.role = 'manager' AND m.active = true) AS is_active_manager,
       (
         SELECT COUNT(*)::int
         FROM members other
         WHERE other.role = 'manager'
           AND other.active = true
           AND other.id <> m.id
       ) AS other_active_managers
     FROM members m
     WHERE m.id = $1
     LIMIT 1`,
    [memberId],
  );

  const row = rows[0];

  return Boolean(
    row?.is_active_manager && Number(row.other_active_managers) === 0,
  );
}

/*
 * Deletes one member, in one transaction:
 *   1. block if this is the last active manager (409)
 *   2. delete the member's own notifications (in the live database
 *      notifications.member_id does not cascade, so they would block
 *      the delete)
 *   3. delete the member
 * Nothing else is deleted here. Rows that cascade from members
 * (sessions, push subscriptions, task assignments, ...) go with it.
 *
 * If the member is still referenced elsewhere (Postgres 23503,
 * foreign_key_violation) everything is rolled back and a 409 with
 * `linkedMessage` is thrown, so nothing changes.
 *
 * `pool` is the db pool (a stub can be passed in tests).
 */
async function deleteMemberRecord(
  memberId,
  { lastManagerMessage, linkedMessage },
  pool = db,
) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    if (await isLastActiveManager(memberId, client)) {
      throw httpError(lastManagerMessage, 409);
    }

    await client.query(
      'DELETE FROM notifications WHERE member_id = $1',
      [memberId],
    );

    await client.query('DELETE FROM members WHERE id = $1', [memberId]);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});

    // 23503 = foreign_key_violation
    if (err?.code === '23503') {
      throw httpError(linkedMessage, 409);
    }

    throw err;
  } finally {
    client.release();
  }

  // Only reached when the delete was committed: end the member's live
  // streams. Covers both a manager deleting a member and a member deleting
  // their own account.
  liveEvents.accessChanged(memberId, 'deleted');
}

module.exports = {
  isLastActiveManager,
  deleteMemberRecord,
  MIN_PASSWORD_LENGTH,
  httpError,
  normalizeEmail,
  assertPasswordLength,
  assertEmailAvailable,
  isEmailUniqueViolation,
  emailTakenError,
};
