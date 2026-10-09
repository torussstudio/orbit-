'use strict';

/*
 * Small helpers for showing a session to its owner (Account settings ->
 * Active sessions, and the "New sign-in" alert): a short device label read
 * from the User-Agent header, and a tidied-up IP address.
 *
 * For display, grouping and audit only. Nothing here is ever used to decide
 * whether a request is allowed.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Session ids are UUIDs (crypto.randomUUID). Checked before one goes into a
// query, because Postgres raises an error for text that is not a UUID.
function isUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function sameSession(a, b) {
  if (!a || !b) return false;
  return String(a).toLowerCase() === String(b).toLowerCase();
}

// First match wins, so the browsers that also say "Chrome" or "Safari" in
// their User-Agent (Edge, Opera, Samsung Internet) come first.
const BROWSERS = [
  ['Edge', /\bEdg(?:e|A|iOS)?\//],
  ['Opera', /\b(?:OPR|OPT)\//],
  ['Samsung Internet', /\bSamsungBrowser\//],
  ['Firefox', /\b(?:Firefox|FxiOS)\//],
  ['Chrome', /\b(?:Chrome|CriOS|Chromium)\//],
  ['Safari', /\bSafari\//],
];

// iPhone / iPad / Android come first: their User-Agent also mentions
// "Mac OS X" or "Linux".
const SYSTEMS = [
  ['iPhone', /\biPhone\b/, 'mobile'],
  ['iPad', /\biPad\b/, 'mobile'],
  ['Android', /\bAndroid\b/, 'mobile'],
  ['Windows', /\bWindows\b/, 'desktop'],
  ['ChromeOS', /\bCrOS\b/, 'desktop'],
  ['macOS', /\bMacintosh\b|\bMac OS X\b/, 'desktop'],
  ['Linux', /\bLinux\b/, 'desktop'],
];

/*
 * "Chrome on Windows", "Safari on iPhone". No versions on purpose: the label
 * is also the grouping key, and a browser update must not look like a new
 * device. Anything not recognised becomes "Unknown device".
 *
 * type: 'mobile' | 'desktop' | 'unknown' (which icon the client shows).
 */
function parseDevice(userAgent) {
  const ua = typeof userAgent === 'string' ? userAgent : '';

  const browser = (BROWSERS.find(([, pattern]) => pattern.test(ua)) || [])[0];
  const system = SYSTEMS.find(([, pattern]) => pattern.test(ua));

  if (!browser && !system) {
    return { label: 'Unknown device', type: 'unknown' };
  }

  if (!system) {
    return { label: browser, type: 'unknown' };
  }

  return {
    label: `${browser || 'Browser'} on ${system[0]}`,
    type: system[2],
  };
}

// "::ffff:203.0.113.7" (an IPv4 address written as IPv6) -> "203.0.113.7".
function normalizeIp(ip) {
  if (typeof ip !== 'string') return null;

  const value = ip.trim().replace(/^::ffff:/i, '');

  return value || null;
}

/*
 * True for loopback and private-network addresses (and for no address at
 * all). Behind a reverse proxy these are the proxy's own address, not the
 * member's, so they say nothing about where a sign-in came from.
 */
function isPrivateIp(ip) {
  const value = normalizeIp(ip);

  if (!value) return true;

  return (
    /^(10|127)\./.test(value) ||
    /^192\.168\./.test(value) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(value) ||
    /^169\.254\./.test(value) ||
    value === '::1' ||
    /^f[cd][0-9a-f]{2}:/i.test(value) ||
    /^fe80:/i.test(value)
  );
}

module.exports = {
  isUuid,
  sameSession,
  parseDevice,
  normalizeIp,
  isPrivateIp,
};
