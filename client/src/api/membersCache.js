/*
 * The member list (GET /members), remembered for this browser tab's session.
 *
 * Tasks, Task Detail, Calendar and Members all need the same list. Each page
 * still fetches it every time it opens, and again after a member is added,
 * edited or deleted, exactly as before. The only difference: while that
 * request is on its way, the page can already show the list from the previous
 * page instead of an empty one.
 *
 * Memory only (never written to storage) and forgotten on logout.
 */

let members = null;

// The list from the last successful fetch, or null if there is none yet.
export function cachedMembers() {
  return members;
}

// Call with the data of every successful GET /members. Returns the same list.
export function rememberMembers(list) {
  if (Array.isArray(list)) members = list;
  return list;
}

if (typeof window !== "undefined") {
  window.addEventListener("orbit:logout", () => {
    members = null;
  });
}
