import { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import NotificationBell from '../ui/NotificationBell';
import ConfirmModal from '../ui/ConfirmModal';
import api from '../../api/client';
import { animateEntrance } from '../../utils/entranceAnimation';
import Loader from '../ui/Loader';

const Icon = ({ d }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

function Avatar({ user, size = 'md' }) {
  const dims = size === 'sm' ? 'w-7 h-7 text-[11px]' : 'w-8 h-8 sm:w-9 sm:h-9 text-[13px] sm:text-sm';
  return (
    <div className={`${dims} rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white flex-shrink-0 overflow-hidden`}>
      {user?.avatar_url
        ? <img src={user.avatar_url} alt="avatar" className="w-full h-full object-cover rounded-full block" />
        : user?.name?.[0]?.toUpperCase()
      }
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

  const hasResults = results && (results.projects?.length > 0 || results.tasks?.length > 0 || results.members?.length > 0);
  const totalCount = results ? (results.projects?.length || 0) + (results.tasks?.length || 0) + (results.members?.length || 0) : 0;
  const handleSelect = () => { setQuery(''); setShowDropdown(false); onClose?.(); };

  return (
    <div className="relative flex-1 min-w-0 md:max-w-[480px]">
      <div className="relative">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)] pointer-events-none">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results && hasResults && setShowDropdown(true)}
          onKeyDown={e => { if (e.key === 'Escape') { setShowDropdown(false); onClose?.(); } }}
          placeholder="Search projects, tasks, members..."
          className="w-full pl-9 pr-9 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-3)] text-[16px] md:text-[13px] text-[var(--text)] outline-none transition-colors focus:border-[var(--accent)] focus:shadow-[var(--shadow-glow)]"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Loader label="Searching" size="sm" />
          </div>
        )}
        {query && !loading && (
          <button onClick={() => { setQuery(''); setShowDropdown(false); inputRef.current?.focus(); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-[var(--text-3)] text-base leading-none p-0.5 hover:text-[var(--text)]">
            ×
          </button>
        )}
      </div>

      {showDropdown && (
        <div ref={dropdownRef} className="absolute top-[calc(100%+6px)] left-0 right-0 bg-[var(--bg-2)] rounded-xl border border-[var(--border)] shadow-[0_8px_24px_rgba(0,0,0,0.12)] z-[2000] overflow-hidden max-h-[60vh] md:max-h-[420px] overflow-y-auto overscroll-contain">
          {!hasResults ? (
            <div className="p-6 text-center text-[var(--text-3)] text-[13px] break-words">No results for "{query}"</div>
          ) : (
            <>
              <div className="px-3.5 py-2 text-[11px] text-[var(--text-3)] border-b border-[var(--border)] font-semibold">
                {totalCount} result{totalCount !== 1 ? 's' : ''} found
              </div>

              {results.projects?.length > 0 && (
                <div>
                  <div className="px-3.5 pt-2 pb-1 text-[10px] font-bold text-[var(--text-3)] uppercase tracking-widest">Projects</div>
                  {results.projects.map(p => (
                    <Link key={p.id} to={`/projects/${p.id}`} onClick={handleSelect}
                      className="flex items-center gap-2.5 px-3.5 py-2 no-underline hover:bg-[var(--bg-3)] transition-colors">
                      <div className="w-7 h-7 rounded-md bg-indigo-100 flex items-center justify-center flex-shrink-0">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /></svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-[var(--text)] truncate">{p.name}</div>
                        {p.description && <div className="text-[11px] text-[var(--text-3)] mt-px truncate">{p.description}</div>}
                      </div>
                      <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-4)] text-[var(--text-3)] flex-shrink-0">{p.status}</span>
                    </Link>
                  ))}
                </div>
              )}

              {results.tasks?.length > 0 && (
                <div className={results.projects?.length > 0 ? 'border-t border-[var(--border)]' : ''}>
                  <div className="px-3.5 pt-2 pb-1 text-[10px] font-bold text-[var(--text-3)] uppercase tracking-widest">Tasks</div>
                  {results.tasks.map(t => (
                    <Link key={t.id} to={`/projects/${t.project_id}/tasks/${t.id}`} onClick={handleSelect}
                      className="flex items-center gap-2.5 px-3.5 py-2 no-underline hover:bg-[var(--bg-3)] transition-colors">
                      <div className="w-7 h-7 rounded-md bg-amber-100 flex items-center justify-center flex-shrink-0">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-[var(--text)] truncate">{t.title}</div>
                        <div className="text-[11px] text-[var(--text-3)] mt-px truncate">{t.project_name}</div>
                      </div>
                      <span className={`badge badge-${t.stage?.toLowerCase().replace(/\s/g, '')} text-[10px] flex-shrink-0`}>{t.stage}</span>
                    </Link>
                  ))}
                </div>
              )}

              {results.members?.length > 0 && (
                <div className={(results.projects?.length > 0 || results.tasks?.length > 0) ? 'border-t border-[var(--border)]' : ''}>
                  <div className="px-3.5 pt-2 pb-1 text-[10px] font-bold text-[var(--text-3)] uppercase tracking-widest">Members</div>
                  {results.members.map(m => (
                    <Link key={m.id} to="/members" onClick={handleSelect}
                      className="flex items-center gap-2.5 px-3.5 py-2 no-underline hover:bg-[var(--bg-3)] transition-colors">
                      <Avatar user={m} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium text-[var(--text)] truncate">{m.name}</div>
                        <div className="text-[11px] text-[var(--text-3)] mt-px truncate">{m.email}</div>
                      </div>
                      <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-4)] text-[var(--text-3)] flex-shrink-0">{m.role}</span>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, logout, isManager } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [confirmModal, setConfirmModal] = useState({ show: false, loading: false });
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const profileDropdownRef = useRef(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('orbit_sidebar_collapsed') === '1'; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mainRef = useRef(null);

  const toggleCollapsed = () => {
    setSidebarCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('orbit_sidebar_collapsed', next ? '1' : '0'); } catch {}
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
    if (!mobileOpen) return;
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
    setConfirmModal(prev => ({ ...prev, loading: true }));
    try {
      await logout();
      navigate('/login');
    } finally {
      setConfirmModal({ show: false, loading: false });
    }
  };

  useEffect(() => {
    const handleClick = (e) => {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(e.target)) {
        setProfileDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const navItems = [
    { to: '/', end: true, icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z', label: 'Dashboard' },
    ...(!isManager ? [{ to: '/tasks-view', icon: 'M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11', label: 'Task View' }] : []),
    ...(isManager ? [{ to: '/projects', icon: 'M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z', label: 'Projects' }] : []),
    { to: '/calendar', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', label: 'Calendar' },
    ...(isManager ? [{ to: '/members', icon: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75', label: 'Members' }] : []),
    ...(isManager ? [{ to: '/in-review', icon: 'M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11', label: 'In Review' }] : []),
  ];

  // Collapse only applies from md up — the mobile drawer always shows full labels
  const labelClass = sidebarCollapsed ? 'md:hidden' : '';
  const centerClass = sidebarCollapsed ? 'md:justify-center md:px-2.5' : '';

  const DropdownButton = ({ onClick, children }) => (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 w-full px-2.5 py-2.5 rounded-lg bg-transparent border-none cursor-pointer text-[13px] text-[var(--text)] text-left transition-colors hover:bg-[var(--bg-3)]"
    >
      {children}
    </button>
  );

  return (
    <div className="flex h-[100dvh] overflow-hidden">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/40 z-[1400] backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar — fixed drawer on mobile, in-flow column from md up */}
      <aside className={`
        fixed md:relative inset-y-0 left-0 z-[1500]
        bg-[var(--bg-2)] border-r border-[var(--border)] flex flex-col
        shadow-[2px_0_12px_rgba(99,102,241,0.04)] flex-shrink-0
        transition-[transform,width] duration-200 ease-out
        w-[min(272px,85vw)] ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
        ${sidebarCollapsed ? 'md:w-[72px]' : 'md:w-[240px] lg:w-[248px]'}
      `}>
        {/* Collapse toggle — desktop only */}
        <button
          className="hidden md:flex absolute top-[22px] -right-3 w-6 h-6 rounded-full bg-[var(--bg-2)] border border-[var(--border)] items-center justify-center cursor-pointer text-[var(--text-2)] shadow-[var(--shadow)] z-10 hover:bg-[var(--bg-3)] hover:text-[var(--accent)] transition-colors"
          onClick={toggleCollapsed}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className={`transition-transform duration-200 ${sidebarCollapsed ? 'rotate-180' : ''}`}>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        {/* Inner scroll container so the toggle button never gets clipped */}
        <div className="flex flex-col h-full overflow-y-auto overscroll-contain">
          {/* Logo */}
          <div className={`border-b border-[var(--border)] mb-2 flex items-center justify-between gap-2.5 px-5 py-5 md:py-6 ${sidebarCollapsed ? 'md:justify-center md:px-2' : ''}`}>
            <div className="flex items-baseline gap-2 min-w-0">
              <div className="text-lg font-bold text-[var(--text)] tracking-[-0.3px] whitespace-nowrap">⬡ Orbit</div>
              <div className={`text-[11px] text-[var(--text-3)] tracking-[0.5px] whitespace-nowrap ${labelClass}`}>Agency OS</div>
            </div>
            {/* Close drawer — mobile only */}
            <button
              className="md:hidden bg-transparent border-none cursor-pointer text-[var(--text-3)] p-1 -mr-1 rounded-lg hover:bg-[var(--bg-3)] hover:text-[var(--text)] flex-shrink-0"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Nav */}
          <div className="px-3 py-1">
            <div className={`text-[10px] font-semibold uppercase tracking-[1.2px] text-[var(--text-3)] px-2 mb-1 ${labelClass}`}>Main</div>
            <nav className="flex flex-col gap-px">
              {navItems.map(item => (
                <NavLink key={item.to} to={item.to} end={item.end} title={item.label}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3 py-2.5 md:py-2 rounded-lg no-underline text-[14px] md:text-[13.5px] font-medium transition-all duration-150
                    ${centerClass}
                    ${isActive ? 'bg-indigo-50 text-[var(--accent)] font-semibold' : 'text-[var(--text-2)] hover:bg-[var(--bg-3)] hover:text-[var(--text)]'}`
                  }
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                    <path d={item.icon} />
                  </svg>
                  <span className={`truncate ${labelClass}`}>{item.label}</span>
                </NavLink>
              ))}
            </nav>
          </div>

          {/* Footer */}
          <div className="mt-auto px-4 py-3 border-t border-[var(--border)] bg-[var(--bg-3)]">
            <div className={`text-[11px] text-[var(--text-3)] text-center whitespace-nowrap ${labelClass}`}>Orbit Agency OS</div>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top Header */}
        <header className="relative min-h-[60px] md:min-h-[73.5px] bg-[var(--bg-2)] border-b border-[var(--border)] flex items-center px-3 sm:px-4 md:px-6 gap-2 sm:gap-3 md:gap-4 sticky top-0 z-[100] flex-shrink-0">
          {/* Mobile hamburger */}
          <button
            className="md:hidden bg-transparent border-none cursor-pointer text-[var(--text-2)] p-1.5 rounded-lg hover:bg-[var(--bg-3)] hover:text-[var(--text)] flex items-center justify-center flex-shrink-0"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>

          {/* Search — inline from md up */}
          <div className="hidden md:flex flex-1 min-w-0">
            <GlobalSearch />
          </div>

          <div className="flex items-center gap-1 sm:gap-2 md:gap-3 ml-auto min-w-0">
            {/* Search trigger — mobile only */}
            <button
              className="md:hidden bg-transparent border-none cursor-pointer text-[var(--text-2)] p-1.5 rounded-lg hover:bg-[var(--bg-3)] hover:text-[var(--text)] flex items-center justify-center flex-shrink-0"
              onClick={() => setMobileSearchOpen(true)}
              aria-label="Search"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
            </button>

            <NotificationBell />
            <div className="w-px h-6 bg-[var(--border)] hidden sm:block" />

            {/* Profile Section */}
            <div ref={profileDropdownRef} className="relative">
              <button
                onClick={() => setProfileDropdownOpen(prev => !prev)}
                className="flex items-center gap-2.5 bg-transparent border-none cursor-pointer px-1 sm:px-2 py-1.5 rounded-xl hover:bg-[var(--bg-3)] transition-colors max-w-[180px] lg:max-w-[240px]"
              >
                <div className="text-right hidden sm:block min-w-0">
                  <div className="text-[13px] font-semibold text-[var(--text)] leading-tight truncate">{user?.name}</div>
                  <div className="flex gap-1 justify-end pt-0.5">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      className={`flex-shrink-0 transition-transform duration-200 ${profileDropdownOpen ? 'rotate-180' : ''}`}>
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                    <div className="text-[11px] text-[var(--text-3)] leading-tight capitalize truncate">{user?.role}</div>
                  </div>
                </div>
                <Avatar user={user} />
              </button>

              {profileDropdownOpen && (
                <div className="absolute top-[calc(100%+8px)] right-0 bg-[var(--bg-2)] rounded-xl border border-[var(--border)] shadow-[0_8px_32px_rgba(0,0,0,0.14)] w-[220px] max-w-[calc(100vw-24px)] overflow-hidden z-[2000]">
                  <div className="px-4 py-3.5 border-b border-[var(--border)] flex items-center gap-2.5">
                    <Avatar user={user} />
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-[var(--text)] leading-tight truncate">{user?.name}</div>
                      <div className="text-[11px] text-[var(--text-3)] leading-tight capitalize truncate">{user?.role}</div>
                    </div>
                  </div>
                  <div className="p-1.5">
                    <DropdownButton onClick={() => navigate('/account-settings')}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" />
                      </svg>
                      View Profile
                    </DropdownButton>
                    <DropdownButton onClick={() => navigate('/account-settings')}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                        <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                      </svg>
                      Account Settings
                    </DropdownButton>
                    <div className="h-px bg-[var(--border)] my-1.5 mx-0" />
                    <button
                      onClick={handleLogoutClick}
                      className="flex items-center gap-2.5 w-full px-2.5 py-2.5 rounded-lg bg-transparent border-none cursor-pointer text-[13px] text-red-500 text-left transition-colors hover:bg-red-50"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
                      </svg>
                      Log Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Mobile search overlay — sits on top of the header row */}
          {mobileSearchOpen && (
            <div className="md:hidden absolute inset-0 bg-[var(--bg-2)] flex items-center gap-2 px-3 z-[110]">
              <GlobalSearch autoFocus onClose={() => setMobileSearchOpen(false)} />
              <button
                onClick={() => setMobileSearchOpen(false)}
                className="bg-transparent border-none cursor-pointer text-[13px] text-[var(--text-2)] px-1 py-2 flex-shrink-0 hover:text-[var(--text)]"
              >
                Cancel
              </button>
            </div>
          )}
        </header>

        <main ref={mainRef} className="flex-1 overflow-y-auto overflow-x-hidden bg-[var(--bg)]">
          <Outlet />
        </main>
      </div>

      <ConfirmModal
        isOpen={confirmModal.show}
        title="Logout"
        message="Are you sure you want to log out?"
        confirmText="Logout"
        isDangerous={true}
        onConfirm={handleConfirmLogout}
        onCancel={() => setConfirmModal({ show: false, loading: false })}
        loading={confirmModal.loading}
      />
    </div>
  );
}