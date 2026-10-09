/*
 * Short in-process cache for the session check in the auth middleware
 * (middleware/auth.js). Without it every request would run "does this
 * access token's session still have an active refresh token?" before its
 * handler.
 *
 * - SESSION_CACHE_TTL_SECONDS: how long an entry is trusted. Default 30.
 *   0 turns the cache off (every request reads the database).
 * - Only active sessions are stored. A session that is revoked, expired or
 *   unknown is never cached, so a refused request is always re-checked.
 * - Bounded: at most MAX_ENTRIES sessions; the oldest entry is dropped first.
 * - Cleared the moment a session is revoked: every revoke in
 *   models/refreshTokens.js clears the sessions it touched (logout, sign out
 *   one device, sign out other devices, log out everywhere, password change,
 *   account delete, refresh-token reuse), so the revoked device is refused on
 *   its very next request.
 *
 * In memory, per Node process. A revoke made directly in the database, or by
 * another Node process, is picked up when the entry expires (TTL).
 */

const DEFAULT_TTL_SECONDS = 30;
// Sessions are per browser tab, so there are more of them than members.
const MAX_ENTRIES = 5000;

// session id (lower case) -> { memberId (as text), expiresAt }
const entries = new Map();

function ttlMs() {
  const value = Number.parseInt(process.env.SESSION_CACHE_TTL_SECONDS, 10);
  const seconds =
    Number.isInteger(value) && value >= 0 ? value : DEFAULT_TTL_SECONDS;
  return seconds * 1000;
}

function keyOf(sessionId) {
  return String(sessionId).toLowerCase();
}

// True when this session was seen active for this member a moment ago.
function get(sessionId, memberId) {
  if (ttlMs() === 0 || !sessionId) return false;

  const key = keyOf(sessionId);
  const entry = entries.get(key);
  if (!entry) return false;

  if (entry.expiresAt <= Date.now()) {
    entries.delete(key);
    return false;
  }

  return entry.memberId === String(memberId);
}

function set(sessionId, memberId) {
  const ttl = ttlMs();
  if (ttl === 0 || !sessionId || memberId === undefined || memberId === null) {
    return;
  }

  const key = keyOf(sessionId);
  // Delete first, so the Map keeps entries in "last stored" order.
  entries.delete(key);
  entries.set(key, {
    memberId: String(memberId),
    expiresAt: Date.now() + ttl,
  });

  while (entries.size > MAX_ENTRIES) {
    entries.delete(entries.keys().next().value);
  }
}

function clear(sessionId) {
  if (sessionId === undefined || sessionId === null) return;
  entries.delete(keyOf(sessionId));
}

function clearMany(sessionIds) {
  if (!Array.isArray(sessionIds)) return;
  for (const sessionId of sessionIds) clear(sessionId);
}

// Every session of one member (log out everywhere, account deleted).
function clearMember(memberId) {
  if (memberId === undefined || memberId === null) return;

  const wanted = String(memberId);
  for (const [key, entry] of entries) {
    if (entry.memberId === wanted) entries.delete(key);
  }
}

function clearAll() {
  entries.clear();
}

function size() {
  return entries.size;
}

module.exports = {
  get,
  set,
  clear,
  clearMany,
  clearMember,
  clearAll,
  size,
  MAX_ENTRIES,
};
