"use strict";

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const db = require("../db");
const liveEvents = require("./liveEvents");
const { createNotification } = require("../utils/pushNotify");
const { normalizeEmail, assertPasswordLength, assertEmailAvailable, isEmailUniqueViolation, emailTakenError } = require("../utils/accountRules");

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const httpError = (message, status = 400) => Object.assign(new Error(message), { status, expose: true });

function mailTransport() {
  const user = process.env.SMTP_USER || process.env.MAIL_USER || "admin@toruss.agency";
  const pass = process.env.MAIL_PASS || process.env.SMTP_PASSWORD || process.env.SMTP_PASS || process.env.MAIL_PASSWORD;
  if (!pass) throw httpError("Invitation email is not configured. Set MAIL_PASS for the Toruss mailbox.", 503);
  const port = Number(process.env.MAIL_PORT || process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;
  return {
    from: process.env.MAIL_FROM || process.env.SMTP_FROM || "admin@toruss.agency",
    transport: nodemailer.createTransport({
      host: process.env.MAIL_HOST || process.env.SMTP_HOST || "toruss-mailserver",
      port,
      secure,
      requireTLS: !secure,
      auth: { user, pass },
      connectionTimeout: 12000,
      greetingTimeout: 12000,
      socketTimeout: 20000,
    }),
  };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

async function createInvitation({ name, email: rawEmail, password, role = "member" }, createdBy) {
  const cleanName = String(name || "").trim();
  const email = normalizeEmail(rawEmail);
  if (!cleanName || cleanName.length > 255) throw httpError("Enter a valid member name.");
  if (!email) throw httpError("Enter a valid email address.");
  if (!['member', 'manager'].includes(role)) throw httpError("Choose a valid role.");
  assertPasswordLength(password);
  await assertEmailAvailable(email);
  await db.query("UPDATE member_invitations SET status='expired' WHERE LOWER(email)=$1 AND status='pending' AND expires_at <= NOW()", [email]);

  const { from, transport } = mailTransport();
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const passwordHash = await bcrypt.hash(password, 10);
  let rows;
  try {
    ({ rows } = await db.query(
      `INSERT INTO member_invitations (name,email,password_hash,role,token_hash,created_by,expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [cleanName, email, passwordHash, role, hashToken(token), createdBy, expiresAt],
    ));
  } catch (err) {
    if (err.code === "23505") throw httpError("An open invitation already exists for this email address.", 409);
    throw err;
  }
  const invitationId = rows[0].id;
  const baseUrl = (process.env.APP_PUBLIC_URL || process.env.FRONTEND_URL || "https://orbit.toruss.agency").replace(/\/$/, "");
  const inviteUrl = `${baseUrl}/invite/${token}`;
  const htmlName = escapeHtml(cleanName);
  try {
    await transport.sendMail({
      from: `Orbit <${from}>`,
      to: email,
      subject: "Your invitation to Orbit",
      text: `Hi ${cleanName},\n\nYou have been invited to join Orbit. Accept this invitation within 7 days: ${inviteUrl}\n\nYour password is not included in this email. Contact your Orbit administrator for your sign-in password.`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172554;max-width:560px;margin:auto"><h2>Join Orbit</h2><p>Hi ${htmlName},</p><p>You have been invited to join your team in Orbit.</p><p><a href="${inviteUrl}" style="display:inline-block;background:#625df5;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none">Accept invitation</a></p><p>This link expires in 7 days. Your password is not included in this email. Contact your Orbit administrator for your sign-in password.</p></div>`,
    });
  } catch (err) {
    await db.query("DELETE FROM member_invitations WHERE id=$1", [invitationId]);
    console.error("[member-invitation] email delivery failed:", err.message);
    throw httpError("Could not send the invitation email. Check the Toruss mailserver settings and try again.", 502);
  }
  return { success: true, message: "Invitation email sent." };
}

async function getInvitation(token) {
  if (typeof token !== "string" || token.length < 30 || token.length > 100) throw httpError("This invitation link is invalid or expired.", 404);
  const { rows } = await db.query(
    `SELECT name,email,status,expires_at FROM member_invitations WHERE token_hash=$1 LIMIT 1`,
    [hashToken(token)],
  );
  const invitation = rows[0];
  if (!invitation || invitation.status !== "pending" || new Date(invitation.expires_at) <= new Date()) {
    throw httpError("This invitation link is invalid, expired, or already used.", 410);
  }
  return { name: invitation.name, email: invitation.email, expires_at: invitation.expires_at };
}

async function acceptInvitation(token) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT * FROM member_invitations WHERE token_hash=$1 FOR UPDATE`,
      [hashToken(token)],
    );
    const invitation = rows[0];
    if (!invitation || invitation.status !== "pending" || new Date(invitation.expires_at) <= new Date()) {
      throw httpError("This invitation link is invalid, expired, or already used.", 410);
    }
    await client.query("UPDATE member_invitations SET status='accepted',accepted_at=NOW() WHERE id=$1", [invitation.id]);
    const { rows: managers } = await client.query("SELECT id FROM members WHERE active=true AND role='manager'");
    await client.query("COMMIT");
    await Promise.all(managers.map(({ id }) => createNotification(id, "New member awaiting approval", `${invitation.name} accepted an Orbit invitation.`, {
      type: "member_invitation", eventKey: `member-invitation:${invitation.id}:accepted`, entityId: invitation.id, entityType: "member_invitation", url: "/members",
    })));
    return { success: true, message: "Thanks. Your request is waiting for manager approval." };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function listPendingInvitations() {
  const { rows } = await db.query(
    `SELECT i.id,i.name,i.email,i.role,i.created_at,i.accepted_at,i.expires_at,m.name AS invited_by
     FROM member_invitations i LEFT JOIN members m ON m.id=i.created_by
     WHERE i.status='accepted' ORDER BY i.accepted_at ASC`,
  );
  return rows;
}

async function decideInvitation(id, managerId, decision) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM member_invitations WHERE id=$1 FOR UPDATE", [id]);
    const invitation = rows[0];
    if (!invitation || invitation.status !== "accepted") throw httpError("This approval request is no longer pending.", 409);
    if (decision === "reject") {
      await client.query("UPDATE member_invitations SET status='rejected',password_hash='!revoked!',decided_at=NOW(),decided_by=$2 WHERE id=$1", [id, managerId]);
      await client.query("COMMIT");
      return { success: true, status: "rejected" };
    }
    const { rows: inserted } = await client.query(
      `INSERT INTO members (name,email,password_hash,role,birthday,skills,onboarding_pending)
       VALUES ($1,$2,$3,$4,$5,$6,true)
       RETURNING id,name,email,role,birthday,skills,active,created_at,avatar_url`,
      [invitation.name, invitation.email, invitation.password_hash, invitation.role, invitation.birthday, invitation.skills || []],
    );
    await client.query("UPDATE member_invitations SET status='approved',password_hash='!transferred!',decided_at=NOW(),decided_by=$2 WHERE id=$1", [id, managerId]);
    await client.query("COMMIT");
    liveEvents.memberChanged(inserted[0].id);
    try {
      const { from, transport } = mailTransport();
      await transport.sendMail({
        from: `Orbit <${from}>`,
        to: invitation.email,
        subject: "Your Orbit account is approved",
        text: `Hi ${invitation.name},\n\nYour Orbit account has been approved. You can now sign in at ${process.env.APP_PUBLIC_URL || process.env.FRONTEND_URL || "https://orbit.toruss.agency"} using the password shared with you by your administrator.`,
      });
    } catch (mailErr) {
      console.error("[member-invitation] approval email failed:", mailErr.message);
    }
    return { success: true, status: "approved", member: inserted[0] };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (isEmailUniqueViolation(err)) throw emailTakenError();
    throw err;
  } finally {
    client.release();
  }
}

async function completeOnboarding(memberId) {
  const { rows } = await db.query(
    `UPDATE members SET onboarding_pending=false WHERE id=$1 RETURNING id`,
    [memberId],
  );
  return { success: Boolean(rows[0]) };
}

module.exports = { createInvitation, getInvitation, acceptInvitation, listPendingInvitations, decideInvitation, completeOnboarding };
