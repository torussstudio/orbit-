import { useEffect, useState } from 'react';
import api from '../api/client';

/*
 * Light / dark theme, per user.
 *
 * - The choice ('light' | 'dark' | 'system') belongs to the logged-in user.
 *   It is saved on their account (PUT /preferences/theme), so it follows
 *   them to every device, and two people sharing a browser each get their
 *   own theme.
 * - A local copy per user (orbit_theme_u_<id>) applies it instantly on the
 *   next visit, before the server answers.
 * - orbit_theme_last holds the theme of whoever is logged in right now. The
 *   inline script in index.html reads it, so a reload never flashes the
 *   wrong theme. On logout it goes back to light.
 * - Nobody logged in (login page): light.
 *
 * The resolved theme is written to <html data-theme="light|dark">; the
 * colors in index.css switch on that attribute.
 */

const CHOICES = ['light', 'dark', 'system'];
const DEFAULT_CHOICE = 'light';
const LAST_KEY = 'orbit_theme_last';
const userKey = (id) => `orbit_theme_u_${id}`;
const EVENT = 'orbit:theme';

const media =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

let currentUserId = null;

const read = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key, value) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the theme still applies for this page */
  }
};

const valid = (choice) => (CHOICES.includes(choice) ? choice : null);

export function getThemeChoice() {
  if (currentUserId == null) return DEFAULT_CHOICE;
  return valid(read(userKey(currentUserId))) || DEFAULT_CHOICE;
}

export function resolveTheme(choice) {
  if (choice === 'system') return media?.matches ? 'dark' : 'light';
  return choice === 'dark' ? 'dark' : 'light';
}

function applyTheme(choice) {
  if (typeof document === 'undefined') return;
  const theme = resolveTheme(choice);
  const root = document.documentElement;
  if (root.dataset.theme === theme) return;

  // Switch instantly: without this every element would animate its colors.
  root.classList.add('theme-switching');
  root.dataset.theme = theme;
  root.style.colorScheme = theme;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#17191c' : '#ffffff');

  requestAnimationFrame(() => {
    requestAnimationFrame(() => root.classList.remove('theme-switching'));
  });
}

function notify() {
  window.dispatchEvent(new CustomEvent(EVENT));
}

// Store + apply a choice for the current user (no server call).
function storeAndApply(choice) {
  if (currentUserId != null) {
    write(userKey(currentUserId), choice);
    write(LAST_KEY, choice);
  }
  applyTheme(choice);
  notify();
}

/*
 * Who is logged in. Called by Layout when the user changes.
 * id = null on logout: back to light.
 */
export function setThemeUser(id) {
  const next = id == null ? null : String(id);
  if (next === currentUserId) return;
  currentUserId = next;

  if (next == null) {
    write(LAST_KEY, null);
    applyTheme(DEFAULT_CHOICE);
    notify();
    return;
  }

  // Local copy first (instant), then the account's saved choice.
  storeAndApply(getThemeChoice());

  api
    .get('/preferences/theme')
    .then(({ data }) => {
      const saved = valid(data?.theme);
      // Still the same user, and the account has a choice: use it.
      if (saved && currentUserId === next && saved !== getThemeChoice()) {
        storeAndApply(saved);
      }
    })
    .catch(() => {
      /* offline or older server: keep the local choice */
    });
}

// The user picked a theme: apply now, save on their account.
export function setThemeChoice(choice) {
  const next = valid(choice) || DEFAULT_CHOICE;
  storeAndApply(next);
  if (currentUserId != null) {
    api.put('/preferences/theme', { theme: next }).catch(() => {
      /* saved locally; the account copy updates next time */
    });
  }
}

// React hook: { choice, theme, setChoice }
export function useTheme() {
  const [choice, setChoice] = useState(getThemeChoice);
  const [theme, setTheme] = useState(() => resolveTheme(getThemeChoice()));

  useEffect(() => {
    const sync = () => {
      const current = getThemeChoice();
      setChoice(current);
      setTheme(resolveTheme(current));
    };
    // Same user changed the theme in another tab.
    const onStorage = (e) => {
      if (currentUserId != null && e.key === userKey(currentUserId)) {
        applyTheme(getThemeChoice());
        sync();
      }
    };
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // 'system': follow the OS when it switches.
  useEffect(() => {
    if (choice !== 'system' || !media) return undefined;
    const onChange = () => {
      applyTheme('system');
      setTheme(resolveTheme('system'));
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [choice]);

  return { choice, theme, setChoice: setThemeChoice };
}

// Keeps the theme tied to the logged-in user. Used once, in Layout.
export function useThemeForUser(userId) {
  useEffect(() => {
    setThemeUser(userId ?? null);
  }, [userId]);

  // Layout unmounts on logout: back to light.
  useEffect(() => () => setThemeUser(null), []);
}
