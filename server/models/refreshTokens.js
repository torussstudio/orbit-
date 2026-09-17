const crypto = require("crypto");
const db = require("../db");

function hashJti(jti) {
  if (!jti) return null;

  return crypto
    .createHash("sha256")
    .update(jti)
    .digest("hex");
}

async function createRefreshToken({
  memberId,
  jti,
  expiresAt,
  userAgent = null,
  ipAddress = null,
}) {
  const hashedJti =
    hashJti(jti);

  const { rows } =
    await db.query(
      `
        INSERT INTO refresh_tokens (
          member_id,
          jti,
          expires_at,
          user_agent,
          ip_address
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
      [
        memberId,
        hashedJti,
        expiresAt,
        userAgent,
        ipAddress,
      ],
    );

  return rows[0];
}

async function findRefreshTokenByJti(
  jti,
) {
  const { rows } =
    await db.query(
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

async function findValidRefreshToken(
  jti,
) {
  const { rows } =
    await db.query(
      `
        SELECT *
        FROM refresh_tokens
        WHERE jti = $1
          AND revoked_at IS NULL
          AND expires_at > NOW()
        LIMIT 1
      `,
      [hashJti(jti)],
    );

  return rows[0] || null;
}

async function revokeRefreshToken(
  jti,
  reason = null,
) {
  const { rows } =
    await db.query(
      `
        UPDATE refresh_tokens
        SET
          revoked_at = NOW(),
          revoke_reason =
            COALESCE($2, revoke_reason)
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

async function revokeAllRefreshTokensForMember(
  memberId,
  reason = "logout_all",
) {
  const { rows } =
    await db.query(
      `
        UPDATE refresh_tokens
        SET
          revoked_at = NOW(),
          revoke_reason =
            COALESCE($2, revoke_reason)
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

async function rotateRefreshToken(
  oldJti,
  {
    newJti,
    newExpiresAt,
  },
) {
  const client =
    await db.connect();

  try {
    await client.query(
      "BEGIN",
    );

    /*
     * Lock the old session.
     *
     * This prevents two requests from
     * simultaneously rotating the same token.
     */
    const { rows } =
      await client.query(
        `
          SELECT *
          FROM refresh_tokens
          WHERE jti = $1
            AND revoked_at IS NULL
            AND expires_at > NOW()
          FOR UPDATE
        `,
        [hashJti(oldJti)],
      );

    const old = rows[0];

    if (!old) {
      await client.query(
        "ROLLBACK",
      );

      return null;
    }

    /*
     * Revoke old session.
     */
    await client.query(
      `
        UPDATE refresh_tokens
        SET
          revoked_at = NOW(),
          replaced_by = $2,
          revoke_reason =
            COALESCE(
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
     * Create new session.
     */
    const result =
      await client.query(
        `
          INSERT INTO refresh_tokens (
            member_id,
            jti,
            expires_at,
            user_agent,
            ip_address
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5
          )
          RETURNING *
        `,
        [
          old.member_id,
          hashJti(newJti),
          newExpiresAt,
          old.user_agent,
          old.ip_address,
        ],
      );

    await client.query(
      "COMMIT",
    );

    return result.rows[0];
  } catch (err) {
    await client.query(
      "ROLLBACK",
    );

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
  revokeAllRefreshTokensForMember,
  rotateRefreshToken,
};