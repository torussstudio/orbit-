import { useEffect, useRef } from "react";
import api, { refreshAccessToken } from "../api/client";
import { getAccessToken } from "../api/tokenStore";
import { useAuth } from "../context/AuthContext";

/*
 * Live updates over Server-Sent Events (GET /api/events/stream).
 *
 * One stream per browser tab, shared by every component that uses it. The
 * stream is read with fetch + ReadableStream (not EventSource) so the access
 * token goes in the normal Authorization header, never in the URL.
 *
 * An event only says what changed: { type, taskId, projectId, at }.
 * Components react by calling their existing load function again.
 *
 * Fallback: if the server answers 204 (feature off) or the stream keeps
 * failing, subscribers get a "poll" event every 30 seconds while the tab is
 * visible, and the stream is tried again every 5 minutes.
 *
 * Hidden tab: the stream is closed. When the tab is visible again it
 * reconnects and subscribers get one "resync" event to catch up.
 *
 * The server never lets a stream outlive the user's access:
 * - "stream.expired": the access token this stream was opened with ran out.
 *   Not an error. Reconnect straight away with a fresh token (normal
 *   refresh flow), with no backoff and no polling.
 * - "stream.revoked": the user's access changed (deactivated, deleted, role
 *   changed, logged out everywhere), or this tab's session was ended from
 *   another device (signed out there, password changed there). Do not
 *   reconnect. One API call is made straight away: if the session is gone
 *   it gets 401 and the existing logout flow takes over.
 */

/* -------------------------------------------------------------------------- */
/* Event types                                                                */
/* -------------------------------------------------------------------------- */

// Sent by the client itself, never by the server.
export const LIVE_POLL = "poll";
export const LIVE_RESYNC = "resync";

const CATCH_UP = [LIVE_POLL, LIVE_RESYNC];

// Ready-made lists for subscribe() / useLiveRefetch().
export const TASK_EVENTS = [
  "task.created",
  "task.updated",
  "task.deleted",
  "comment.created",
  ...CATCH_UP,
];

export const PROJECT_EVENTS = [
  "project.created",
  "project.updated",
  "project.deleted",
  ...CATCH_UP,
];

export const TASK_AND_PROJECT_EVENTS = [...new Set([...TASK_EVENTS, ...PROJECT_EVENTS])];

// The bell keeps its own 30 s refresh, so it does not need "poll" / "resync".
export const NOTIFICATION_EVENTS = ["notification.created"];

// Sent by the server just before it closes this tab's stream (see
// eventBus.js): too many tabs for this user / the access token ran out /
// the user's access changed.
const EVICTED = "stream.evicted";
const EXPIRED = "stream.expired";
const REVOKED = "stream.revoked";

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

const STREAM_URL = `${(import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "")}/events/stream`;

const BACKOFF_MIN_MS = 1000;
const BACKOFF_MAX_MS = 30000;
const POLL_MS = 30000;
// While polling, how often to check whether the stream works again.
const STREAM_RETRY_MS = 5 * 60 * 1000;
// The server sends a heartbeat every 25 s. Nothing for this long = dead link.
const STALE_MS = 60000;
// A stream that stayed open at least this long counts as healthy.
const HEALTHY_MS = 30000;
// Failed attempts in a row before switching to polling.
const MAX_FAILURES = 5;

/* -------------------------------------------------------------------------- */
/* Connection manager (one per tab)                                           */
/* -------------------------------------------------------------------------- */

const subscribers = new Set();

let refs = 0; // components currently using the stream
let controller = null; // AbortController of the open / opening stream
let reconnectTimer = null;
let pollTimer = null;
let streamRetryTimer = null;
let staleTimer = null;
let attempt = 0; // backoff step
let failures = 0; // failed attempts in a row
let needResync = false; // subscribers may have missed events
let revoked = false; // the server ended our streams for good: stay closed

const isHidden = () => typeof document !== "undefined" && document.hidden;
const shouldRun = () => refs > 0 && !isHidden() && !revoked;

// Same test the API client uses to decide that the session is over (and
// not just a network problem).
const sessionEnded = (err) =>
  err?.response?.status === 401 || err?.message === "No active Orbit session";

// The session cannot be refreshed any more. No new UI here: make one normal
// API call, so the API client's existing 401 handling logs the user out
// exactly as it does everywhere else.
function endSession() {
  revoked = true;
  clearTimers();
  closeStream();
  api.get("/auth/me").catch(() => {});
}

function emit(event) {
  for (const sub of [...subscribers]) {
    if (sub.types && !sub.types.has(event.type)) continue;
    try {
      sub.handler(event);
    } catch (err) {
      console.error("[live] subscriber failed:", err);
    }
  }
}

function emitResyncIfNeeded() {
  if (!needResync) return;
  needResync = false;
  emit({ type: LIVE_RESYNC, taskId: null, projectId: null, at: new Date().toISOString() });
}

function clearTimers() {
  clearTimeout(reconnectTimer);
  clearInterval(pollTimer);
  clearTimeout(streamRetryTimer);
  clearTimeout(staleTimer);
  reconnectTimer = null;
  pollTimer = null;
  streamRetryTimer = null;
  staleTimer = null;
}

function closeStream() {
  const c = controller;
  controller = null;
  c?.abort();
}

function stopPolling() {
  clearInterval(pollTimer);
  clearTimeout(streamRetryTimer);
  pollTimer = null;
  streamRetryTimer = null;
}

function startPolling() {
  emitResyncIfNeeded();

  if (!pollTimer) {
    pollTimer = setInterval(() => {
      if (!isHidden()) {
        emit({ type: LIVE_POLL, taskId: null, projectId: null, at: new Date().toISOString() });
      }
    }, POLL_MS);
  }

  clearTimeout(streamRetryTimer);
  streamRetryTimer = setTimeout(() => {
    streamRetryTimer = null;
    attempt = 0;
    failures = 0;
    connect();
  }, STREAM_RETRY_MS);
}

function scheduleReconnect() {
  const delay = Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** attempt);
  attempt += 1;
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

async function openStream(signal, state) {
  let token = getAccessToken();
  // Page was just reloaded and the token is not restored yet.
  if (!token) token = await refreshAccessToken();

  // Remembered so that, when this stream expires, we know whether the token
  // has already been refreshed by another request.
  state.token = token;

  return fetch(STREAM_URL, {
    method: "GET",
    headers: {
      Accept: "text/event-stream",
      Authorization: `Bearer ${token}`,
      "X-Orbit-Client": "1",
    },
    cache: "no-store",
    signal,
  });
}

// One SSE message = the "data:" lines before a blank line.
function handleMessage(dataLines, state) {
  if (dataLines.length === 0) return;

  let event;
  try {
    event = JSON.parse(dataLines.join("\n"));
  } catch {
    return;
  }
  if (!event || typeof event.type !== "string") return;

  if (event.type === EVICTED) {
    state.evicted = true;
    return;
  }

  if (event.type === EXPIRED) {
    state.expired = true;
    return;
  }

  if (event.type === REVOKED) {
    state.revoked = true;
    return;
  }

  emit(event);
}

// Reads the stream until it ends. Resolves when the server closes it.
async function readStream(body, state, onActivity) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let dataLines = [];

  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;

    onActivity();
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop(); // last piece may be an incomplete line

    for (const line of lines) {
      if (line === "") {
        handleMessage(dataLines, state);
        dataLines = [];
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).replace(/^ /, ""));
      }
      // Comment lines (": ping") and other fields ("retry:") need no action:
      // receiving them already reset the stale timer above.
    }
  }
}

async function connect() {
  if (!shouldRun()) return;

  clearTimeout(reconnectTimer);
  reconnectTimer = null;
  closeStream();

  const c = new AbortController();
  controller = c;

  const state = { evicted: false, expired: false, revoked: false, stale: false, token: null };
  let openedAt = 0;
  let failure = null;

  const armStaleTimer = () => {
    clearTimeout(staleTimer);
    staleTimer = setTimeout(() => {
      state.stale = true;
      c.abort();
    }, STALE_MS);
  };

  try {
    let res = await openStream(c.signal, state);

    // Access token expired: refresh once, then try again.
    if (res.status === 401) {
      await refreshAccessToken();
      res = await openStream(c.signal, state);
    }

    // Feature is off on the server.
    if (res.status === 204) {
      if (controller === c) {
        controller = null;
        startPolling();
      }
      return;
    }

    if (!res.ok || !res.body) throw new Error(`Live stream answered ${res.status}`);

    openedAt = Date.now();
    stopPolling();
    emitResyncIfNeeded();
    armStaleTimer();

    await readStream(res.body, state, armStaleTimer);
  } catch (err) {
    // Network error, a bad status, a failed token refresh, or an abort.
    // Handled below.
    failure = err;
  }

  clearTimeout(staleTimer);
  staleTimer = null;

  // Closed on purpose (tab hidden, logout, or a newer connect() took over).
  if (controller !== c || (c.signal.aborted && !state.stale)) return;
  controller = null;

  if (!shouldRun()) return;

  // The token refresh itself was refused: the session is over.
  if (sessionEnded(failure)) {
    endSession();
    return;
  }

  // The user's access changed, or this tab's session was ended from another
  // device: stay closed. No polling and no retries.
  if (state.revoked) {
    revoked = true;
    clearTimers();
    // One normal API call. If this session is gone it gets 401 and the API
    // client's existing handling signs this tab out now, instead of at its
    // next request. If the session is still fine (e.g. a role change), the
    // call succeeds and nothing happens.
    api.get("/auth/me").catch(() => {});
    return;
  }

  // Events may be missed from here until the stream is open again.
  needResync = true;

  // The access token ran out: normal, not a failure. Reconnect right away
  // with a fresh token. No backoff, no polling.
  if (state.expired) {
    attempt = 0;
    failures = 0;
    reconnectAfterExpiry(state.token);
    return;
  }

  // Too many tabs for this user: the server closed this one. Poll instead
  // of fighting the other tabs for a slot.
  if (state.evicted) {
    startPolling();
    return;
  }

  const healthy = openedAt > 0 && Date.now() - openedAt >= HEALTHY_MS;
  if (healthy) {
    attempt = 0;
    failures = 0;
  } else {
    failures += 1;
    // Do not leave the page stale while the stream is being retried: catch
    // up once now, and once more when the stream is open again.
    if (failures === 1) emitResyncIfNeeded();
    needResync = true;
  }

  if (failures >= MAX_FAILURES) {
    startPolling();
    return;
  }

  scheduleReconnect();
}

// Gets a fresh access token through the normal refresh flow (unless another
// request already refreshed it), then opens the stream again.
async function reconnectAfterExpiry(expiredToken) {
  try {
    if (getAccessToken() === expiredToken) await refreshAccessToken();
  } catch (err) {
    if (sessionEnded(err)) {
      endSession();
      return;
    }
    // Network problem while refreshing: retry like any other dropped stream.
    if (shouldRun()) scheduleReconnect();
    return;
  }

  connect();
}

function onVisibilityChange() {
  if (isHidden()) {
    // Paused: no stream and no polling in a background tab.
    clearTimers();
    closeStream();
    return;
  }

  if (refs > 0 && !revoked) {
    attempt = 0;
    failures = 0;
    needResync = true; // refetch once now that the tab is back
    connect();
  }
}

function stop() {
  clearTimers();
  closeStream();
  attempt = 0;
  failures = 0;
  needResync = false;
}

function retain() {
  refs += 1;

  if (refs === 1) {
    revoked = false; // a new login starts clean
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("orbit:logout", stop);
    connect();
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    refs -= 1;

    if (refs === 0) {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("orbit:logout", stop);
      stop();
    }
  };
}

/*
 * subscribe(types, handler) -> unsubscribe()
 *
 * types: array of event types (see the lists above), or null for everything.
 * handler(event): event is { type, taskId, projectId, at }.
 */
function subscribe(types, handler) {
  const sub = { types: types ? new Set(types) : null, handler };
  subscribers.add(sub);
  return () => subscribers.delete(sub);
}

/* -------------------------------------------------------------------------- */
/* Hooks                                                                      */
/* -------------------------------------------------------------------------- */

// Keeps the stream open while a user is logged in and this component is
// mounted. Stops when the user logs out.
export function useLiveEvents() {
  const { user } = useAuth();
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return undefined;
    return retain();
  }, [userId]);

  return { subscribe };
}

/*
 * Calls `refetch` when a matching live event arrives.
 *
 * - Debounced: a burst of events causes one refetch, `delay` ms after the
 *   first one (default 500).
 * - `match(event)`: return false to ignore events for another task/project.
 *   "poll" and "resync" skip this check, they always refetch.
 * - `refetch` should refresh silently (no spinner, no state reset).
 *
 * `types` must be a stable array (use the exported lists).
 */
export function useLiveRefetch(types, refetch, { match, delay = 500, enabled = true } = {}) {
  const { subscribe: sub } = useLiveEvents();

  const refetchRef = useRef(refetch);
  const matchRef = useRef(match);
  refetchRef.current = refetch;
  matchRef.current = match;

  useEffect(() => {
    if (!enabled) return undefined;

    let timer = null;

    const unsubscribe = sub(types, (event) => {
      const catchUp = event.type === LIVE_POLL || event.type === LIVE_RESYNC;
      if (!catchUp && matchRef.current && !matchRef.current(event)) return;
      if (timer) return; // a refetch is already on its way

      timer = setTimeout(() => {
        timer = null;
        refetchRef.current?.(event);
      }, delay);
    });

    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [sub, types, delay, enabled]);
}
