/*
 * Start a GET before the component that needs it has mounted.
 *
 * Project Detail knows the project id from the URL, but its tabs only mount
 * once the project itself has loaded, so their first requests used to start
 * one round trip late. Project Detail now starts them straight away with
 * prefetch(); the tab picks the same request up with takePrefetched() on its
 * first load.
 *
 * - One use only: takePrefetched() hands the request over and forgets it, so
 *   every later load sends a fresh request as before.
 * - Not a cache: an entry that nobody takes is dropped when Project Detail
 *   unmounts, and is ignored once it is older than MAX_AGE_MS.
 */

import api from "./client";

const MAX_AGE_MS = 15000;

// url -> { promise, startedAt }
const pending = new Map();

export function prefetch(url) {
  if (pending.has(url)) return;

  const promise = api.get(url);
  // The tab that takes it handles a failure; never leave it unhandled here.
  promise.catch(() => {});

  pending.set(url, { promise, startedAt: Date.now() });
}

// The request started by prefetch(url), or null (then fetch it yourself).
export function takePrefetched(url) {
  const entry = pending.get(url);
  if (!entry) return null;

  pending.delete(url);

  return Date.now() - entry.startedAt <= MAX_AGE_MS ? entry.promise : null;
}

export function dropPrefetched(urls) {
  urls.forEach((url) => pending.delete(url));
}
