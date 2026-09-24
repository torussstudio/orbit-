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
  revokeRefreshSession,
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

function authError(
  message,
  status = 401,
) {
  const err = new Error(message);

  err.status = status;
  err.expose = true;

  return err;
}

/**
 * LOGIN
 *
 * Every successful login creates a completely
 * independent browser session.
 */
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
    throw authError(
      "Invalid credentials",
    );
  }

  const valid = await bcrypt.compare(
    password,
    member.password_hash,
  );

  if (!valid) {
    throw authError(
      "Invalid credentials",
    );
  }

  const user = publicUser(member);

  /*
   * One session per browser tab/window.
   */
  const sessionId =
    crypto.randomUUID();

  /*
   * One refresh-token generation.
   */
  const refreshJti =
    crypto.randomUUID();

  const accessToken =
    signAccessToken(
      user,
      sessionId,
    );

  const refreshToken =
    signRefreshToken(
      user,
      refreshJti,
      sessionId,
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
    sessionId,
    jti: refreshJti,
    expiresAt: refreshExpiresAt,
    userAgent,
    ipAddress,
  });

  return {
    accessToken,
    refreshToken,
    sessionId,
    user,
  };
}

/**
 * REFRESH
 */
async function refreshSession({
  refreshToken,
  sessionId,
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
  } catch (_) {
    throw authError(
      "Invalid refresh token",
    );
  }

  const jti = payload?.jti;
  const memberId = payload?.sub;
  const tokenSessionId =
    payload?.sid;

  if (
    payload?.type !== "refresh" ||
    !jti ||
    !memberId ||
    !tokenSessionId
  ) {
    throw authError(
      "Invalid refresh token",
    );
  }

  /*
   * The session ID supplied by the browser
   * must match the session ID inside the JWT.
   */
  if (
    !sessionId ||
    String(sessionId) !==
      String(tokenSessionId)
  ) {
    throw authError(
      "Invalid refresh session",
    );
  }

  /*
   * Find the exact active refresh generation
   * belonging to this browser session.
   */
  const session =
    await findValidRefreshToken(
      jti,
      sessionId,
    );

  /*
   * Refresh-token reuse detection.
   *
   * IMPORTANT:
   * Only revoke the affected session.
   */
  if (!session) {
    const stale =
      await findRefreshTokenByJti(
        jti,
      );

    if (
      stale?.revoked_at &&
      stale?.replaced_by &&
      stale?.session_id
    ) {
      await revokeRefreshSession(
        stale.session_id,
        "refresh_token_reuse",
      );
    }

    throw authError(
      "Refresh token revoked or expired",
    );
  }

  /*
   * Database session must belong to
   * the same member and session.
   */
  if (
    String(session.member_id) !==
      String(memberId) ||
    String(session.session_id) !==
      String(sessionId)
  ) {
    await revokeRefreshSession(
      session.session_id,
      "session_mismatch",
    );

    throw authError(
      "Invalid refresh session",
    );
  }

  /*
   * Do NOT reject merely because IP changed.
   *
   * IP/UA remain audit information.
   */

  /*
   * Verify member is still active.
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
    await revokeRefreshSession(
      sessionId,
      "user_inactive_or_missing",
    );

    throw authError(
      "User not found",
    );
  }

  const user =
    publicUser(member);

  /*
   * Same session ID.
   */
  const accessToken =
    signAccessToken(
      user,
      sessionId,
    );

  /*
   * New refresh generation.
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
   * old JTI -> revoked
   * new JTI -> active
   * same sessionId
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
    throw authError(
      "Refresh token revoked or expired",
    );
  }

  const refreshTokenOut =
    signRefreshToken(
      user,
      newJti,
      sessionId,
    );

  return {
    accessToken,
    refreshToken:
      refreshTokenOut,
    sessionId,
    user,
    rotated: true,
  };
}

/**
 * LOGOUT CURRENT SESSION ONLY
 */
async function logoutSession({
  refreshToken,
  bearerToken,
  sessionId,
}) {
  /*
   * Preferred:
   * sessionId is explicitly supplied by the
   * current browser tab.
   */
  if (sessionId) {
    await revokeRefreshSession(
      sessionId,
      "logout",
    );

    return;
  }

  /*
   * Fallback for old clients:
   * derive session from refresh JWT.
   */
  if (refreshToken) {
    try {
      const payload =
        verifyRefreshToken(
          refreshToken,
        );

      if (
        payload?.type === "refresh" &&
        payload?.sid
      ) {
        await revokeRefreshSession(
          payload.sid,
          "logout",
        );

        return;
      }

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
       * Continue to bearer fallback.
       */
    }
  }

  /*
   * IMPORTANT:
   *
   * Do NOT revoke all sessions here.
   *
   * Old clients that have neither sessionId nor
   * valid refresh token simply get an idempotent
   * logout response.
   */
  if (bearerToken) {
    try {
      verifyAccessToken(
        bearerToken,
      );
    } catch (_) {
      /*
       * Logout remains idempotent.
       */
    }
  }
}

/**
 * Explicit "logout all devices".
 */
async function logoutAllSessions(
  memberId,
) {
  await revokeAllRefreshTokensForMember(
    memberId,
    "logout_all",
  );
}

async function getProfile(
  memberId,
) {
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
    updates.push(
      `name = $${idx++}`,
    );

    values.push(name);
  }

  if (email !== undefined) {
    updates.push(
      `email = $${idx++}`,
    );

    values.push(
      String(email)
        .trim()
        .toLowerCase(),
    );
  }

  if (phone !== undefined) {
    updates.push(
      `phone = $${idx++}`,
    );

    values.push(
      phone || null,
    );
  }

  if (location !== undefined) {
    updates.push(
      `location = $${idx++}`,
    );

    values.push(
      location || null,
    );
  }

  if (bio !== undefined) {
    updates.push(
      `bio = $${idx++}`,
    );

    values.push(
      bio || null,
    );
  }

  if (avatar_base64) {
    updates.push(
      `avatar_url = $${idx++}`,
    );

    values.push(
      avatar_base64,
    );
  }

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
   * Password change intentionally logs
   * the user out from every session.
   *
   * This is different from normal logout.
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
  logoutAllSessions,
  getProfile,
  updateProfile,
  deleteAccount,
};