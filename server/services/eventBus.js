/*
 * In-memory live event bus (Server-Sent Events).
 *
 * Orbit runs as ONE Node process in one container, so a plain Map is enough:
 * no Redis, no LISTEN/NOTIFY. If the app is ever scaled to more than one
 * process, events published in one process will not reach clients connected
 * to another, and this needs a shared bus.
 *
 * OFF unless LIVE_EVENTS_ENABLED=true. When off, nothing connects and
 * publish() does nothing.
 *
 * An event only says WHAT changed, never the content:
 *   { type, taskId, projectId, at }
 * Clients refetch through the normal (permission-checked) endpoints.
 *
 * A stream never outlives the user's access:
 *   - it closes itself when the access token it was opened with expires
 *     ("stream.expired"; the browser reconnects with a fresh token), and
 *   - closeUser() ends every stream of a user whose access changed
 *     ("stream.revoked"; the browser does not reconnect), and
 *   - closeSession() / closeSessions() end only the streams opened with
 *     the given sessions (signed out from another device, password
 *     changed elsewhere), also with "stream.revoked". The user's other
 *     streams stay open.
 */

const MAX_CONNECTIONS_PER_USER = 5;
const HEARTBEAT_MS = 25 * 1000;

// Used only if a token somehow carries no expiry: the default access token
// lifetime (15 minutes).
const FALLBACK_LIFETIME_MS = 15 * 60 * 1000;
// Longest delay setTimeout accepts (about 24.8 days).
const MAX_TIMER_MS = 2147483647;

// userId (string) -> Set of open responses. A Set keeps insertion order, so
// the first entry is always the oldest connection.
const connections = new Map();

// res -> heartbeat timer
const heartbeats = new Map();

// res -> timer that closes the stream when its access token expires
const expiryTimers = new Map();

// res -> { userId, sessionId }: the session (sid of the access token) each
// stream was opened with, so one session's streams can be closed on their own.
const streamSessions = new Map();

function isEnabled() {
  return process.env.LIVE_EVENTS_ENABLED === "true";
}

function removeConnection(userId, res) {
  const key = String(userId);

  const timer = heartbeats.get(res);
  if (timer) {
    clearInterval(timer);
    heartbeats.delete(res);
  }

  const expiryTimer = expiryTimers.get(res);
  if (expiryTimer) {
    clearTimeout(expiryTimer);
    expiryTimers.delete(res);
  }

  streamSessions.delete(res);

  const set = connections.get(key);
  if (!set) return;

  set.delete(res);
  if (set.size === 0) connections.delete(key);
}

// Removes the connection and ends the response. Safe to call more than once.
function closeConnection(userId, res) {
  removeConnection(userId, res);
  try {
    if (!res.writableEnded) res.end();
  } catch (_) {
    // Socket already gone.
  }
}

// Writes to one connection. A failed write drops that connection.
function safeWrite(userId, res, chunk) {
  try {
    if (res.writableEnded || res.destroyed) {
      removeConnection(userId, res);
      return false;
    }
    res.write(chunk);
    return true;
  } catch (_) {
    closeConnection(userId, res);
    return false;
  }
}

// A control message for the browser side of one stream. Same four fields as
// every other event.
function controlMessage(type) {
  return `data: ${JSON.stringify({
    type,
    taskId: null,
    projectId: null,
    at: new Date().toISOString(),
  })}\n\n`;
}

/*
 * Registers an open SSE response for a user and starts its heartbeat.
 * Returns a cleanup function (idempotent) for the route to call on close.
 *
 * tokenExp: expiry of the access token the stream was opened with, in
 * seconds since 1970 (the `exp` of the token the auth middleware already
 * verified). At that moment the stream gets "stream.expired" and is closed.
 *
 * sessionId: the `sid` of that same access token. Kept so closeSession()
 * can end this stream when that one session is revoked.
 */
function addConnection(userId, res, { tokenExp, sessionId } = {}) {
  const key = String(userId);

  let set = connections.get(key);
  if (!set) {
    set = new Set();
    connections.set(key, set);
  }

  // Over the limit: close the oldest one(s) first.
  while (set.size >= MAX_CONNECTIONS_PER_USER) {
    const oldest = set.values().next().value;
    // Tell that tab why it is being closed, so it falls back to polling
    // instead of reconnecting and pushing out another tab.
    safeWrite(key, oldest, controlMessage("stream.evicted"));
    closeConnection(key, oldest);
    // closeConnection may have removed the (now empty) Set from the Map.
    if (!connections.has(key)) {
      set = new Set();
      connections.set(key, set);
    }
  }

  set.add(res);

  if (sessionId) {
    streamSessions.set(res, {
      userId: key,
      sessionId: String(sessionId).toLowerCase(),
    });
  }

  // SSE comment line: ignored by clients, keeps proxies from closing an
  // idle connection and lets us notice dead sockets.
  const timer = setInterval(() => {
    safeWrite(key, res, ": ping\n\n");
  }, HEARTBEAT_MS);
  // Never keep the process alive just for a heartbeat.
  if (typeof timer.unref === "function") timer.unref();
  heartbeats.set(res, timer);

  // The stream ends when the access token it was opened with expires.
  const exp = Number(tokenExp);
  const lifetimeMs = Number.isFinite(exp) && exp > 0
    ? exp * 1000 - Date.now()
    : FALLBACK_LIFETIME_MS;

  const expiryTimer = setTimeout(() => {
    // Not an error: the browser reconnects with a fresh token.
    safeWrite(key, res, controlMessage("stream.expired"));
    closeConnection(key, res);
  }, Math.min(Math.max(lifetimeMs, 0), MAX_TIMER_MS));
  if (typeof expiryTimer.unref === "function") expiryTimer.unref();
  expiryTimers.set(res, expiryTimer);

  return () => removeConnection(key, res);
}

/*
 * Ends every open stream of one user, after sending "stream.revoked".
 * Call it after the database change is committed, when the user's access
 * changed (deactivated, deleted, role changed, password changed, logged out
 * everywhere). `reason` is only for the server log.
 * Never throws. Returns how many streams were closed.
 */
function closeUser(userId, reason) {
  try {
    if (userId === undefined || userId === null) return 0;

    const key = String(userId);
    const set = connections.get(key);
    if (!set || set.size === 0) return 0;

    let closed = 0;
    for (const res of [...set]) {
      safeWrite(key, res, controlMessage("stream.revoked"));
      closeConnection(key, res);
      closed += 1;
    }

    console.log(
      `[eventBus] closed ${closed} stream(s) of member ${key}: ${reason || "access changed"}`,
    );

    return closed;
  } catch (err) {
    console.error("[eventBus] closeUser failed:", err?.message);
    return 0;
  }
}

/*
 * Ends only the streams that were opened with one of these sessions, after
 * sending "stream.revoked". Call it after the sessions are revoked in the
 * database (signed out from another device, "sign out all other devices",
 * own password change). Streams of the same user on other sessions, such as
 * the one that asked for the revoke, are left open. `reason` is only for the
 * server log.
 * Never throws. Returns how many streams were closed.
 */
function closeSessions(sessionIds, reason) {
  try {
    if (!Array.isArray(sessionIds) || sessionIds.length === 0) return 0;
    if (streamSessions.size === 0) return 0;

    const wanted = new Set(
      sessionIds
        .filter((id) => id !== undefined && id !== null)
        .map((id) => String(id).toLowerCase()),
    );
    if (wanted.size === 0) return 0;

    let closed = 0;
    // Copy: closing a stream removes its entry from the Map while we loop.
    for (const [res, stream] of [...streamSessions]) {
      if (!wanted.has(stream.sessionId)) continue;

      safeWrite(stream.userId, res, controlMessage("stream.revoked"));
      closeConnection(stream.userId, res);
      closed += 1;
    }

    if (closed > 0) {
      console.log(
        `[eventBus] closed ${closed} stream(s) of ${wanted.size} revoked session(s): ${reason || "session revoked"}`,
      );
    }

    return closed;
  } catch (err) {
    console.error("[eventBus] closeSessions failed:", err?.message);
    return 0;
  }
}

// One session. See closeSessions().
function closeSession(sessionId, reason) {
  return closeSessions([sessionId], reason);
}

// Ids taken from a URL arrive as text ("42"), ids read from the database as
// numbers (42). Send numeric ids as numbers every time; other ids (UUIDs)
// are left as they are.
function normalizeId(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return value;
}

/*
 * Sends one event to every open connection of the given users.
 * Never throws, and does nothing when the feature is off.
 */
function publish(userIds, event) {
  try {
    if (!isEnabled()) return;
    if (!Array.isArray(userIds) || userIds.length === 0 || !event) return;
    if (connections.size === 0) return;

    // Only these four fields ever leave the server (no titles, names, text).
    const payload = JSON.stringify({
      type: String(event.type || "unknown"),
      taskId: normalizeId(event.taskId),
      projectId: normalizeId(event.projectId),
      at: event.at || new Date().toISOString(),
    });
    const chunk = `data: ${payload}\n\n`;

    const seen = new Set();
    for (const id of userIds) {
      if (id === null || id === undefined) continue;
      const key = String(id);
      if (seen.has(key)) continue;
      seen.add(key);

      const set = connections.get(key);
      if (!set) continue;

      // Copy: a failed write removes entries from the Set while we loop.
      for (const res of [...set]) {
        safeWrite(key, res, chunk);
      }
    }
  } catch (err) {
    console.error("[eventBus] publish failed:", err?.message);
  }
}

function hasConnections() {
  return connections.size > 0;
}

// For health checks and tests: how many users / connections are open.
function stats() {
  let total = 0;
  const perUser = {};
  for (const [key, set] of connections) {
    perUser[key] = set.size;
    total += set.size;
  }
  return { users: connections.size, connections: total, perUser };
}

module.exports = {
  MAX_CONNECTIONS_PER_USER,
  HEARTBEAT_MS,
  isEnabled,
  addConnection,
  removeConnection,
  closeConnection,
  closeUser,
  closeSession,
  closeSessions,
  publish,
  hasConnections,
  stats,
};
