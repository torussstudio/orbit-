const crypto = require("crypto");
const db = require("../db");
const sessionCache = require("../services/sessionCache");
const { isUuid } = require("../utils/sessionInfo");

function hashJti(jti) {
  if (!jti) return null;

  return crypto
    .createHash("sha256")
    .update(jti)
    .digest("hex");
}

/*
 * Revoked sessions must be refused on their very next request, so every
 * revoke below drops them from the auth middleware's session cache
 * (services/sessionCache.js).
 */
function forgetSessions(rows) {
  sessionCache.clearMany(
    rows.map((row) => row.session_id).filter(Boolean),
  );
}

// Session ids of the given rows, as lower-case text, without repeats.
function sessionIdsOf(rows) {
  return [
    ...new Set(
      rows
        .map((row) => row.session_id)
        .filter(Boolean)
        .map((id) => String(id).toLowerCase()),
    ),
  ];
}

/**
 * Create a new refresh-token session record.
 */
async function createRefreshToken({
  memberId,
  sessionId,
  jti,
  expiresAt,
  userAgent = null,
  ipAddress = null,
}) {
  if (!sessionId) {
    throw new Error("sessionId is required");
  }

  const hashedJti = hashJti(jti);

  const { rows } = await db.query(
    `
      INSERT INTO refresh_tokens (
        member_id,
        session_id,
        jti,
        expires_at,
        user_agent,
        ip_address
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
    [
      memberId,
      sessionId,
      hashedJti,
      expiresAt,
      userAgent,
      ipAddress,
    ],
  );

  return rows[0];
}

/**
 * Find any refresh-token record by JTI.
 *
 * Used mainly for reuse/revocation detection.
 */
async function findRefreshTokenByJti(jti) {
  const { rows } = await db.query(
    `
      SELECT *
      FROM refresh_tokens
      WHERE jti = $1
      LIMIT 1
    `,
    [hashJti(jti)],
  );

  return rows[0] || null;
}

/**
 * Find an active refresh token.
 *
 * sessionId is optional during migration.
 * Once all clients are migrated, it should always be supplied.
 */
async function findValidRefreshToken(
  jti,
  sessionId = null,
) {
  const values = [hashJti(jti)];
  let sessionCondition = "";

  if (sessionId) {
    values.push(sessionId);
    sessionCondition = `AND session_id = $2`;
  }

  const { rows } = await db.query(
    `
      SELECT *
      FROM refresh_tokens
      WHERE jti = $1
        ${sessionCondition}
        AND revoked_at IS NULL
        AND expires_at > NOW()
      LIMIT 1
    `,
    values,
  );

  return rows[0] || null;
}

/**
 * Revoke one refresh-token generation.
 */
async function revokeRefreshToken(
  jti,
  reason = null,
) {
  const { rows } = await db.query(
    `
      UPDATE refresh_tokens
      SET
        revoked_at = NOW(),
        revoke_reason = COALESCE($2, revoke_reason)
      WHERE jti = $1
      RETURNING *
    `,
    [
      hashJti(jti),
      reason,
    ],
  );

  forgetSessions(rows);

  return rows[0] || null;
}

/**
 * Revoke every active refresh-token generation
 * belonging to one browser session.
 */
async function revokeRefreshSession(
  sessionId,
  reason = "logout",
) {
  if (!sessionId) {
    return [];
  }

  const { rows } = await db.query(
    `
      UPDATE refresh_tokens
      SET
        revoked_at = NOW(),
        revoke_reason = COALESCE($2, revoke_reason)
      WHERE session_id = $1
        AND revoked_at IS NULL
      RETURNING *
    `,
    [
      sessionId,
      reason,
    ],
  );

  // Also when no row matched: the session is certainly not active.
  sessionCache.clear(sessionId);

  return rows;
}

/**
 * Revoke every session belonging to one member.
 *
 * IMPORTANT:
 * This should only be used for explicit
 * "logout all", password changes, account deletion,
 * etc.
 */
async function revokeAllRefreshTokensForMember(
  memberId,
  reason = "logout_all",
) {
  const { rows } = await db.query(
    `
      UPDATE refresh_tokens
      SET
        revoked_at = NOW(),
        revoke_reason = COALESCE($2, revoke_reason)
      WHERE member_id = $1
        AND revoked_at IS NULL
      RETURNING *
    `,
    [
      memberId,
      reason,
    ],
  );

  /*
   * By member, not by the rows returned: after an account delete
   * the rows are already gone (ON DELETE CASCADE) and nothing is
   * returned.
   */
  sessionCache.clearMember(memberId);

  return rows;
}

/**
 * Revoke some sessions of one member ("Sign out" next to a
 * device in Account settings).
 *
 * member_id is part of the WHERE, so a session id that belongs
 * to another member matches nothing.
 *
 * Returns the session ids that were revoked just now.
 */
async function revokeSessionsForMember(
  memberId,
  sessionIds,
  reason = "revoked_by_user",
) {
  const ids = (sessionIds || []).filter(isUuid);

  if (ids.length === 0) {
    return [];
  }

  const { rows } = await db.query(
    `
      UPDATE refresh_tokens
      SET
        revoked_at = NOW(),
        revoke_reason = COALESCE($3, revoke_reason)
      WHERE member_id = $1
        AND session_id = ANY($2::uuid[])
        AND revoked_at IS NULL
      RETURNING session_id
    `,
    [
      memberId,
      ids,
      reason,
    ],
  );

  sessionCache.clearMany(ids);

  return sessionIdsOf(rows);
}

/**
 * Revoke every session of one member except one
 * ("Sign out all other devices", own password change).
 *
 * Returns the session ids that were revoked just now.
 */
async function revokeOtherSessionsForMember(
  memberId,
  keepSessionId,
  reason = "logout_others",
) {
  if (!isUuid(keepSessionId)) {
    throw new Error("keepSessionId is required");
  }

  const { rows } = await db.query(
    `
      UPDATE refresh_tokens
      SET
        revoked_at = NOW(),
        revoke_reason = COALESCE($3, revoke_reason)
      WHERE member_id = $1
        AND revoked_at IS NULL
        AND session_id IS DISTINCT FROM $2::uuid
      RETURNING session_id
    `,
    [
      memberId,
      keepSessionId,
      reason,
    ],
  );

  forgetSessions(rows);

  return sessionIdsOf(rows);
}

/**
 * Is this session still active for this member?
 *
 * Used by the auth middleware on (almost) every request, so it
 * is one indexed lookup (idx_refresh_tokens_active_session).
 *
 * Rotation revokes the old generation and inserts the new one
 * in one transaction, so a live session always has exactly one
 * row that is not revoked: its newest. "A row that is not
 * revoked and not expired exists" is therefore the same as "the
 * newest row is not revoked and not expired".
 */
async function isSessionActive(
  sessionId,
  memberId,
) {
  if (!isUuid(sessionId)) {
    return false;
  }

  const { rows } = await db.query(
    `
      SELECT 1
      FROM refresh_tokens
      WHERE session_id = $1
        AND member_id = $2
        AND revoked_at IS NULL
        AND expires_at > NOW()
      LIMIT 1
    `,
    [
      sessionId,
      memberId,
    ],
  );

  return rows.length > 0;
}

/**
 * One row per active session of a member, newest activity first.
 *
 * Active = the session's newest row is not revoked and not
 * expired. Sessions that have not refreshed for `idleDays` are
 * left out (they are not revoked, only hidden).
 *
 * last_active_at = when the newest row was created, i.e. the
 * last refresh (a tab in use refreshes at least every access
 * token lifetime).
 * first_seen_at  = the oldest row still stored for the session.
 */
async function listActiveSessions(
  memberId,
  idleDays,
) {
  const { rows } = await db.query(
    `
      SELECT
        t.session_id,
        t.user_agent,
        t.ip_address,
        t.created_at AS last_active_at,
        (
          SELECT MIN(o.created_at)
          FROM refresh_tokens o
          WHERE o.session_id = t.session_id
        ) AS first_seen_at
      FROM refresh_tokens t
      WHERE t.member_id = $1
        AND t.session_id IS NOT NULL
        AND t.revoked_at IS NULL
        AND t.expires_at > NOW()
        AND t.created_at > NOW() - make_interval(days => $2)
        AND NOT EXISTS (
          SELECT 1
          FROM refresh_tokens n
          WHERE n.session_id = t.session_id
            AND n.created_at > t.created_at
        )
      ORDER BY t.created_at DESC
    `,
    [
      memberId,
      idleDays,
    ],
  );

  return rows;
}

/**
 * Which of these session ids belong to this member (active or
 * not)? Lower-case text.
 */
async function findOwnedSessionIds(
  memberId,
  sessionIds,
) {
  const ids = (sessionIds || []).filter(isUuid);

  if (ids.length === 0) {
    return [];
  }

  const { rows } = await db.query(
    `
      SELECT DISTINCT session_id
      FROM refresh_tokens
      WHERE member_id = $1
        AND session_id = ANY($2::uuid[])
    `,
    [
      memberId,
      ids,
    ],
  );

  return sessionIdsOf(rows);
}

/**
 * Every browser / IP pair this member has signed in from,
 * leaving out one session (the sign-in being checked).
 *
 * recent = it was used within the last `days` days.
 *
 * Used by the "New sign-in" alert. No rows at all means this
 * is the very first login of the account.
 */
async function listKnownDevices(
  memberId,
  excludeSessionId,
  days,
) {
  const { rows } = await db.query(
    `
      SELECT
        user_agent,
        ip_address,
        MAX(created_at) > NOW() - make_interval(days => $3) AS recent
      FROM refresh_tokens
      WHERE member_id = $1
        AND session_id IS DISTINCT FROM $2::uuid
      GROUP BY user_agent, ip_address
    `,
    [
      memberId,
      excludeSessionId,
      days,
    ],
  );

  return rows;
}

/**
 * Rotate one refresh-token generation.
 *
 * The new token stays inside the same session.
 */
async function rotateRefreshToken(
  oldJti,
  {
    newJti,
    newExpiresAt,
  },
) {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `
        SELECT *
        FROM refresh_tokens
        WHERE jti = $1
          AND revoked_at IS NULL
          AND expires_at > NOW()
        FOR UPDATE
      `,
      [
        hashJti(oldJti),
      ],
    );

    const old = rows[0];

    if (!old) {
      await client.query("ROLLBACK");
      return null;
    }

    /*
     * Revoke old token.
     */
    await client.query(
      `
        UPDATE refresh_tokens
        SET
          revoked_at = NOW(),
          replaced_by = $2,
          revoke_reason = COALESCE(
            revoke_reason,
            'rotated'
          )
        WHERE jti = $1
      `,
      [
        hashJti(oldJti),
        hashJti(newJti),
      ],
    );

    /*
     * New token belongs to the SAME session.
     */
    const result = await client.query(
      `
        INSERT INTO refresh_tokens (
          member_id,
          session_id,
          jti,
          expires_at,
          user_agent,
          ip_address
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `,
      [
        old.member_id,
        old.session_id,
        hashJti(newJti),
        newExpiresAt,
        old.user_agent,
        old.ip_address,
      ],
    );

    await client.query("COMMIT");

    return result.rows[0];
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  createRefreshToken,
  findRefreshTokenByJti,
  findValidRefreshToken,
  revokeRefreshToken,
  revokeRefreshSession,
  revokeAllRefreshTokensForMember,
  revokeSessionsForMember,
  revokeOtherSessionsForMember,
  isSessionActive,
  listActiveSessions,
  findOwnedSessionIds,
  listKnownDevices,
  rotateRefreshToken,
};
