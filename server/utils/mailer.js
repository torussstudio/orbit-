"use strict";

const nodemailer = require("nodemailer");

/*
 * Mail transport for the Toruss mailbox.
 *
 * Same settings as the member invitation email
 * (services/memberInvitationService.js), so no new env is
 * needed: MAIL_HOST / MAIL_PORT / MAIL_USER / MAIL_PASS /
 * MAIL_FROM (or their SMTP_* names).
 *
 * Returns null when MAIL_PASS is not set, so callers can
 * decide what to do without a throw.
 */
function createMailTransport() {
  const user =
    process.env.SMTP_USER ||
    process.env.MAIL_USER ||
    "admin@toruss.agency";

  const pass =
    process.env.MAIL_PASS ||
    process.env.SMTP_PASSWORD ||
    process.env.SMTP_PASS ||
    process.env.MAIL_PASSWORD;

  if (!pass) return null;

  const port = Number(process.env.MAIL_PORT || process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  return {
    from:
      process.env.MAIL_FROM ||
      process.env.SMTP_FROM ||
      "admin@toruss.agency",

    transport: nodemailer.createTransport({
      host:
        process.env.MAIL_HOST ||
        process.env.SMTP_HOST ||
        "toruss-mailserver",
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
  return String(value).replace(
    /[&<>"']/g,
    (ch) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[ch],
  );
}

module.exports = {
  createMailTransport,
  escapeHtml,
};
