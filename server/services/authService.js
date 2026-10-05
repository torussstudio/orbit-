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

const {
  normalizeEmail,
  assertPasswordLength,
  assertEmailAvailable,
  isEmailUniqueViolation,
  emailTakenError,
  isLastActiveManager,
  deleteMemberRecord,
} = require("../utils/accountRules");

const liveEvents = require("./liveEvents");
const { keepStoredDate } = require("../utils/dateInput");

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

/*
 * Compared against when the email doesn't exist, so a failed login
 * takes the same time whether or not the account is real (no user
 * enumeration by timing). Same cost factor as real hashes.
 */
const DUMMY_PASSWORD_HASH =
  bcrypt.hashSync(crypto.randomBytes(16).toString("hex"), 12);

/*
 * Avatars are stored inline as data URLs and rendered as <img src>
 * for every user. Only accept base64 image data URLs (what the
 * browser's FileReader produces) — no remote URLs, no SVG.
 *
 * The client shrinks a chosen photo to about 256 px before upload
 * (AccountSettings.jsx), which gives a data URL of roughly 10-40 KB.
 * Anything longer than AVATAR_MAX_LENGTH is refused: these photos are
 * sent inside list responses (members, dashboard), so a large one
 * slows those pages down for everyone.
 */
const AVATAR_DATA_URL_PATTERN =
  /^data:image\/(?!svg)[a-z0-9.+-]+;base64,[A-Za-z0-9+/]+=*$/i;

// Length of the whole data URL in characters (about 110 KB of image).
const AVATAR_MAX_LENGTH = 150 * 1024;

function isValidAvatarDataUrl(value) {
  return (
    typeof value === "string" &&
    AVATAR_DATA_URL_PATTERN.test(value)
  );
}

function isAvatarTooLarge(value) {
  return value.length > AVATAR_MAX_LENGTH;
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
  /*
   * Case-insensitive, so members whose stored email has capital
   * letters can still log in (the controller lowercases the input).
   */
  const { rows } = await db.query(
    `
      SELECT *
      FROM members
      WHERE LOWER(email) = $1
        AND active = true
      ORDER BY id
      LIMIT 1
    `,
    [normalizeEmail(email)],
  );

  const member = rows[0];

  // Always run bcrypt, even for unknown emails, so response time
  // doesn't reveal which emails have accounts.
  const valid = await bcrypt.compare(
    String(password),
    member?.password_hash || DUMMY_PASSWORD_HASH,
  );

  if (!member || !valid) {
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

  /*
   * Sessions are revoked: end the
   * member's live streams too.
   */
  liveEvents.accessChanged(
    memberId,
    "logged out everywhere",
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
    birthday,
    password,
    current_password,
    avatar_base64,
    remove_avatar,
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

  const newEmail =
    normalizeEmail(email);

  /*
   * The client always sends the email,
   * so compare it (ignoring case) to see
   * whether it really changed.
   */
  const emailChanged =
    newEmail !== undefined &&
    newEmail !==
      normalizeEmail(current[0].email);

  if (password) {
    assertPasswordLength(password);
  }

  /*
   * Changing the password or the email
   * needs the current password.
   *
   * 400, not 401: the client treats 401
   * as an expired session.
   */
  if (password || emailChanged) {
    if (!current_password) {
      throw authError(
        "Please enter your current password.",
        400,
      );
    }

    const currentPasswordValid =
      await bcrypt.compare(
        String(current_password),
        current[0].password_hash,
      );

    if (!currentPasswordValid) {
      throw authError(
        "Current password is incorrect",
        400,
      );
    }
  }

  if (emailChanged) {
    await assertEmailAvailable(
      newEmail,
      memberId,
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

    values.push(newEmail);
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

  /*
   * A birthday sent back exactly as the API
   * returned it is left as stored (see
   * utils/dateInput.js).
   */
  if (!keepStoredDate(birthday, current[0].birthday)) {
    updates.push(
      `birthday = $${idx++}`,
    );

    values.push(
      birthday || null,
    );
  }

  /*
   * remove_avatar: true clears this member's
   * own photo (NULL, the same as a member who
   * never added one). The member id comes
   * from the session, never from the body.
   * Removing when there is no photo writes
   * nothing.
   */
  if (remove_avatar === true && avatar_base64) {
    throw authError(
      "Choose a new photo or remove the current one, not both.",
      400,
    );
  }

  if (remove_avatar === true && current[0].avatar_url) {
    updates.push(
      `avatar_url = $${idx++}`,
    );

    values.push(null);
  }

  if (avatar_base64) {
    if (!isValidAvatarDataUrl(avatar_base64)) {
      throw authError(
        "Profile photo must be an image file.",
        400,
      );
    }

    if (isAvatarTooLarge(avatar_base64)) {
      throw authError(
        "Profile photo is too large. Please choose a smaller photo.",
        400,
      );
    }

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

  let rows;

  try {
    ({ rows } =
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
      ));
  } catch (err) {
    if (isEmailUniqueViolation(err)) {
      throw emailTakenError();
    }

    throw err;
  }

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

    /*
     * Sessions are revoked: end the
     * member's live streams too.
     */
    liveEvents.accessChanged(
      memberId,
      "password changed",
    );
  }

  return publicUser(
    rows[0],
  );
}

const LAST_MANAGER_MESSAGE =
  "You are the only active manager. Make another member a manager before deleting this account.";

const ACCOUNT_LINKED_MESSAGE =
  "This account is still linked to projects, tasks or comments and cannot be deleted. Ask another manager to deactivate it.";

/*
 * DELETE OWN ACCOUNT
 *
 * One transaction (see deleteMemberRecord):
 * last-active-manager block, the user's own
 * notifications, then the member. If the
 * delete fails, nothing changes and the user
 * keeps their sessions.
 *
 * `pool` is the db pool by default
 * (a stub can be passed in tests).
 */
async function deleteAccount(
  memberId,
  pool = db,
) {
  await deleteMemberRecord(
    memberId,
    {
      lastManagerMessage:
        LAST_MANAGER_MESSAGE,
      linkedMessage:
        ACCOUNT_LINKED_MESSAGE,
    },
    pool,
  );

  /*
   * Refresh tokens are removed with the
   * member (ON DELETE CASCADE); this is
   * only a safety net.
   */
  await revokeAllRefreshTokensForMember(
    memberId,
    "account_deleted",
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
  isLastActiveManager,
};