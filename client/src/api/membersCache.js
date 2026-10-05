/*
 * Shared in-memory member list for the current browser tab.
 *
 * The first page that needs members fetches them from the API.
 * Other pages can reuse the cached list instead of requesting the same
 * data again.
 *
 * Memory only:
 * - never written to localStorage/sessionStorage
 * - cleared on logout
 * - explicitly invalidated when member data changes
 */

let members = null;

// Returns the latest successfully fetched member list, or null if none exists.
export function cachedMembers() {
  return members;
}

// Stores the latest successful GET /members response.
export function rememberMembers(list) {
  if (Array.isArray(list)) {
    members = list;
  }

  return list;
}

// Clears the shared member cache.
// Used when the member list may have changed and a fresh GET /members
// should be performed.
export function clearMembersCache() {
  members = null;
}

// Applies a local change to the cached member without requiring another
// request immediately. Useful for changes such as updating the current
// user's avatar.
export function updateCachedMember(id, changes) {
  if (!members) return;

  members = members.map((member) =>
    String(member.id) === String(id)
      ? { ...member, ...changes }
      : member,
  );
}

if (typeof window !== "undefined") {
  window.addEventListener("orbit:logout", () => {
    members = null;
  });
}
