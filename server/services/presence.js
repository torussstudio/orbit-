'use strict';

/*
 * Online / last seen for the chats.
 *
 * Online   = the person has Orbit open in a visible tab. That is exactly
 *            when the browser keeps its live stream open (useLiveEvents.js
 *            closes it while the tab is hidden), so eventBus already knows.
 * Last seen = when their last stream closed, saved in members.last_seen_at.
 *
 * A short grace period stops "offline" flicker on a page reload or a quick
 * tab switch. Changes go out as a "presence.changed" event that carries only
 * the person's id; clients then ask GET /api/messages/presence.
 *
 * Needs LIVE_EVENTS_ENABLED=true (no streams, no presence).
 */

const db = require('../db');
const eventBus = require('./eventBus');

const OFFLINE_GRACE_MS = 10 * 1000;
const MAX_IDS = 100;
const pendingOffline = new Map(); // userId -> timer

function broadcast(userId) {
  eventBus.publish(eventBus.connectedUserIds(), {
    type: 'presence.changed',
    userId,
    at: new Date().toISOString(),
  });
}

function saveLastSeen(userId) {
  db.query('UPDATE members SET last_seen_at = NOW() WHERE id = $1', [userId])
    .catch((err) => console.error('[presence] saving last seen failed:', err?.message));
}

eventBus.onPresence((userId, online) => {
  const key = String(userId);
  if (online) {
    const timer = pendingOffline.get(key);
    if (timer) {
      // Back within the grace period (reload, quick tab switch): no change.
      clearTimeout(timer);
      pendingOffline.delete(key);
      return;
    }
    saveLastSeen(key); // also right if the server stops while they are online
    broadcast(key);
    return;
  }
  const timer = setTimeout(() => {
    pendingOffline.delete(key);
    if (eventBus.isOnline(key)) return;
    saveLastSeen(key);
    broadcast(key);
  }, OFFLINE_GRACE_MS);
  if (typeof timer.unref === 'function') timer.unref();
  pendingOffline.set(key, timer);
});

const isOnlineNow = (id) => eventBus.isOnline(id) || pendingOffline.has(String(id));

/*
 * { presence: { "<id>": { online, last_seen_at } }, admins_online }
 * ids: active members to look up. team: also count the admins online (the
 * member's "Admin team" chat header).
 */
async function getPresence(user, rawIds, team) {
  if (!user?.id) throw Object.assign(new Error('Sign in first.'), { status: 401 });
  const ids = [...new Set(String(rawIds || '').split(',').map((id) => id.trim()).filter(Boolean))].slice(0, MAX_IDS);
  const presence = {};
  if (ids.length) {
    const { rows } = await db.query(
      `SELECT id, last_seen_at FROM members WHERE id::text = ANY($1::text[]) AND active = true`,
      [ids],
    );
    for (const row of rows) {
      presence[String(row.id)] = { online: isOnlineNow(row.id), last_seen_at: row.last_seen_at };
    }
  }
  let adminsOnline = 0;
  if (team) {
    const { rows } = await db.query(`SELECT id FROM members WHERE role = 'manager' AND active = true`);
    adminsOnline = rows.filter((row) => String(row.id) !== String(user.id) && isOnlineNow(row.id)).length;
  }
  return { presence, admins_online: adminsOnline };
}

module.exports = { getPresence, isOnlineNow };
