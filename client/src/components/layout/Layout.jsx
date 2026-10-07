import { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import NotificationBell from '../ui/NotificationBell';
import ConfirmModal from '../ui/ConfirmModal';
import api from '../../api/client';
import { animateEntrance, preloadMotion } from '../../utils/motion';
import Loader from '../ui/Loader';
import ErrorBoundary from '../ui/ErrorBoundary';
import { useTheme, useThemeForUser } from '../../utils/theme';

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]';

// One icon component, one stroke weight. `d` may hold several sub-paths.
const Icon = ({ d, className = 'h-4 w-4 shrink-0' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const ICONS = {
  home: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  tasks: 'M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11',
  projects: 'M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z',
  calendar: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  members: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75M13 7a4 4 0 11-8 0 4 4 0 018 0z',
  // Eye: In Review used to share the Task View icon.
  review: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM15 12a3 3 0 11-6 0 3 3 0 016 0z',
  // Sheet/grid: Requested Tasks (manager view)
  sheet: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18',
  // Inbox tray: Task Request
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z',
  // Clock: Time Log (manager view)
  clock: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 6v6l4 2',
  search: 'M21 21l-4.35-4.35M19 11a8 8 0 11-16 0 8 8 0 0116 0z',
  close: 'M18 6L6 18M6 6l12 12',
  menu: 'M3 12h18M3 6h18M3 18h18',
  chevronDown: 'M6 9l6 6 6-6',
  chevronLeft: 'M15 18l-6-6 6-6',
  user: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M16 7a4 4 0 11-8 0 4 4 0 018 0z',
  settings:
    'M15 12a3 3 0 11-6 0 3 3 0 016 0zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z',
  logout: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  // Appearance options
  sun: 'M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42',
  moon: 'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z',
  monitor: 'M3 4h18v12H3zM8 20h8M12 16v4',
};

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'system', label: 'System', icon: 'monitor' },
];

// Header button: one click flips light <-> dark for the whole app.
// (The profile menu still has Light / Dark / System.)
function ThemeToggleButton() {
  const { theme, setChoice } = useTheme();
  const dark = theme === 'dark';
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <button
      type="button"
      onClick={() => setChoice(dark ? 'light' : 'dark')}
      aria-label={label}
      title={label}
      className={`relative flex min-h-10 min-w-10 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-none bg-transparent p-1.5 text-[var(--text-2)] transition-colors duration-150 hover:bg-[var(--bg-3)] hover:text-[var(--text)] active:scale-95 motion-reduce:transition-none ${focusRing}`}
    >
      {/* Icons swap with a small rotate + fade */}
      <span
        aria-hidden="true"
        className={`absolute transition-[transform,opacity] duration-300 motion-reduce:transition-none ${dark ? 'rotate-90 scale-50 opacity-0' : 'rotate-0 scale-100 opacity-100'}`}
      >
        <Icon d={ICONS.moon} className="h-[18px] w-[18px]" />
      </span>
      <span
        aria-hidden="true"
        className={`absolute transition-[transform,opacity] duration-300 motion-reduce:transition-none ${dark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-50 opacity-0'}`}
      >
        <Icon d={ICONS.sun} className="h-[18px] w-[18px]" />
      </span>
    </button>
  );
}

// Light / Dark / System, inside the profile menu.
function ThemeSwitch() {
  const { choice, setChoice } = useTheme();
  return (
    <div className="px-2.5 pb-1 pt-1.5">
      <div className="mb-1.5 text-[11px] font-medium text-[var(--text-3)]" id="theme-switch-label">
        Appearance
      </div>
      <div role="group" aria-labelledby="theme-switch-label" className="grid grid-cols-3 gap-1 rounded-lg bg-[var(--bg-3)] p-1">
        {THEME_OPTIONS.map((o) => {
          const on = choice === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="menuitemradio"
              aria-checked={on}
              onClick={() => setChoice(o.value)}
              className={[
                'flex cursor-pointer flex-col items-center gap-1 rounded-md border-none px-1 py-1.5 text-[11px] font-medium',
                'transition-[background-color,color,box-shadow] duration-150 motion-reduce:transition-none',
                focusRing,
                on
                  ? 'bg-[var(--bg-2)] text-[var(--text)] shadow-[0_1px_3px_rgba(0,0,0,0.12)]'
                  : 'bg-transparent text-[var(--text-3)] hover:text-[var(--text)]',
              ].join(' ')}
            >
              <Icon d={ICONS[o.icon]} className="h-[15px] w-[15px] shrink-0" />
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Brand mark: hexagon with a solid core, replaces the "⬡" text glyph.
function LogoMark() {
  return (
    <svg className="h-[22px] w-[22px] shrink-0 text-[var(--accent)]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5L12 2.5z" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" />
    </svg>
  );
}

// Solid accent tint instead of the indigo-to-purple gradient.
const AVATAR_SIZES = {
  sm: 'h-7 w-7 text-[11px]',
  md: 'h-8 w-8 text-[13px] sm:h-9 sm:w-9 sm:text-sm',
  lg: 'h-9 w-9 text-sm',
};

function Avatar({ user, size = 'md' }) {
  return (
    <div className={`${AVATAR_SIZES[size]} flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--accent-light)] font-semibold text-[var(--accent)] ring-1 ring-inset ring-[var(--border)]`}>
      {user?.avatar_url ? (
        <img
          src={user.avatar_url}
          alt={user?.name ? `${user.name}, profile photo` : 'Profile photo'}
          className="block h-full w-full rounded-full object-cover"
        />
      ) : (
        <span aria-hidden="true">{user?.name?.[0]?.toUpperCase()}</span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* New task-request badge (manager only)                               */
/* ------------------------------------------------------------------ */

const REQUESTS_PATH = '/requested-tasks';
const REQUESTS_POLL_MS = 60000;

// One shared "the user came back to this tab" signal for the sidebar badges.
// Coming back fires both `focus` and `visibilitychange`; with one listener per
// badge on each event, every badge was refetched twice. Here both events go
// through one handler that runs each badge check once.
const tabReturnListeners = new Set();
let lastTabReturn = 0;

const onTabReturn = () => {
  if (document.visibilityState !== 'visible') return;
  const now = Date.now();
  // `focus` and `visibilitychange` arrive together: act on the first one only.
  if (now - lastTabReturn < 1000) return;
  lastTabReturn = now;
  [...tabReturnListeners].forEach((listener) => listener());
};

const subscribeTabReturn = (listener) => {
  if (tabReturnListeners.size === 0) {
    window.addEventListener('focus', onTabReturn);
    document.addEventListener('visibilitychange', onTabReturn);
  }
  tabReturnListeners.add(listener);

  return () => {
    tabReturnListeners.delete(listener);
    if (tabReturnListeners.size === 0) {
      window.removeEventListener('focus', onTabReturn);
      document.removeEventListener('visibilitychange', onTabReturn);
    }
  };
};

// Per-user "last seen" marker: the newest request timestamp the manager has already looked at.
const seenKey = (userId) => `orbit_requests_seen_${userId}`;

const readSeen = (userId) => {
  try {
    const raw = localStorage.getItem(seenKey(userId));
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
};

const writeSeen = (userId, ts) => {
  try { localStorage.setItem(seenKey(userId), String(ts)); } catch { /* storage unavailable */ }
};

const REVIEW_PATH = '/in-review';
// Same endpoint the In Review page loads. Response can be an array or { tasks: [...] }.
const REVIEW_ENDPOINT = '/tasks/in-review/all';

// Ids of tasks the manager has already seen in review. Pruned to what is still in review,
// so a task that goes back to work and returns to review counts as new again.
const reviewKey = (userId) => `orbit_review_seen_${userId}`;

const readReviewSeen = (userId) => {
  try {
    const raw = localStorage.getItem(reviewKey(userId));
    if (raw === null) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(String) : null;
  } catch {
    return null;
  }
};

const writeReviewSeen = (userId, ids) => {
  try { localStorage.setItem(reviewKey(userId), JSON.stringify(ids)); } catch { /* storage unavailable */ }
};

const TASKS_PATH = '/tasks-view';
// Same endpoint the Task View page loads (members only). Response: { tasks: [...] }.
const MY_TASKS_ENDPOINT = '/dashboard/my-tasks';

// Ids of tasks the member has already seen in Task View. Only tasks that need action are kept
// (not In Review / Done), so a task sent back for rework counts as new again.
const tasksKey = (userId) => `orbit_tasks_seen_${userId}`;

const readTaskSeen = (userId) => {
  try {
    const raw = localStorage.getItem(tasksKey(userId));
    if (raw === null) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(String) : null;
  } catch {
    return null;
  }
};

const writeTaskSeen = (userId, ids) => {
  try { localStorage.setItem(tasksKey(userId), JSON.stringify(ids)); } catch { /* storage unavailable */ }
};

const BADGE_STYLES = {
  // Expanded sidebar / mobile drawer: count pill at the right end of the row
  pill: 'ml-auto h-5 min-w-[20px] shrink-0 px-1.5 text-[11px]',
  // Collapsed sidebar: small count on the icon corner
  corner: 'absolute -right-2 -top-2 h-4 min-w-[16px] px-1 text-[10px] ring-2 ring-[var(--bg-2)]',
  // Mobile hamburger: just a dot, the drawer is closed
  dot: 'absolute right-0.5 top-0.5 h-2.5 w-2.5 ring-2 ring-[var(--bg-2)]',
};

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Red badge. Pops in when it appears and again whenever the count goes up.
function NavBadge({ count, variant = 'pill', className = '' }) {
  const ref = useRef(null);
  const prev = useRef(0);

  useEffect(() => {
    if (count > prev.current && ref.current && !prefersReducedMotion()) {
      ref.current.animate(
        [
          { transform: 'scale(0.6)', opacity: 0.4 },
          { transform: 'scale(1.18)', opacity: 1, offset: 0.6 },
          { transform: 'scale(1)', opacity: 1 },
        ],
        { duration: 280, easing: 'ease-out' },
      );
    }
    prev.current = count;
  }, [count]);

  return (
    <span
      ref={ref}
      aria-hidden={variant === 'dot' ? 'true' : undefined}
      className={`inline-flex items-center justify-center rounded-full bg-[var(--danger)] font-semibold leading-none tabular-nums text-white ${BADGE_STYLES[variant]} ${className}`}
    >
      {variant !== 'dot' && (
        <>
          <span aria-hidden="true">{count > 99 ? '99+' : count}</span>
          <span className="sr-only">{count} new</span>
        </>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Global search                                                       */
/* ------------------------------------------------------------------ */

const rowCls =
  `flex items-center gap-3 px-3.5 py-2 no-underline transition-colors duration-150 hover:bg-[var(--bg-3)] focus-visible:bg-[var(--bg-3)] focus-visible:outline-none motion-reduce:transition-none`;

function ResultGroup({ title, bordered, children }) {
  return (
    <div className={bordered ? 'border-t border-[var(--border)]' : ''}>
      <div className="px-3.5 pb-1 pt-2.5 text-[11px] font-medium text-[var(--text-3)]">{title}</div>
      {children}
    </div>
  );
}

function GlobalSearch({ autoFocus = false, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  // Press "/" anywhere (outside a text field) to jump to search. Inline desktop search only.
  useEffect(() => {
    if (autoFocus) return undefined;
    const onKey = (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if (typing) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [autoFocus]);

  useEffect(() => {
    const controller = new AbortController();
    if (query.trim().length < 2) { setResults(null); setShowDropdown(false); return () => controller.abort(); }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get(`/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!controller.signal.aborted) {
          setResults(res.data);
          setShowDropdown(true);
        }
      } catch {
        if (!controller.signal.aborted) setResults(null);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(debounceRef.current);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) && !inputRef.current?.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const hasProjects = results?.projects?.length > 0;
  const hasTasks = results?.tasks?.length > 0;
  const hasMembers = results?.members?.length > 0;
  const hasResults = hasProjects || hasTasks || hasMembers;
  const totalCount = results ? (results.projects?.length || 0) + (results.tasks?.length || 0) + (results.members?.length || 0) : 0;
  const handleSelect = () => { setQuery(''); setShowDropdown(false); onClose?.(); };

  const links = () => [...(dropdownRef.current?.querySelectorAll('a') || [])];

  const handleInputKeyDown = (e) => {
    if (e.key === 'Escape') { setShowDropdown(false); onClose?.(); return; }
    if (e.key === 'ArrowDown' && showDropdown) {
      e.preventDefault();
      links()[0]?.focus();
    }
  };

  // Arrow keys move through results; Escape returns to the input.
  const handleDropdownKeyDown = (e) => {
    if (!['ArrowDown', 'ArrowUp', 'Escape'].includes(e.key)) return;
    e.preventDefault();
    if (e.key === 'Escape') { setShowDropdown(false); inputRef.current?.focus(); return; }
    const all = links();
    const index = all.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') all[Math.min(index + 1, all.length - 1)]?.focus();
    else if (index <= 0) inputRef.current?.focus();
    else all[index - 1]?.focus();
  };

  return (
    <div className="relative min-w-0 flex-1 md:max-w-[480px]">
      <div className="relative">
        <Icon d={ICONS.search} className="pointer-events-none absolute left-3 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-[var(--text-3)]" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => hasResults && setShowDropdown(true)}
          onKeyDown={handleInputKeyDown}
          placeholder="Search projects, tasks, members"
          aria-label="Search projects, tasks and members"
          autoComplete="off"
          className="peer w-full rounded-lg border border-[var(--border)] bg-[var(--bg-3)] py-2 pl-9 pr-9 text-[16px] text-[var(--text)] outline-none transition-colors duration-150 placeholder:text-[var(--text-3)] hover:border-[var(--text-3)] focus:border-[var(--accent)] focus:shadow-[var(--shadow-glow)] motion-reduce:transition-none md:text-[13px]"
        />

        {/* Shortcut hint, desktop only, hidden while typing or focused */}
        {!autoFocus && !query && (
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-[var(--border)] bg-[var(--bg-2)] px-1.5 py-px font-sans text-[11px] text-[var(--text-3)] peer-focus:hidden md:inline">
            /
          </kbd>
        )}

        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Loader label="Searching" size="sm" />
          </div>
        )}
        {query && !loading && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => { setQuery(''); setShowDropdown(false); inputRef.current?.focus(); }}
            className={`absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[var(--text-3)] transition-colors hover:bg-[var(--bg-4)] hover:text-[var(--text)] ${focusRing}`}
          >
            <Icon d={ICONS.close} className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div
          ref={dropdownRef}
          onKeyDown={handleDropdownKeyDown}
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-[2000] max-h-[60vh] overflow-hidden overflow-y-auto overscroll-contain rounded-xl border border-[var(--border)] bg-[var(--bg-2)] shadow-lg md:max-h-[420px]"
        >
          {!hasResults ? (
            <div className="break-words px-6 py-8 text-center">
              <div className="text-[13px] font-medium text-[var(--text-2)]">No matches for “{query}”</div>
              <div className="mt-1 text-xs text-[var(--text-3)]">Try a project name, a task title or a member’s name.</div>
            </div>
          ) : (
            <>
              <div className="border-b border-[var(--border)] px-3.5 py-2 text-[11px] font-medium tabular-nums text-[var(--text-3)]" aria-live="polite">
                {totalCount} {totalCount === 1 ? 'result' : 'results'}
              </div>

              {hasProjects && (
                <ResultGroup title="Projects">
                  {results.projects.map((p) => (
                    <Link key={p.id} to={`/projects/${p.id}`} onClick={handleSelect} className={rowCls}>
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--accent-light)] text-[var(--accent)]">
                        <Icon d={ICONS.projects} className="h-[13px] w-[13px]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium text-[var(--text)]">{p.name}</div>
                        {p.description && <div className="mt-px truncate text-[11px] text-[var(--text-3)]">{p.description}</div>}
                      </div>
                      <span className="ml-auto shrink-0 rounded bg-[var(--bg-4)] px-1.5 py-0.5 text-[10px] text-[var(--text-3)]">{p.status}</span>
                    </Link>
                  ))}
                </ResultGroup>
              )}

              {hasTasks && (
                <ResultGroup title="Tasks" bordered={hasProjects}>
                  {results.tasks.map((t) => (
                    <Link key={t.id} to={`/projects/${t.project_id}/tasks/${t.id}`} onClick={handleSelect} className={rowCls}>
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--warning)_16%,transparent)] text-[var(--warning)]">
                        <Icon d={ICONS.tasks} className="h-[13px] w-[13px]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium text-[var(--text)]">{t.title}</div>
                        <div className="mt-px truncate text-[11px] text-[var(--text-3)]">{t.project_name}</div>
                      </div>
                      <span className={`badge badge-${t.stage?.toLowerCase().replace(/\s/g, '')} shrink-0 text-[10px]`}>{t.stage}</span>
                    </Link>
                  ))}
                </ResultGroup>
              )}

              {hasMembers && (
                <ResultGroup title="Members" bordered={hasProjects || hasTasks}>
                  {results.members.map((m) => (
                    <Link key={m.id} to="/members" onClick={handleSelect} className={rowCls}>
                      <Avatar user={m} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium text-[var(--text)]">{m.name}</div>
                        <div className="mt-px truncate text-[11px] text-[var(--text-3)]">{m.email}</div>
                      </div>
                      <span className="ml-auto shrink-0 rounded bg-[var(--bg-4)] px-1.5 py-0.5 text-[10px] capitalize text-[var(--text-3)]">{m.role}</span>
                    </Link>
                  ))}
                </ResultGroup>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Profile menu button (module scope so it isn't remounted each render) */
/* ------------------------------------------------------------------ */

function MenuButton({ onClick, icon, children, danger = false }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={[
        'flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-none bg-transparent px-2.5 py-2.5 text-left text-[13px]',
        'transition-colors duration-150 motion-reduce:transition-none',
        focusRing,
        danger
          ? 'text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]'
          : 'text-[var(--text)] hover:bg-[var(--bg-3)]',
      ].join(' ')}
    >
      <Icon d={icon} className="h-[15px] w-[15px] shrink-0" />
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export default function Layout() {
  const { user, logout, isManager } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [confirmModal, setConfirmModal] = useState({ show: false, loading: false });
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const profileDropdownRef = useRef(null);
  const profileButtonRef = useRef(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('orbit_sidebar_collapsed') === '1'; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [newRequests, setNewRequests] = useState(0);
  const [newReviews, setNewReviews] = useState(0);
  const [newAssigned, setNewAssigned] = useState(0);
  const totalNew = newRequests + newReviews + newAssigned;
  const mainRef = useRef(null);

  // Each user has their own theme, saved on their account.
  useThemeForUser(user?.id);

  const onRequestsPage = location.pathname.startsWith(REQUESTS_PATH);
  const onReviewPage = location.pathname.startsWith(REVIEW_PATH);
  const onTaskViewPage = location.pathname.startsWith(TASKS_PATH);

  const toggleCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem('orbit_sidebar_collapsed', next ? '1' : '0'); } catch { /* storage unavailable */ }
      return next;
    });
  };

  useEffect(() => {
    setProfileDropdownOpen(false);
    setMobileOpen(false);
    setMobileSearchOpen(false);
  }, [location.pathname]);

  // GSAP loads in its own chunk once the browser is idle; until then pages simply appear.
  useEffect(() => { preloadMotion(); }, []);
  useEffect(() => animateEntrance(mainRef.current), [location.pathname]);

  // New task-request badge (manager only).
  // Counts requests created after the last time the manager had Requested Tasks open.
  // While that page is open, the marker follows the newest request, so the badge stays clear.
  useEffect(() => {
    const userId = user?.id;
    if (!isManager || !userId) {
      setNewRequests(0);
      return undefined;
    }

    let cancelled = false;

    const check = async () => {
      try {
        const res = await api.get('/task-requests');
        if (cancelled) return;

        const data = res.data;
        const list = Array.isArray(data) ? data : data?.requests || data?.task_requests || [];
        const stamps = list
          .map((r) => new Date(r.created_at).getTime())
          .filter(Number.isFinite);
        const latest = stamps.length ? Math.max(...stamps) : 0;

        // First run on this browser: start from what already exists, so old requests don't all show as new.
        let seen = readSeen(userId);
        if (seen === null) {
          seen = latest;
          writeSeen(userId, seen);
        }

        if (onRequestsPage) {
          if (latest > seen) writeSeen(userId, latest);
          setNewRequests(0);
          return;
        }

        setNewRequests(stamps.filter((t) => t > seen).length);
      } catch {
        /* keep the last known count; try again on the next tick */
      }
    };

    check();
    // Skip ticks in background tabs; the visibility/focus handlers below catch up on return.
    const timer = setInterval(() => { if (!document.hidden) check(); }, REQUESTS_POLL_MS);
    const stopTabReturn = subscribeTabReturn(check);

    return () => {
      cancelled = true;
      clearInterval(timer);
      stopTabReturn();
    };
  }, [isManager, user?.id, onRequestsPage]);

  // In Review badge (manager only).
  // Counts tasks now in review that the manager has not seen yet. Opening In Review marks all as seen.
  useEffect(() => {
    const userId = user?.id;
    if (!isManager || !userId) {
      setNewReviews(0);
      return undefined;
    }

    let cancelled = false;

    const check = async () => {
      try {
        const res = await api.get(REVIEW_ENDPOINT);
        if (cancelled) return;

        const data = res.data;
        const list = Array.isArray(data) ? data : data?.tasks || [];
        const current = list
          .filter((t) => t.stage == null || String(t.stage).toLowerCase().replace(/\s/g, '') === 'inreview')
          .map((t) => String(t.id));

        const seenIds = readReviewSeen(userId);

        // First run on this browser: whatever is already in review counts as seen.
        if (seenIds === null || onReviewPage) {
          writeReviewSeen(userId, current);
          setNewReviews(0);
          return;
        }

        const kept = seenIds.filter((id) => current.includes(id));
        if (kept.length !== seenIds.length) writeReviewSeen(userId, kept);
        setNewReviews(current.filter((id) => !kept.includes(id)).length);
      } catch {
        /* keep the last known count; try again on the next tick */
      }
    };

    check();
    // Skip ticks in background tabs; the visibility/focus handlers below catch up on return.
    const timer = setInterval(() => { if (!document.hidden) check(); }, REQUESTS_POLL_MS);
    const stopTabReturn = subscribeTabReturn(check);

    return () => {
      cancelled = true;
      clearInterval(timer);
      stopTabReturn();
    };
  }, [isManager, user?.id, onReviewPage]);

  // Task View badge (member only).
  // Counts tasks assigned to this member that need action and have not been seen yet.
  // Opening Task View marks all current tasks as seen.
  useEffect(() => {
    const userId = user?.id;
    if (isManager || !userId) {
      setNewAssigned(0);
      return undefined;
    }

    let cancelled = false;

    const check = async () => {
      try {
        const res = await api.get(MY_TASKS_ENDPOINT);
        if (cancelled) return;

        const data = res.data;
        const list = Array.isArray(data) ? data : data?.tasks || [];
        const current = list
          .filter((t) => !['done', 'inreview'].includes(String(t.stage).toLowerCase().replace(/\s/g, '')))
          .map((t) => String(t.id));

        const seenIds = readTaskSeen(userId);

        // First run on this browser: whatever is already assigned counts as seen.
        if (seenIds === null || onTaskViewPage) {
          writeTaskSeen(userId, current);
          setNewAssigned(0);
          return;
        }

        const kept = seenIds.filter((id) => current.includes(id));
        if (kept.length !== seenIds.length) writeTaskSeen(userId, kept);
        setNewAssigned(current.filter((id) => !kept.includes(id)).length);
      } catch {
        /* keep the last known count; try again on the next tick */
      }
    };

    check();
    // Skip ticks in background tabs; the visibility/focus handlers below catch up on return.
    const timer = setInterval(() => { if (!document.hidden) check(); }, REQUESTS_POLL_MS);
    const stopTabReturn = subscribeTabReturn(check);

    return () => {
      cancelled = true;
      clearInterval(timer);
      stopTabReturn();
    };
  }, [isManager, user?.id, onTaskViewPage]);

  // Close drawer on Escape, and lock body scroll while it is open
  useEffect(() => {
    if (!mobileOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setMobileOpen(false); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileOpen]);

  // Auto-close the mobile drawer / search overlay when resizing up to desktop
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = (e) => { if (e.matches) { setMobileOpen(false); setMobileSearchOpen(false); } };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const handleLogoutClick = () => {
    setProfileDropdownOpen(false);
    setConfirmModal({ show: true, loading: false });
  };

  const handleConfirmLogout = async () => {
    setConfirmModal((prev) => ({ ...prev, loading: true }));
    try {
      await logout();
      navigate('/login');
    } finally {
      setConfirmModal({ show: false, loading: false });
    }
  };

  // Profile menu: close on outside click, and on Escape (focus returns to the trigger).
  useEffect(() => {
    if (!profileDropdownOpen) return undefined;
    const handleClick = (e) => {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(e.target)) {
        setProfileDropdownOpen(false);
      }
    };
    const handleKey = (e) => {
      if (e.key !== 'Escape') return;
      setProfileDropdownOpen(false);
      profileButtonRef.current?.focus();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [profileDropdownOpen]);

  // Grouped by how often each page is used and what kind of work it is:
  //   Overview: what you look at first every day
  //   Work:     things that need action (badges live here)
  //   Team:     people and reports (managers only)
  const navSections = isManager
    ? [
        {
          label: 'Overview',
          items: [
            { to: '/', end: true, icon: ICONS.home, label: 'Dashboard' },
            { to: '/calendar', icon: ICONS.calendar, label: 'Calendar' },
          ],
        },
        {
          label: 'Work',
          items: [
            { to: '/projects', icon: ICONS.projects, label: 'Projects' },
            { to: REVIEW_PATH, icon: ICONS.review, label: 'In Review', badge: newReviews },
            { to: REQUESTS_PATH, icon: ICONS.sheet, label: 'Requested Tasks', badge: newRequests },
          ],
        },
        {
          label: 'Team',
          items: [
            { to: '/members', icon: ICONS.members, label: 'Members' },
            { to: '/time-log', icon: ICONS.clock, label: 'Time Log' },
          ],
        },
      ]
    : [
        {
          label: 'Overview',
          items: [
            { to: '/', end: true, icon: ICONS.home, label: 'Dashboard' },
            { to: '/calendar', icon: ICONS.calendar, label: 'Calendar' },
          ],
        },
        {
          label: 'Work',
          items: [
            { to: TASKS_PATH, icon: ICONS.tasks, label: 'Task View', badge: newAssigned },
            { to: '/task-request', icon: ICONS.inbox, label: 'Task Request' },
          ],
        },
      ];

  // Collapse only applies from md up. The mobile drawer always shows full labels.
  const labelClass = sidebarCollapsed ? 'md:hidden' : '';
  const centerClass = sidebarCollapsed ? 'md:justify-center md:px-2.5' : '';

  return (
    <div className="flex h-[100dvh] overflow-hidden">
      {/* Skip link: first tab stop on every page */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[3000] focus:rounded-lg focus:bg-[var(--accent)] focus:px-3.5 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg focus:outline-none"
      >
        Skip to content
      </a>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[1400] bg-black/40 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar: fixed drawer on mobile, in-flow column from md up */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-[1500] flex shrink-0 flex-col md:relative
          border-r border-[var(--border)] bg-[var(--bg-2)]
          transition-[transform,width] duration-200 ease-out motion-reduce:transition-none
          w-[min(272px,85vw)] ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
          ${sidebarCollapsed ? 'md:w-[72px]' : 'md:w-[240px] lg:w-[248px]'}
        `}
      >
        {/* Collapse toggle: desktop only */}
        <button
          type="button"
          className={`absolute -right-3 top-[22px] z-10 hidden h-6 w-6 cursor-pointer items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-2)] text-[var(--text-2)] shadow-[var(--shadow)] transition-colors hover:bg-[var(--bg-3)] hover:text-[var(--accent)] md:flex ${focusRing}`}
          onClick={toggleCollapsed}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!sidebarCollapsed}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Icon d={ICONS.chevronLeft} className={`h-[13px] w-[13px] transition-transform duration-200 motion-reduce:transition-none ${sidebarCollapsed ? 'rotate-180' : ''}`} />
        </button>

        {/* Inner scroll container so the toggle button never gets clipped */}
        <div className="flex h-full flex-col overflow-y-auto overscroll-contain">
          {/* Logo */}
          <div className={`mb-2 flex items-center justify-between gap-2.5 border-b border-[var(--border)] px-5 py-5 md:py-6 ${sidebarCollapsed ? 'md:justify-center md:px-2' : ''}`}>
            <Link to="/" aria-label="Orbit, go to dashboard" className={`flex min-w-0 items-center gap-2.5 rounded-lg no-underline ${focusRing}`}>
              <LogoMark />
              <span className={`flex min-w-0 items-baseline gap-2 ${labelClass}`}>
                <span className="whitespace-nowrap text-[17px] font-semibold tracking-[-0.02em] text-[var(--text)]">Orbit</span>
                <span className="whitespace-nowrap text-[11px] text-[var(--text-3)]">Agency OS</span>
              </span>
            </Link>
            {/* Close drawer: mobile only */}
            <button
              type="button"
              className={`-mr-1 flex min-h-10 min-w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent p-1.5 text-[var(--text-3)] hover:bg-[var(--bg-3)] hover:text-[var(--text)] md:hidden ${focusRing}`}
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            >
              <Icon d={ICONS.close} className="h-[18px] w-[18px]" />
            </button>
          </div>

          {/* Nav */}
          <nav aria-label="Main" className="flex flex-col gap-4 px-3 py-1">
            {navSections.map((section, sectionIndex) => (
            <div key={section.label} role="group" aria-labelledby={`nav-section-${section.label}`}>
            <div
              id={`nav-section-${section.label}`}
              className={`mb-1 px-2 text-[11px] font-medium text-[var(--text-3)] ${labelClass}`}
            >
              {section.label}
            </div>
            {/* Collapsed sidebar: no labels, so a thin line separates the groups */}
            {sidebarCollapsed && sectionIndex > 0 && (
              <div aria-hidden="true" className="mx-3 mb-2 hidden h-px bg-[var(--border)] md:block" />
            )}
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    title={item.badge > 0 ? `${item.label} (${item.badge} new)` : item.label}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) => [
                      'group relative flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[14px] font-medium no-underline md:py-2 md:text-[13.5px] max-[640px]:min-h-10',
                      'transition-colors duration-150 motion-reduce:transition-none active:scale-[0.99]',
                      focusRing,
                      centerClass,
                      isActive
                        ? 'bg-[var(--accent-light)] font-semibold text-[var(--accent)]'
                        : 'text-[var(--text-2)] hover:bg-[var(--bg-3)] hover:text-[var(--text)]',
                    ].join(' ')}
                  >
                    {({ isActive }) => (
                      <>
                        {/* Current-page marker */}
                        <span
                          aria-hidden="true"
                          className={`absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--accent)] transition-opacity duration-150 motion-reduce:transition-none ${isActive ? 'opacity-100' : 'opacity-0'}`}
                        />
                        <span className="relative flex shrink-0">
                          <Icon d={item.icon} />
                          {/* Collapsed sidebar: no label, so the count sits on the icon corner */}
                          {item.badge > 0 && sidebarCollapsed && (
                            <NavBadge count={item.badge} variant="corner" className="hidden md:inline-flex" />
                          )}
                        </span>
                        <span className={`truncate ${labelClass}`}>{item.label}</span>
                        {/* Expanded sidebar / mobile drawer: red count pill, inline */}
                        {item.badge > 0 && <NavBadge count={item.badge} className={labelClass} />}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
            </div>
            ))}
          </nav>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top header */}
        <header className="sticky top-0 z-[100] flex min-h-[60px] flex-shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--bg-2)] px-3 sm:gap-3 sm:px-4 md:min-h-[73.5px] md:gap-4 md:px-6">
          {/* Mobile hamburger */}
          <button
            type="button"
            className={`relative flex min-h-10 min-w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent p-1.5 text-[var(--text-2)] hover:bg-[var(--bg-3)] hover:text-[var(--text)] md:hidden ${focusRing}`}
            onClick={() => setMobileOpen(true)}
            aria-label={totalNew > 0 ? `Open menu, ${totalNew} new` : 'Open menu'}
            aria-expanded={mobileOpen}
          >
            <Icon d={ICONS.menu} className="h-5 w-5" />
            {/* Mobile: the drawer is closed, so hint that something new is inside */}
            {totalNew > 0 && <NavBadge count={totalNew} variant="dot" />}
          </button>

          {/* Search: inline from md up */}
          <div className="hidden min-w-0 flex-1 md:flex">
            <GlobalSearch />
          </div>

          <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2 md:gap-3">
            {/* Search trigger: mobile only */}
            <button
              type="button"
              className={`flex min-h-10 min-w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent p-1.5 text-[var(--text-2)] hover:bg-[var(--bg-3)] hover:text-[var(--text)] md:hidden ${focusRing}`}
              onClick={() => setMobileSearchOpen(true)}
              aria-label="Search"
            >
              <Icon d={ICONS.search} className="h-[19px] w-[19px]" />
            </button>

            <ThemeToggleButton />
            <NotificationBell />
            <div className="hidden h-6 w-px bg-[var(--border)] sm:block" aria-hidden="true" />

            {/* Profile */}
            <div ref={profileDropdownRef} className="relative">
              <button
                ref={profileButtonRef}
                type="button"
                onClick={() => setProfileDropdownOpen((prev) => !prev)}
                aria-haspopup="menu"
                aria-expanded={profileDropdownOpen}
                aria-label="Account menu"
                className={`flex max-w-[180px] cursor-pointer items-center gap-2.5 rounded-xl border-none bg-transparent px-1 py-1.5 transition-colors duration-150 hover:bg-[var(--bg-3)] motion-reduce:transition-none sm:px-2 lg:max-w-[240px] ${focusRing}`}
              >
                <div className="hidden min-w-0 text-right sm:block">
                  <div className="truncate text-[13px] font-semibold leading-tight text-[var(--text)]">{user?.name}</div>
                  <div className="truncate pt-0.5 text-[11px] capitalize leading-tight text-[var(--text-3)]">{user?.role}</div>
                </div>
                <Avatar user={user} />
                <Icon
                  d={ICONS.chevronDown}
                  className={`hidden h-3.5 w-3.5 text-[var(--text-3)] transition-transform duration-200 motion-reduce:transition-none sm:block ${profileDropdownOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {profileDropdownOpen && (
                <div
                  role="menu"
                  aria-label="Account"
                  className="absolute right-0 top-[calc(100%+8px)] z-[2000] w-[240px] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-2)] shadow-[var(--shadow-pop)]"
                >
                  <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-4 py-3.5">
                    <Avatar user={user} size="lg" />
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-semibold leading-tight text-[var(--text)]">{user?.name}</div>
                      <div className="truncate text-[11px] capitalize leading-tight text-[var(--text-3)]">{user?.role}</div>
                    </div>
                  </div>
                  <div className="p-1.5">
                    {/* "View Profile" and "Account Settings" pointed to the same page, so they are one item now. */}
                    <ThemeSwitch />
                    <div className="mx-0 my-1.5 h-px bg-[var(--border)]" role="separator" />
                    <MenuButton icon={ICONS.settings} onClick={() => navigate('/account-settings')}>
                      Account settings
                    </MenuButton>
                    <div className="mx-0 my-1.5 h-px bg-[var(--border)]" role="separator" />
                    <MenuButton icon={ICONS.logout} onClick={handleLogoutClick} danger>
                      Log out
                    </MenuButton>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Mobile search overlay: sits on top of the header row */}
          {mobileSearchOpen && (
            <div className="absolute inset-0 z-[110] flex items-center gap-2 bg-[var(--bg-2)] px-3 md:hidden">
              <GlobalSearch autoFocus onClose={() => setMobileSearchOpen(false)} />
              <button
                type="button"
                onClick={() => setMobileSearchOpen(false)}
                className={`min-h-10 shrink-0 cursor-pointer rounded-md border-none bg-transparent px-2 py-2 text-[13px] font-medium text-[var(--text-2)] hover:text-[var(--text)] ${focusRing}`}
              >
                Cancel
              </button>
            </div>
          )}
        </header>

        {/* Screen readers: announce when new task requests or review items arrive */}
        <div role="status" aria-live="polite" className="sr-only">
          {[
            newRequests > 0 && `${newRequests} new task ${newRequests === 1 ? 'request' : 'requests'}`,
            newReviews > 0 && `${newReviews} ${newReviews === 1 ? 'task' : 'tasks'} waiting for review`,
            newAssigned > 0 && `${newAssigned} new ${newAssigned === 1 ? 'task' : 'tasks'} for you`,
          ].filter(Boolean).join('. ')}
        </div>

        <main
          id="main-content"
          ref={mainRef}
          tabIndex={-1}
          className="flex-1 overflow-y-auto overflow-x-hidden bg-[var(--bg)] outline-none"
        >
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      <ConfirmModal
        isOpen={confirmModal.show}
        title="Log out"
        message="Are you sure you want to log out?"
        confirmText="Log out"
        isDangerous={true}
        onConfirm={handleConfirmLogout}
        onCancel={() => setConfirmModal({ show: false, loading: false })}
        loading={confirmModal.loading}
      />
    </div>
  );
}