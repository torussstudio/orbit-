import { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import NotificationBell from '../ui/NotificationBell';
import ConfirmModal from '../ui/ConfirmModal';
import api from '../../api/client';
import { animateEntrance } from '../../utils/entranceAnimation';
import Loader from '../ui/Loader';

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
  search: 'M21 21l-4.35-4.35M19 11a8 8 0 11-16 0 8 8 0 0116 0z',
  close: 'M18 6L6 18M6 6l12 12',
  menu: 'M3 12h18M3 6h18M3 18h18',
  chevronDown: 'M6 9l6 6 6-6',
  chevronLeft: 'M15 18l-6-6 6-6',
  user: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M16 7a4 4 0 11-8 0 4 4 0 018 0z',
  settings:
    'M15 12a3 3 0 11-6 0 3 3 0 016 0zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z',
  logout: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
};

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
  const mainRef = useRef(null);

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

  useEffect(() => animateEntrance(mainRef.current), [location.pathname]);

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

  const navItems = [
    { to: '/', end: true, icon: ICONS.home, label: 'Dashboard' },
    ...(!isManager ? [{ to: '/tasks-view', icon: ICONS.tasks, label: 'Task View' }] : []),
    ...(isManager ? [{ to: '/projects', icon: ICONS.projects, label: 'Projects' }] : []),
    { to: '/calendar', icon: ICONS.calendar, label: 'Calendar' },
    ...(isManager ? [{ to: '/members', icon: ICONS.members, label: 'Members' }] : []),
    ...(isManager ? [{ to: '/in-review', icon: ICONS.review, label: 'In Review' }] : []),
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
              className={`-mr-1 shrink-0 cursor-pointer rounded-lg border-none bg-transparent p-1.5 text-[var(--text-3)] hover:bg-[var(--bg-3)] hover:text-[var(--text)] md:hidden ${focusRing}`}
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            >
              <Icon d={ICONS.close} className="h-[18px] w-[18px]" />
            </button>
          </div>

          {/* Nav */}
          <nav aria-label="Main" className="px-3 py-1">
            <div className={`mb-1 px-2 text-[11px] font-medium text-[var(--text-3)] ${labelClass}`}>Main</div>
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
              {navItems.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    title={item.label}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) => [
                      'group relative flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[14px] font-medium no-underline md:py-2 md:text-[13.5px]',
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
                        <Icon d={item.icon} />
                        <span className={`truncate ${labelClass}`}>{item.label}</span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
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
            className={`flex shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent p-1.5 text-[var(--text-2)] hover:bg-[var(--bg-3)] hover:text-[var(--text)] md:hidden ${focusRing}`}
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            aria-expanded={mobileOpen}
          >
            <Icon d={ICONS.menu} className="h-5 w-5" />
          </button>

          {/* Search: inline from md up */}
          <div className="hidden min-w-0 flex-1 md:flex">
            <GlobalSearch />
          </div>

          <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-2 md:gap-3">
            {/* Search trigger: mobile only */}
            <button
              type="button"
              className={`flex shrink-0 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent p-1.5 text-[var(--text-2)] hover:bg-[var(--bg-3)] hover:text-[var(--text)] md:hidden ${focusRing}`}
              onClick={() => setMobileSearchOpen(true)}
              aria-label="Search"
            >
              <Icon d={ICONS.search} className="h-[19px] w-[19px]" />
            </button>

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
                  className="absolute right-0 top-[calc(100%+8px)] z-[2000] w-[220px] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-2)] shadow-lg"
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
                className={`shrink-0 cursor-pointer rounded-md border-none bg-transparent px-2 py-2 text-[13px] font-medium text-[var(--text-2)] hover:text-[var(--text)] ${focusRing}`}
              >
                Cancel
              </button>
            </div>
          )}
        </header>

        <main
          id="main-content"
          ref={mainRef}
          tabIndex={-1}
          className="flex-1 overflow-y-auto overflow-x-hidden bg-[var(--bg)] outline-none"
        >
          <Outlet />
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