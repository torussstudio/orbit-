'use strict';

/*
 * "Delivered" state for both chats (grey ✓✓).
 *
 *   ✓        sent: the recipient is logged out of Orbit everywhere
 *   ✓✓ grey  delivered: the recipient was logged in (has an active
 *            session) when it was sent, or has logged in / opened Orbit since
 *   ✓✓ blue  seen: the recipient opened the chat (the existing read state)
 *
 * Logged in = at least one session (refresh token) that is not revoked and
 * not expired, the same rule the auth code uses for an active session.
 * Delivery is stored per person and conversation, separately from reads,
 * so delivering never marks anything as read.
 */

const db = require('../db');

// The given members that are logged in on at least one device right now.
async function activeMemberIds(memberIds) {
  const ids = [...new Set((memberIds || []).filter((id) => id !== null && id !== undefined).map(String))];
  if (!ids.length) return [];
  const { rows } = await db.query(
    `SELECT DISTINCT member_id
       FROM refresh_tokens
      WHERE member_id::text = ANY($1::text[])
        AND revoked_at IS NULL
        AND expires_at > NOW()`,
    [ids],
  );
  return rows.map((row) => row.member_id);
}

// In-memory throttle: "this person's Orbit is open" is checked at most
// every few seconds per person (the app runs as one Node process).
const lastMark = new Map();
function shouldMark(key, gapMs = 5000) {
  const now = Date.now();
  if (now - (lastMark.get(key) || 0) < gapMs) return false;
  lastMark.set(key, now);
  if (lastMark.size > 5000) {
    for (const [k, t] of lastMark) if (now - t > 10 * 60_000) lastMark.delete(k);
  }
  return true;
}

module.exports = { activeMemberIds, shouldMark };
