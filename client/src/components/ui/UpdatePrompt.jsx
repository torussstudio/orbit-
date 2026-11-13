import { useCallback, useEffect, useRef, useState } from 'react';

/*
 * "New version available" prompt.
 *
 * Mounted at the root (see index.jsx), outside the router and the login
 * check, so it also shows on the login page. It only runs in production
 * builds.
 *
 * How it knows there is a newer build: Vite gives every build's entry
 * script a hashed file name (/assets/index-<hash>.js). index.html is
 * served "no-cache", so fetching it always returns the latest build's
 * script name. If that name differs from the script this page loaded,
 * a new version has been published.
 *
 * The prompt is for the installed app only (home-screen / desktop app).
 * A browser tab never shows it: it silently gets the latest build.
 *
 * The installed app shows it in two cases:
 *  - it is opened and the build it loads differs from the build this
 *    device last confirmed (a new version was published since), or
 *  - it stayed open or was resumed from the background and a newer
 *    build has been published meanwhile.
 *
 * The confirmed build is kept in localStorage. A browser visit also
 * records the build it loaded, so someone who opened the web app first
 * and installed it afterwards (same storage) gets no prompt, and a
 * first run on a device records the build without asking.
 */

const CHECK_EVERY_MS = 5 * 60 * 1000; // while the app stays open
const MIN_GAP_MS = 30 * 1000;         // focus / resume checks never closer than this
const MIN_UPDATING_MS = 900;          // keep "Updating…" readable, not a flash

const SEEN_KEY = 'orbit_build_seen';

function readSeen() {
  try { return localStorage.getItem(SEEN_KEY); } catch { return null; }
}
function writeSeen(value) {
  try { if (value) localStorage.setItem(SEEN_KEY, value); } catch { /* storage blocked */ }
}

// True inside the installed app window, false in an ordinary browser tab.
function isInstalledApp() {
  try {
    return (
      ['standalone', 'fullscreen', 'minimal-ui'].some((m) => window.matchMedia(`(display-mode: ${m})`).matches) ||
      window.navigator.standalone === true // iPhone / iPad home-screen app
    );
  } catch {
    return false;
  }
}

const ENTRY_RE = /<script[^>]*type=["']module["'][^>]*src=["']([^"']+)["']/i;

function loadedEntry() {
  const el = document.querySelector('script[type="module"][src*="/assets/"]');
  return el ? el.getAttribute('src') : null;
}

async function latestEntry() {
  const res = await fetch('/', { cache: 'no-store', headers: { Accept: 'text/html' } });
  if (!res.ok) return null;
  const match = ENTRY_RE.exec(await res.text());
  return match ? match[1] : null;
}

export default function UpdatePrompt() {
  // idle | available | updating | ready | error
  const [phase, setPhase] = useState('idle');
  const nextEntry = useRef(null);
  const lastCheck = useRef(0);
  const busy = useRef(false);
  const buttonRef = useRef(null);

  const check = useCallback(async (force = false) => {
    if (busy.current || nextEntry.current) return;
    const now = Date.now();
    if (!force && now - lastCheck.current < MIN_GAP_MS) return;
    lastCheck.current = now;
    busy.current = true;
    try {
      const current = loadedEntry();
      if (!current) return; // dev server or unexpected page: nothing to compare
      const latest = await latestEntry();
      if (latest && latest !== current) {
        nextEntry.current = latest;
        setPhase('available');
      }
    } catch {
      // offline or a failed request: try again at the next check
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    if (!import.meta.env.PROD) return undefined;

    const current = loadedEntry();
    if (!current) return undefined; // nothing to compare against

    // Browser tab: no prompt, just remember which build this device has.
    if (!isInstalledApp()) {
      writeSeen(current);
      return undefined;
    }

    // Installed app opened: a different build than the last confirmed one
    // means a new version was published since.
    const seen = readSeen();
    if (!seen) {
      writeSeen(current);
    } else if (seen !== current) {
      nextEntry.current = current;
      setPhase('available');
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    const onOnline = () => check();

    const first = setTimeout(() => check(true), 4000);
    const timer = setInterval(() => check(true), CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onOnline);
    window.addEventListener('online', onOnline);
    window.addEventListener('pageshow', onOnline);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onOnline);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('pageshow', onOnline);
    };
  }, [check]);

  const update = useCallback(async () => {
    setPhase('updating');
    const started = Date.now();
    try {
      // Download the new build's main script now so the reload is quick,
      // and ask the browser to refresh the push service worker too.
      const jobs = [];
      if (nextEntry.current) jobs.push(fetch(nextEntry.current).then((r) => { if (!r.ok) throw new Error('download'); }));
      if ('serviceWorker' in navigator) {
        jobs.push(
          navigator.serviceWorker
            .getRegistration()
            .then((reg) => reg && reg.update())
            .catch(() => {}),
        );
      }
      await Promise.all(jobs);
      const wait = MIN_UPDATING_MS - (Date.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      setPhase('ready');
    } catch {
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    if (phase !== 'idle') buttonRef.current?.focus();
  }, [phase]);

  if (phase === 'idle') return null;

  const copy = {
    available: {
      title: 'New version available',
      body: 'A newer version of Orbit is ready. Update to get the latest changes.',
      action: 'Update now',
    },
    updating: { title: 'Updating…', body: 'Getting the latest version. This takes a moment.', action: null },
    ready: {
      title: 'Updated successfully',
      body: 'The latest version is ready. Tap Completed to start using it.',
      action: 'Completed',
    },
    error: {
      title: 'Update failed',
      body: 'Could not download the new version. Check your connection and try again.',
      action: 'Try again',
    },
  }[phase];

  const onAction =
    phase === 'ready'
      ? () => {
          writeSeen(nextEntry.current); // confirmed: no prompt for this build again
          window.location.reload();
        }
      : update;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50 backdrop-blur-[2px]">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-title"
        className="w-full max-w-[380px] rounded-2xl border border-[color:var(--border)] bg-[color:var(--bg-2)] p-6 text-center shadow-2xl"
      >
        <div
          className={`mx-auto mb-4 flex size-12 items-center justify-center rounded-full ${
            phase === 'ready'
              ? 'bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-[color:var(--success)]'
              : phase === 'error'
                ? 'bg-[color-mix(in_srgb,var(--danger)_15%,transparent)] text-[color:var(--danger)]'
                : 'bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] text-[color:var(--accent)]'
          }`}
          aria-hidden="true"
        >
          {phase === 'updating' ? (
            <svg className="size-6 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 3a9 9 0 1 0 9 9" />
            </svg>
          ) : phase === 'ready' ? (
            <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          ) : phase === 'error' ? (
            <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 7v6M12 17h.01" />
            </svg>
          ) : (
            <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
            </svg>
          )}
        </div>

        <h2 id="update-title" className="m-0 text-[17px] font-semibold text-[color:var(--text)]">
          {copy.title}
        </h2>
        <p className="mt-2 mb-0 text-[13px] leading-[1.55] text-[color:var(--text-2)]" aria-live="polite">
          {copy.body}
        </p>

        {copy.action && (
          <button
            ref={buttonRef}
            type="button"
            onClick={onAction}
            className="mt-5 w-full cursor-pointer rounded-xl border-0 bg-[color:var(--accent)] px-4 py-2.5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]"
          >
            {copy.action}
          </button>
        )}
      </div>
    </div>
  );
}
