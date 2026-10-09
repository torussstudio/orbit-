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
  revokeSessionsForMember,
  revokeOtherSessionsForMember,
  listActiveSessions,
  findOwnedSessionIds,
  listKnownDevices,
  rotateRefreshToken,
  findRefreshTokenByJti,
} = require("../models/refreshTokens");

const {
  removePushSubscriptionsForSessions,
  removePushSubscriptionsOfOtherSessions,
  removeAllPushSubscriptionsForMember,
} = require("./notificationService");

const {
  isUuid,
  sameSession,
  parseDevice,
  normalizeIp,
  isPrivateIp,
} = require("../utils/sessionInfo");

const { createNotification } = require("../utils/pushNotify");

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

/*
 * ============================================================
 * SESSIONS (Account settings -> Active sessions)
 * ============================================================
 */

/*
 * Revoke reasons that mean "ended from somewhere else". A tab
 * whose session ended this way is told so when its refresh is
 * refused (code SESSION_REVOKED), and shows "You were signed
 * out from another device". Normal expiry and the member's
 * own logout get no code.
 */
const REVOKED_ELSEWHERE_REASONS = new Set([
  "revoked_by_user",
  "logout_others",
  "password_changed",
  "logout_all",
]);

// Most session ids accepted by one "revoke group" request.
const MAX_SESSIONS_PER_REQUEST = 50;

const DEFAULT_SESSION_IDLE_DAYS = 7;

/*
 * A session that has not refreshed for this many days is left
 * out of the Active sessions list (it is not revoked).
 * REFRESH_SESSION_IDLE_DAYS, default 7.
 */
function sessionIdleDays() {
  const value = Number.parseInt(
    process.env.REFRESH_SESSION_IDLE_DAYS,
    10,
  );

  return Number.isInteger(value) && value > 0
    ? value
    : DEFAULT_SESSION_IDLE_DAYS;
}

/*
 * A "New sign-in" alert is sent when the member has no session
 * in this many days with the same device label and IP.
 */
const NEW_SIGN_IN_LOOKBACK_DAYS = 30;

/*
 * Two addresses count as the same place when they are equal.
 * A private address (see isPrivateIp) is the reverse proxy's
 * own address, recorded while `trust proxy` was not yet right
 * for the deployment; it says nothing about the member, so it
 * matches anything. Without this, every member would get one
 * false alert the first time they log in after the proxy
 * setting is corrected.
 */
function sameIp(a, b) {
  return a === b || isPrivateIp(a) || isPrivateIp(b);
}

/*
 * NEW SIGN-IN ALERT
 *
 * Runs after a login, in the background. The caller does not
 * wait for it and ignores its failures, so it can never slow
 * down or fail a login.
 */
async function notifyNewSignIn({
  memberId,
  sessionId,
  userAgent,
  ipAddress,
}) {
  const devices = await listKnownDevices(
    memberId,
    sessionId,
    NEW_SIGN_IN_LOOKBACK_DAYS,
  );

  // The very first login of an account: nothing to compare with.
  if (devices.length === 0) {
    return null;
  }

  const { label } = parseDevice(userAgent);
  const ip = normalizeIp(ipAddress);

  const known = devices.some(
    (device) =>
      device.recent &&
      parseDevice(device.user_agent).label === label &&
      sameIp(normalizeIp(device.ip_address), ip),
  );

  if (known) {
    return null;
  }

  // One alert per session: the dedupe key is the session id.
  return createNotification(
    memberId,
    "🔐 New sign-in",
    ip ? `${label} · ${ip}` : label,
    {
      type: "new_sign_in",
      eventKey: `new-sign-in:${sessionId}`,
      url: "/account-settings",
    },
  );
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

  /*
   * "New sign-in" alert for a device / IP the member has not
   * used lately. Not awaited: it must never slow down or fail
   * the login.
   */
  notifyNewSignIn({
    memberId: user.id,
    sessionId,
    userAgent,
    ipAddress,
  }).catch((err) => {
    console.error(
      "[auth] new sign-in alert failed:",
      err?.message,
    );
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

    /*
     * This session was ended from another device (signed
     * out there, or the password was changed there). Same
     * 401 and message as any other refused refresh, plus a
     * code, so this tab can tell the member why it was
     * signed out. Old clients ignore the code.
     */
    if (
      stale &&
      REVOKED_ELSEWHERE_REASONS.has(
        stale.revoke_reason,
      )
    ) {
      const revokedError = authError(
        "Refresh token revoked or expired",
      );

      revokedError.code = "SESSION_REVOKED";

      throw revokedError;
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

/*
 * After a logout: remove the push subscriptions saved by that
 * session, so the signed-out browser stops getting pushes.
 *
 * The logout route has no logged-in user, so the member comes
 * from the rows the logout just revoked. Nothing revoked (an
 * unknown or already revoked session) means nothing to remove.
 *
 * Never throws: the session is already revoked, and a failed
 * clean-up must not turn the logout into an error.
 */
async function removePushAfterLogout(revokedRows) {
  try {
    const row = revokedRows.find(
      (revoked) => revoked.session_id,
    );

    if (!row) {
      return;
    }

    await removePushSubscriptionsForSessions(
      row.member_id,
      [String(row.session_id)],
    );
  } catch (err) {
    console.error(
      "[auth] push clean-up after logout failed:",
      err?.message,
    );
  }
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
    const revoked = await revokeRefreshSession(
      sessionId,
      "logout",
    );

    await removePushAfterLogout(revoked);

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
        const revoked = await revokeRefreshSession(
          payload.sid,
          "logout",
        );

        await removePushAfterLogout(revoked);

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
   * No device stays signed in, so none keeps
   * getting pushes. This also removes
   * subscriptions that have no session (saved
   * before they were linked to one).
   */
  await removeAllPushSubscriptionsForMember(
    memberId,
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

/**
 * ACTIVE SESSIONS of one member, for Account settings.
 *
 * A session is one browser tab (the client keeps it in
 * sessionStorage), so several tabs of one browser would show
 * as several entries. Sessions with the same device label and
 * IP are shown as one entry with a tab count.
 *
 * currentSessionId: the session of the request (the `sid` of
 * its verified access token). The entry that contains it gets
 * current: true and is listed first.
 */
async function listSessions(
  memberId,
  currentSessionId,
) {
  const idleDays = sessionIdleDays();

  const rows = await listActiveSessions(
    memberId,
    idleDays,
  );

  const groups = new Map();

  for (const row of rows) {
    const device = parseDevice(row.user_agent);
    const ip = normalizeIp(row.ip_address);
    const key = `${device.label}|${ip || ""}`;

    let group = groups.get(key);

    if (!group) {
      group = {
        deviceLabel: device.label,
        deviceType: device.type,
        ip,
        firstSeenAt: row.first_seen_at,
        lastActiveAt: row.last_active_at,
        tabCount: 0,
        sessionIds: [],
        current: false,
      };

      groups.set(key, group);
    }

    group.tabCount += 1;

    group.sessionIds.push(
      String(row.session_id).toLowerCase(),
    );

    if (
      row.first_seen_at &&
      new Date(row.first_seen_at) <
        new Date(group.firstSeenAt)
    ) {
      group.firstSeenAt = row.first_seen_at;
    }

    if (
      new Date(row.last_active_at) >
      new Date(group.lastActiveAt)
    ) {
      group.lastActiveAt = row.last_active_at;
    }

    if (
      sameSession(row.session_id, currentSessionId)
    ) {
      group.current = true;
    }
  }

  const sessions = [...groups.values()].sort(
    (a, b) =>
      Number(b.current) - Number(a.current) ||
      new Date(b.lastActiveAt) -
        new Date(a.lastActiveAt),
  );

  return {
    sessions,
    idleDays,
  };
}

/*
 * Revokes these sessions of the member, removes the push
 * subscriptions they saved, and ends their live streams.
 *
 * The push clean-up also runs when nothing was revoked just
 * now, so repeating a request that failed half-way still
 * finishes the job.
 *
 * Returns the session ids revoked just now.
 */
async function revokeOwnSessions(
  memberId,
  sessionIds,
  reason,
) {
  const revoked = await revokeSessionsForMember(
    memberId,
    sessionIds,
    reason,
  );

  await removePushSubscriptionsForSessions(
    memberId,
    sessionIds,
  );

  liveEvents.sessionsRevoked(revoked, reason);

  return revoked;
}

/**
 * SIGN OUT ONE SESSION (another device or tab).
 *
 * 404 unless it is an unrevoked session of this member, so
 * another member's session id tells the caller nothing. The
 * current session is refused: that is what logout is for.
 */
async function revokeSession(
  memberId,
  sessionId,
  currentSessionId,
) {
  if (!isUuid(sessionId)) {
    throw authError(
      "Session not found",
      404,
    );
  }

  if (sameSession(sessionId, currentSessionId)) {
    throw authError(
      "This is your current session. Use log out to end it.",
      400,
    );
  }

  const revoked = await revokeOwnSessions(
    memberId,
    [sessionId],
    "revoked_by_user",
  );

  if (revoked.length === 0) {
    throw authError(
      "Session not found",
      404,
    );
  }
}

/**
 * SIGN OUT ONE GROUPED ENTRY (all tabs of one device).
 *
 * Every id must belong to the member, otherwise 404 and
 * nothing is revoked. The current session is skipped if it is
 * in the list, and the response says so.
 */
async function revokeSessionGroup(
  memberId,
  sessionIds,
  currentSessionId,
) {
  if (
    !Array.isArray(sessionIds) ||
    sessionIds.length === 0 ||
    sessionIds.length > MAX_SESSIONS_PER_REQUEST ||
    !sessionIds.every(isUuid)
  ) {
    throw authError(
      "sessionIds must be a list of session ids",
      400,
    );
  }

  const ids = [
    ...new Set(
      sessionIds.map((id) => id.toLowerCase()),
    ),
  ];

  const owned = new Set(
    await findOwnedSessionIds(memberId, ids),
  );

  if (ids.some((id) => !owned.has(id))) {
    throw authError(
      "Session not found",
      404,
    );
  }

  const targets = ids.filter(
    (id) => !sameSession(id, currentSessionId),
  );

  const revoked =
    targets.length > 0
      ? await revokeOwnSessions(
          memberId,
          targets,
          "revoked_by_user",
        )
      : [];

  return {
    revoked,
    skippedCurrent: targets.length < ids.length,
  };
}

/**
 * SIGN OUT ALL OTHER DEVICES: every session of the member
 * except the current one, listed or not.
 */
async function logoutOtherSessions(
  memberId,
  currentSessionId,
) {
  if (!isUuid(currentSessionId)) {
    throw authError(
      "No current session",
      400,
    );
  }

  const revoked =
    await revokeOtherSessionsForMember(
      memberId,
      currentSessionId,
      "logout_others",
    );

  /*
   * Subscriptions without a session are kept here; only
   * "log out everywhere" and a password change remove those.
   */
  await removePushSubscriptionsOfOtherSessions(
    memberId,
    currentSessionId,
  );

  liveEvents.sessionsRevoked(
    revoked,
    "signed out from another device",
  );

  return {
    revoked,
  };
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

/*
 * currentSessionId: the session of the request (the `sid` of
 * its verified access token). A password change keeps that one
 * session signed in and ends all the others.
 */
async function updateProfile(
  memberId,
  body,
  { currentSessionId = null } = {},
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
   * Password change: every OTHER session is
   * signed out (its refresh tokens, its push
   * subscriptions and its live streams). The
   * session that made the change stays signed
   * in, so the member is not thrown out of the
   * device they are using.
   *
   * accessChanged() is not used here: it would
   * close this session's own stream too.
   */
  if (passwordChanged && isUuid(currentSessionId)) {
    const revoked =
      await revokeOtherSessionsForMember(
        memberId,
        currentSessionId,
        "password_changed",
      );

    /*
     * Also removes subscriptions that have no
     * session (saved before they were linked
     * to one).
     */
    await removePushSubscriptionsOfOtherSessions(
      memberId,
      currentSessionId,
      { includeLegacy: true },
    );

    /*
     * Clears the member's cached auth lookup
     * and ends the other sessions' streams.
     */
    liveEvents.passwordChanged(
      memberId,
      revoked,
    );
  } else if (passwordChanged) {
    /*
     * No session to keep (the auth middleware
     * always supplies one, so this is only a
     * fallback): sign out everywhere, as
     * before.
     */
    await revokeAllRefreshTokensForMember(
      memberId,
      "password_changed",
    );

    await removeAllPushSubscriptionsForMember(
      memberId,
    );

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

  /*
   * Same for the push subscriptions: they go
   * with the member, this is the safety net.
   */
  await removeAllPushSubscriptionsForMember(
    memberId,
  );
}

module.exports = {
  loginWithPassword,
  refreshSession,
  logoutSession,
  logoutAllSessions,
  listSessions,
  revokeSession,
  revokeSessionGroup,
  logoutOtherSessions,
  getProfile,
  updateProfile,
  deleteAccount,
  isLastActiveManager,
};