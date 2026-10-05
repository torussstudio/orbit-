/*
 * Short in-process cache for the member lookup in the auth middleware
 * (middleware/auth.js). Without it every request runs
 * "SELECT id, role, active FROM members WHERE id = $1" before its handler.
 *
 * - AUTH_CACHE_TTL_SECONDS: how long an entry is trusted. Default 30.
 *   0 turns the cache off (every request reads the database, as before).
 * - Only active members that exist are stored. A missing or inactive member
 *   is never cached, so a refused request is always re-checked.
 * - Bounded: at most MAX_ENTRIES members; the oldest entry is dropped first.
 * - Cleared for one member by liveEvents.accessChanged() (deactivated,
 *   deleted, role changed, password changed, logged out everywhere), so
 *   those take effect on the member's very next request.
 *
 * In memory, per Node process. A change made directly in the database, or by
 * another Node process, is picked up when the entry expires (TTL).
 */

const DEFAULT_TTL_SECONDS = 30;
const MAX_ENTRIES = 1000;

// member id (as text) -> { member: { id, role, active }, expiresAt }
const entries = new Map();

function ttlMs() {
  const value = Number.parseInt(process.env.AUTH_CACHE_TTL_SECONDS, 10);
  const seconds =
    Number.isInteger(value) && value >= 0 ? value : DEFAULT_TTL_SECONDS;
  return seconds * 1000;
}

function get(memberId) {
  if (ttlMs() === 0) return null;

  const key = String(memberId);
  const entry = entries.get(key);
  if (!entry) return null;

  if (entry.expiresAt <= Date.now()) {
    entries.delete(key);
    return null;
  }

  return entry.member;
}

function set(member) {
  const ttl = ttlMs();
  if (ttl === 0 || !member || !member.active) return;

  const key = String(member.id);
  // Delete first, so the Map keeps entries in "last stored" order.
  entries.delete(key);
  entries.set(key, {
    member: { id: member.id, role: member.role, active: member.active },
    expiresAt: Date.now() + ttl,
  });

  while (entries.size > MAX_ENTRIES) {
    entries.delete(entries.keys().next().value);
  }
}

function clear(memberId) {
  if (memberId === undefined || memberId === null) return;
  entries.delete(String(memberId));
}

function clearAll() {
  entries.clear();
}

function size() {
  return entries.size;
}

module.exports = { get, set, clear, clearAll, size, MAX_ENTRIES };
