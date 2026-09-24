const crypto = require("crypto");
const db = require("../db");

function hashJti(jti) {
  if (!jti) return null;

  return crypto
    .createHash("sha256")
    .update(jti)
    .digest("hex");
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
  rotateRefreshToken,
};