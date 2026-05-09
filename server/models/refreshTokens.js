const db = require("../db");

async function createRefreshToken({
  memberId,
  jti,
  expiresAt,
  userAgent = null,
  ipAddress = null,
}) {
  const { rows } = await db.query(
    `
      INSERT INTO refresh_tokens (member_id, jti, expires_at, user_agent, ip_address)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
    [memberId, jti, expiresAt, userAgent, ipAddress],
  );
  return rows[0];
}

async function findRefreshTokenByJti(jti) {
  const { rows } = await db.query(
    `SELECT * FROM refresh_tokens WHERE jti = $1 LIMIT 1`,
    [jti],
  );
  return rows[0] || null;
}

async function findValidRefreshToken(jti) {
  const { rows } = await db.query(
    `
      SELECT *
      FROM refresh_tokens
      WHERE jti = $1
        AND revoked_at IS NULL
        AND expires_at > NOW()
      LIMIT 1
    `,
    [jti],
  );
  return rows[0] || null;
}

async function revokeRefreshToken(jti, reason = null) {
  const { rows } = await db.query(
    `
      UPDATE refresh_tokens
      SET revoked_at = NOW(),
          revoke_reason = COALESCE($2, revoke_reason)
      WHERE jti = $1
      RETURNING *
    `,
    [jti, reason],
  );
  return rows[0] || null;
}

async function revokeAllRefreshTokensForMember(memberId, reason = "logout_all") {
  const { rows } = await db.query(
    `
      UPDATE refresh_tokens
      SET revoked_at = NOW(),
          revoke_reason = COALESCE($2, revoke_reason)
      WHERE member_id = $1
        AND revoked_at IS NULL
      RETURNING *
    `,
    [memberId, reason],
  );
  return rows;
}

async function rotateRefreshToken(oldJti, { newJti, newExpiresAt }) {
  // Mark the old token as revoked and link to the new one (rotation).
  // Then insert the new token row.
  const old = await findRefreshTokenByJti(oldJti);
  if (!old) return null;

  await db.query(
    `
      UPDATE refresh_tokens
      SET revoked_at = NOW(),
          replaced_by = $2,
          revoke_reason = COALESCE(revoke_reason, 'rotated')
      WHERE jti = $1
    `,
    [oldJti, newJti],
  );

  return createRefreshToken({
    memberId: old.member_id,
    jti: newJti,
    expiresAt: newExpiresAt,
    userAgent: old.user_agent,
    ipAddress: old.ip_address,
  });
}

module.exports = {
  createRefreshToken,
  findRefreshTokenByJti,
  findValidRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokensForMember,
  rotateRefreshToken,
};

