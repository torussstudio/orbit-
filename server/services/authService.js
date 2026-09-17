const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("../db");

const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  verifyAccessToken,
  computeRefreshExpiry,
} = require("../utils/jwt");

const {
  createRefreshToken,
  findValidRefreshToken,
  revokeRefreshToken,
  revokeAllRefreshTokensForMember,
  rotateRefreshToken,
  findRefreshTokenByJti,
} = require("../models/refreshTokens");

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    skills: row.skills,
    phone: row.phone || null,
    location: row.location || null,
    bio: row.bio || null,
    birthday: row.birthday || null,
    avatar_url: row.avatar_url || null,
  };
}

function authError(message, status = 401) {
  const err = new Error(message);

  err.status = status;
  err.expose = true;

  return err;
}

async function loginWithPassword({
  email,
  password,
  userAgent,
  ipAddress,
}) {
  const { rows } = await db.query(
    `
      SELECT *
      FROM members
      WHERE email = $1
        AND active = true
      LIMIT 1
    `,
    [email],
  );

  const member = rows[0];

  if (!member) {
    throw authError("Invalid credentials");
  }

  const valid = await bcrypt.compare(
    password,
    member.password_hash,
  );

  if (!valid) {
    throw authError("Invalid credentials");
  }

  const user = publicUser(member);

  /*
   * Short-lived access token.
   */
  const accessToken =
    signAccessToken(user);

  /*
   * Random refresh-token identifier.
   * The raw JTI is never stored in DB.
   */
  const refreshJti =
    crypto.randomUUID();

  const refreshToken =
    signRefreshToken(
      user,
      refreshJti,
    );

  const refreshExpiresAt =
    computeRefreshExpiry();

  if (!refreshExpiresAt) {
    throw authError(
      "Server refresh expiry misconfigured",
      500,
    );
  }

  await createRefreshToken({
    memberId: user.id,

    jti: refreshJti,

    expiresAt: refreshExpiresAt,

    userAgent,

    ipAddress,
  });

 return {
  accessToken,
  refreshToken,
};
}

async function refreshSession({
  refreshToken,
  userAgent,
  ipAddress,
}) {
  if (!refreshToken) {
    throw authError(
      "Not authenticated",
    );
  }

  let payload;

  try {
    payload =
      verifyRefreshToken(
        refreshToken,
      );
  } catch (err) {
    throw authError(
      "Invalid refresh token",
    );
  }

  const jti = payload?.jti;
  const memberId = payload?.sub;

  if (
    payload?.type !== "refresh" ||
    !jti ||
    !memberId
  ) {
    throw authError(
      "Invalid refresh token",
    );
  }

  /*
   * Find active DB session.
   */
  const session =
    await findValidRefreshToken(
      jti,
    );

  /*
   * Refresh-token reuse detection.
   */
  if (!session) {
    const stale =
      await findRefreshTokenByJti(
        jti,
      );

    if (
      stale?.revoked_at &&
      stale?.replaced_by
    ) {
      await revokeAllRefreshTokensForMember(
        memberId,
        "refresh_token_reuse",
      );
    }

    throw authError(
      "Refresh token revoked or expired",
    );
  }

  /*
   * IMPORTANT:
   *
   * Do NOT reject a valid refresh token merely
   * because the client's IP changed.
   *
   * Mobile networks/VPN/proxies can legitimately
   * change IP addresses.
   *
   * IP and User-Agent remain useful audit data.
   */

  if (
    session.member_id &&
    String(session.member_id) !==
      String(memberId)
  ) {
    await revokeRefreshToken(
      jti,
      "member_mismatch",
    );

    throw authError(
      "Invalid refresh session",
    );
  }

  /*
   * Verify member still exists and is active.
   */
  const { rows } = await db.query(
    `
      SELECT
        id,
        name,
        email,
        role,
        skills,
        active,
        phone,
        location,
        bio,
        birthday,
        avatar_url
      FROM members
      WHERE id = $1
      LIMIT 1
    `,
    [memberId],
  );

  const member = rows[0];

  if (!member || !member.active) {
    await revokeRefreshToken(
      jti,
      "user_inactive_or_missing",
    );

    throw authError(
      "User not found",
    );
  }

  const user =
    publicUser(member);

  /*
   * New short-lived access token.
   */
  const accessToken =
    signAccessToken(user);

  /*
   * New refresh session.
   */
  const newJti =
    crypto.randomUUID();

  const refreshExpiresAt =
    computeRefreshExpiry();

  if (!refreshExpiresAt) {
    throw authError(
      "Server refresh expiry misconfigured",
      500,
    );
  }

  /*
   * Atomic rotation.
   *
   * Old JTI:
   * revoked
   *
   * New JTI:
   * active
   */
  const rotated =
    await rotateRefreshToken(
      jti,
      {
        newJti,
        newExpiresAt:
          refreshExpiresAt,
      },
    );

  if (!rotated) {
    /*
     * Another request may have rotated
     * the token before this request.
     */
    throw authError(
      "Refresh token revoked or expired",
    );
  }

  const refreshTokenOut =
    signRefreshToken(
      user,
      newJti,
    );

  return {
    accessToken,
    refreshToken:
      refreshTokenOut,
    rotated: true,
  };
}

async function logoutSession({
  refreshToken,
  bearerToken,
}) {
  /*
   * Preferred path:
   * revoke current refresh session.
   */
  if (refreshToken) {
    try {
      const payload =
        verifyRefreshToken(
          refreshToken,
        );

      if (
        payload?.type === "refresh" &&
        payload?.jti
      ) {
        await revokeRefreshToken(
          payload.jti,
          "logout",
        );

        return;
      }
    } catch (_) {
      /*
       * If refresh token is invalid/expired,
       * continue and try access token.
       */
    }
  }

  /*
   * Fallback:
   * revoke all sessions for this member.
   */
  if (bearerToken) {
    try {
      const payload =
        verifyAccessToken(
          bearerToken,
        );

      const memberId =
        payload?.sub;

      if (memberId) {
        await revokeAllRefreshTokensForMember(
          memberId,
          "logout_all",
        );
      }
    } catch (_) {
      /*
       * Logout should remain idempotent.
       */
    }
  }
}

async function getProfile(memberId) {
  const { rows } = await db.query(
    `
      SELECT
        id,
        name,
        email,
        role,
        skills,
        phone,
        location,
        bio,
        birthday,
        avatar_url
      FROM members
      WHERE id = $1
      LIMIT 1
    `,
    [memberId],
  );

  return rows[0] || null;
}

async function updateProfile(
  memberId,
  body,
) {
  const {
    name,
    email,
    phone,
    location,
    bio,
    password,
    avatar_base64,
  } = body;

  const {
    rows: current,
  } = await db.query(
    `
      SELECT *
      FROM members
      WHERE id = $1
      LIMIT 1
    `,
    [memberId],
  );

  if (!current[0]) {
    throw authError(
      "User not found",
      404,
    );
  }

  const updates = [];
  const values = [];

  let idx = 1;

  if (name !== undefined) {
    updates.push(`name = $${idx++}`);
    values.push(name);
  }

  if (email !== undefined) {
    updates.push(`email = $${idx++}`);
    values.push(
      String(email)
        .trim()
        .toLowerCase(),
    );
  }

  if (phone !== undefined) {
    updates.push(`phone = $${idx++}`);
    values.push(phone || null);
  }

  if (location !== undefined) {
    updates.push(
      `location = $${idx++}`,
    );
    values.push(location || null);
  }

  if (bio !== undefined) {
    updates.push(`bio = $${idx++}`);
    values.push(bio || null);
  }

  if (avatar_base64) {
    updates.push(
      `avatar_url = $${idx++}`,
    );
    values.push(avatar_base64);
  }

  /*
   * Password change:
   * revoke all refresh sessions.
   */
  let passwordChanged = false;

  if (password) {
    const hash =
      await bcrypt.hash(
        password,
        12,
      );

    updates.push(
      `password_hash = $${idx++}`,
    );

    values.push(hash);

    passwordChanged = true;
  }

  if (updates.length === 0) {
    return publicUser(
      current[0],
    );
  }

  values.push(memberId);

  const { rows } =
    await db.query(
      `
        UPDATE members
        SET ${updates.join(", ")}
        WHERE id = $${idx}
        RETURNING
          id,
          name,
          email,
          role,
          phone,
          location,
          bio,
          avatar_url,
          skills,
          birthday
      `,
      values,
    );

  /*
   * Password change invalidates all
   * existing refresh sessions.
   */
  if (passwordChanged) {
    await revokeAllRefreshTokensForMember(
      memberId,
      "password_changed",
    );
  }

  return publicUser(
    rows[0],
  );
}

async function deleteAccount(
  memberId,
) {
  await revokeAllRefreshTokensForMember(
    memberId,
    "account_deleted",
  );

  await db.query(
    "DELETE FROM members WHERE id = $1",
    [memberId],
  );
}

module.exports = {
  loginWithPassword,
  refreshSession,
  logoutSession,
  getProfile,
  updateProfile,
  deleteAccount,
};