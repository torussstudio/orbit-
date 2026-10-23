"use strict";

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("../db");

const {
  normalizeEmail,
  assertPasswordLength,
  httpError,
} = require("../utils/accountRules");

const {
  revokeAllRefreshTokensForMember,
} = require("../models/refreshTokens");

const {
  removeAllPushSubscriptionsForMember,
} = require("./notificationService");

const liveEvents = require("./liveEvents");
const { deliverPush } = require("../utils/pushNotify");
const { createMailTransport, escapeHtml } = require("../utils/mailer");

/*
 * FORGOT PASSWORD (Login page -> "Forgot password?")
 *
 * 1. requestReset(): a 6-digit code is made for an active
 *    member and sent by email (Toruss mailbox) and as a push
 *    to every device the member is still signed in on.
 * 2. resetPassword(): the code + a new password. On success
 *    the password is changed and every session is signed out.
 *
 * Rules:
 * - Only an HMAC of the code is stored, never the code.
 * - A code works once, for RESET_CODE_MINUTES (default 10).
 * - A new code closes the member's older codes.
 * - 5 wrong tries close the code.
 * - One code per member per 60 s, at most 5 per hour.
 * - The caller always answers the same way for unknown,
 *   inactive and known emails (see authController).
 * - The code is never written to the logs.
 */

const MAX_ATTEMPTS = 5;
const RESEND_GAP_SECONDS = 60;
const MAX_CODES_PER_HOUR = 5;

const INVALID_CODE_MESSAGE =
  "Invalid or expired code. Use the latest code we sent, or request a new one.";

const TOO_MANY_ATTEMPTS_MESSAGE =
  "Too many wrong attempts. Request a new code.";

const LOG = "[password-reset]";

/*
 * Minutes a code stays valid. RESET_CODE_MINUTES, 5 to 30,
 * default 10.
 */
function codeMinutes() {
  const value = Number.parseInt(process.env.RESET_CODE_MINUTES, 10);

  return Number.isInteger(value) && value >= 5 && value <= 30
    ? value
    : 10;
}

function codeSecret() {
  return (
    process.env.RESET_CODE_SECRET ||
    process.env.JWT_REFRESH_SECRET ||
    process.env.JWT_SECRET ||
    "orbit-reset-code"
  );
}

// Tied to the member, so the same code for two members
// never gives the same hash.
function hashCode(memberId, code) {
  return crypto
    .createHmac("sha256", codeSecret())
    .update(`${memberId}:${code}`)
    .digest("hex");
}

function sameHash(a, b) {
  const left = Buffer.from(String(a || ""), "hex");
  const right = Buffer.from(String(b || ""), "hex");

  return left.length === right.length && left.length > 0
    ? crypto.timingSafeEqual(left, right)
    : false;
}

function makeCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

async function findActiveMember(email) {
  const { rows } = await db.query(
    `
      SELECT id, name, email
      FROM members
      WHERE LOWER(email) = $1
        AND active = true
      ORDER BY id
      LIMIT 1
    `,
    [email],
  );

  return rows[0] || null;
}

function istTime(date = new Date()) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/*
 * Sending. Kept on an object so tests can swap them out.
 */
const delivery = {
  async sendCodeEmail(member, code, minutes) {
    const mail = createMailTransport();

    if (!mail) {
      throw new Error("MAIL_PASS is not set");
    }

    const name = escapeHtml(member.name || "there");

    await mail.transport.sendMail({
      from: `Orbit <${mail.from}>`,
      to: member.email,
      subject: `${code} is your Orbit password reset code`,
      text:
        `Hi ${member.name || "there"},\n\n` +
        `Your Orbit password reset code is: ${code}\n\n` +
        `It is valid for ${minutes} minutes and works once. ` +
        `If you asked for more than one code, only the latest one works.\n\n` +
        `Didn't ask for this? Ignore this email. Your password stays the same.`,
      html:
        `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172554;max-width:560px;margin:auto">` +
        `<h2>Reset your Orbit password</h2>` +
        `<p>Hi ${name},</p>` +
        `<p>Use this code to set a new password:</p>` +
        `<p style="font-size:30px;font-weight:bold;letter-spacing:8px;font-family:monospace;background:#eef2ff;border-radius:10px;padding:14px 20px;display:inline-block;margin:4px 0">${code}</p>` +
        `<p>It is valid for ${minutes} minutes and works once. If you asked for more than one code, only the latest one works.</p>` +
        `<p style="color:#64748b;font-size:13px">Didn't ask for this? Ignore this email. Your password stays the same.</p>` +
        `</div>`,
    });
  },

  async sendCodePush(member, code, minutes) {
    await deliverPush(
      member.id,
      "🔐 Orbit password reset code",
      `${code} · valid for ${minutes} min. Didn't ask for it? Ignore this.`,
      { type: "password_reset", url: "/" },
    );
  },

  async sendChangedEmail(member) {
    const mail = createMailTransport();

    if (!mail) return;

    const when = istTime();
    const name = escapeHtml(member.name || "there");

    await mail.transport.sendMail({
      from: `Orbit <${mail.from}>`,
      to: member.email,
      subject: "Your Orbit password was changed",
      text:
        `Hi ${member.name || "there"},\n\n` +
        `Your Orbit password was changed on ${when} (IST) using a reset code. ` +
        `You were signed out on every device.\n\n` +
        `If this wasn't you, contact your Orbit administrator right away.`,
      html:
        `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172554;max-width:560px;margin:auto">` +
        `<h2>Your password was changed</h2>` +
        `<p>Hi ${name},</p>` +
        `<p>Your Orbit password was changed on <b>${escapeHtml(when)} (IST)</b> using a reset code. You were signed out on every device.</p>` +
        `<p><b>If this wasn't you</b>, contact your Orbit administrator right away.</p>` +
        `</div>`,
    });
  },
};

/*
 * STEP 1: make and send a code.
 *
 * Never throws for "no such member" or a limit: it returns
 * { sent: false, reason } and the caller still answers the
 * same way. Returns { sent: true, email, push } otherwise.
 */
async function requestReset({ email, ipAddress = null }) {
  const cleanEmail = normalizeEmail(email);

  if (!cleanEmail) {
    return { sent: false, reason: "no_email" };
  }

  // Housekeeping: codes older than a day are never needed.
  await db
    .query(
      `DELETE FROM password_reset_codes
       WHERE created_at < NOW() - INTERVAL '1 day'`,
    )
    .catch((err) => {
      console.error(`${LOG} cleanup failed:`, err.message);
    });

  const member = await findActiveMember(cleanEmail);

  if (!member) {
    return { sent: false, reason: "unknown" };
  }

  const code = makeCode();
  const minutes = codeMinutes();
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    // One request per member at a time, so two quick clicks
    // cannot both pass the limits below.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      [`orbit-password-reset:${member.id}`],
    );

    const { rows: [recent] } = await client.query(
      `
        SELECT
          COUNT(*)::int AS last_hour,
          COALESCE(
            MAX(created_at) > NOW() - make_interval(secs => $2),
            false
          ) AS too_soon
        FROM password_reset_codes
        WHERE member_id = $1
          AND created_at > NOW() - INTERVAL '1 hour'
      `,
      [member.id, RESEND_GAP_SECONDS],
    );

    if (recent.too_soon || recent.last_hour >= MAX_CODES_PER_HOUR) {
      await client.query("ROLLBACK");

      return {
        sent: false,
        reason: recent.too_soon ? "too_soon" : "hourly_limit",
      };
    }

    // Older codes stop working (used_at = closed).
    await client.query(
      `UPDATE password_reset_codes
       SET used_at = NOW()
       WHERE member_id = $1 AND used_at IS NULL`,
      [member.id],
    );

    await client.query(
      `
        INSERT INTO password_reset_codes
          (member_id, code_hash, expires_at, requested_ip)
        VALUES
          ($1, $2, NOW() + make_interval(mins => $3), $4)
      `,
      [member.id, hashCode(member.id, code), minutes, ipAddress],
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  const [emailResult, pushResult] = await Promise.allSettled([
    delivery.sendCodeEmail(member, code, minutes),
    delivery.sendCodePush(member, code, minutes),
  ]);

  const emailOk = emailResult.status === "fulfilled";
  const pushOk = pushResult.status === "fulfilled";

  if (!emailOk) {
    console.error(
      `${LOG} email to member ${member.id} failed:`,
      emailResult.reason?.message,
    );
  }

  if (!pushOk) {
    console.error(
      `${LOG} push to member ${member.id} failed:`,
      pushResult.reason?.message,
    );
  }

  console.log(
    `${LOG} code issued for member ${member.id} (email ${emailOk ? "sent" : "failed"})`,
  );

  return { sent: true, email: emailOk, push: pushOk };
}

/*
 * STEP 2: check the code and set the new password.
 *
 * Throws 400 with a member-friendly message when the code is
 * wrong, expired, closed or out of tries, or the password is
 * too short. A too-short password does not use up a try.
 */
async function resetPassword({ email, code, password }) {
  assertPasswordLength(password);

  const cleanEmail = normalizeEmail(email);
  const cleanCode = String(code ?? "").replace(/\s+/g, "");

  if (!cleanEmail || !/^\d{6}$/.test(cleanCode)) {
    throw httpError(INVALID_CODE_MESSAGE, 400);
  }

  const member = await findActiveMember(cleanEmail);

  if (!member) {
    throw httpError(INVALID_CODE_MESSAGE, 400);
  }

  const client = await db.connect();
  let passwordChanged = false;
  let outOfTries = false;

  try {
    await client.query("BEGIN");

    const { rows: [row] } = await client.query(
      `
        SELECT id, code_hash, attempts, expires_at <= NOW() AS expired
        FROM password_reset_codes
        WHERE member_id = $1
          AND used_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE
      `,
      [member.id],
    );

    if (!row || row.expired) {
      await client.query("ROLLBACK");
      throw httpError(INVALID_CODE_MESSAGE, 400);
    }

    if (row.attempts >= MAX_ATTEMPTS) {
      await client.query("ROLLBACK");
      throw httpError(TOO_MANY_ATTEMPTS_MESSAGE, 400);
    }

    if (!sameHash(row.code_hash, hashCode(member.id, cleanCode))) {
      const { rows: [updated] } = await client.query(
        `UPDATE password_reset_codes
         SET attempts = attempts + 1
         WHERE id = $1
         RETURNING attempts`,
        [row.id],
      );

      await client.query("COMMIT");

      outOfTries = updated.attempts >= MAX_ATTEMPTS;
    } else {
      const passwordHash = await bcrypt.hash(String(password), 10);

      await client.query(
        "UPDATE members SET password_hash = $1 WHERE id = $2",
        [passwordHash, member.id],
      );

      await client.query(
        `UPDATE password_reset_codes
         SET used_at = NOW()
         WHERE member_id = $1 AND used_at IS NULL`,
        [member.id],
      );

      await client.query("COMMIT");
      passwordChanged = true;
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  if (!passwordChanged) {
    throw httpError(
      outOfTries ? TOO_MANY_ATTEMPTS_MESSAGE : INVALID_CODE_MESSAGE,
      400,
    );
  }

  /*
   * Same as a password change with no session to keep
   * (authService.updateProfile): every session is signed out,
   * their push subscriptions go and their live streams close.
   * Those sessions are told "signed out from another device".
   */
  try {
    await revokeAllRefreshTokensForMember(member.id, "password_changed");
    await removeAllPushSubscriptionsForMember(member.id);
  } finally {
    liveEvents.accessChanged(member.id, "password changed");
  }

  console.log(`${LOG} password changed for member ${member.id}`);

  delivery.sendChangedEmail(member).catch((err) => {
    console.error(`${LOG} confirmation email failed:`, err.message);
  });

  return { success: true };
}

module.exports = {
  requestReset,
  resetPassword,
  // For tests.
  _delivery: delivery,
  _hashCode: hashCode,
  MAX_ATTEMPTS,
  INVALID_CODE_MESSAGE,
  TOO_MANY_ATTEMPTS_MESSAGE,
};
