import { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import NotificationBell from '../ui/NotificationBell';
import ConfirmModal from '../ui/ConfirmModal';
import api from '../../api/client';

const Icon = ({ d }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

function Avatar({ user, size = 'md' }) {
  const dims = size === 'sm' ? 'w-7 h-7 text-[11px]' : 'w-9 h-9 text-sm';
  return (
    <div className={`${dims} rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center font-bold text-white flex-shrink-0 overflow-hidden`}>
      {user?.avatar_url
        ? <img src={user.avatar_url} alt="avatar" className="w-full h-full object-cover rounded-full block" />
        : user?.name?.[0]?.toUpperCase()
      }
    </div>
  );
}

function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (query.trim().length < 2) { setResults(null); setShowDropdown(false); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get(`/search?q=${encodeURIComponent(query)}`);
        setResults(res.data);
        setShowDropdown(true);
      } catch { setResults(null); }
      finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) && !inputRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const hasResults = results && (results.projects?.length > 0 || results.tasks?.length > 0 || results.members?.length > 0);
  const totalCount = results ? (results.projects?.length || 0) + (results.tasks?.length || 0) + (results.members?.length || 0) : 0;
  const handleSelect = () => { setQuery(''); setShowDropdown(false); };

  return (
    <div className="relative flex-1 max-w-[480px] min-w-0">
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
          placeholder="Search projects, tasks, members..."
          className="w-full pl-9 pr-9 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-3)] text-[13px] text-[var(--text)] outline-none transition-colors focus:border-[var(--accent)] focus:shadow-[var(--shadow-glow)]"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-3.5 h-3.5 border-2 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin" />
          </div>
        )}
        {query && !loading && (
          <button onClick={() => { setQuery(''); setShowDropdown(false); }}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-[var(--text-3)] text-base leading-none p-0.5 hover:text-[var(--text)]">
            ×
          </button>
        )}
      </div>

      {showDropdown && (
        <div ref={dropdownRef} className="absolute top-[calc(100%+6px)] left-0 right-0 bg-[var(--bg-2)] rounded-xl border border-[var(--border)] shadow-[0_8px_24px_rgba(0,0,0,0.12)] z-[2000] overflow-hidden max-h-[420px] overflow-y-auto">
          {!hasResults ? (
            <div className="p-6 text-center text-[var(--text-3)] text-[13px]">No results for "{query}"</div>
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
                      <div>
                        <div className="text-[13px] font-medium text-[var(--text)]">{p.name}</div>
                        {p.description && <div className="text-[11px] text-[var(--text-3)] mt-px">{p.description.slice(0, 50)}{p.description.length > 50 ? '...' : ''}</div>}
                      </div>
                      <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-4)] text-[var(--text-3)]">{p.status}</span>
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
                        <div className="text-[11px] text-[var(--text-3)] mt-px">{t.project_name}</div>
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
                      <div>
                        <div className="text-[13px] font-medium text-[var(--text)]">{m.name}</div>
                        <div className="text-[11px] text-[var(--text-3)] mt-px">{m.email}</div>
                      </div>
                      <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-4)] text-[var(--text-3)]">{m.role}</span>
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
  }, [location.pathname]);

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
  ];

  const sidebarWidth = sidebarCollapsed ? 'w-[72px] min-w-[72px]' : 'w-[240px] min-w-[240px]';

  const DropdownButton = ({ onClick, children }) => (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 w-full px-2.5 py-2.5 rounded-lg bg-transparent border-none cursor-pointer text-[13px] text-[var(--text)] text-left transition-colors hover:bg-[var(--bg-3)]"
    >
      {children}
    </button>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/40 z-[1400] backdrop-blur-sm md:hidden animate-[fadeIn_0.15s_ease]"
          onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        sidebar bg-[var(--bg-2)] border-r border-[var(--border)] flex flex-col overflow-y-auto
        shadow-[2px_0_12px_rgba(99,102,241,0.04)] relative flex-shrink-0 transition-all duration-200
        fixed md:static top-0 left-0 bottom-0 z-[1500]
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        md:${sidebarWidth} w-[240px] min-w-[240px]
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

        {/* Logo */}
        <div className={`border-b border-[var(--border)] mb-2 flex items-center gap-2.5 ${sidebarCollapsed ? 'md:justify-center md:px-2 py-6' : 'px-5 py-6'}`}>
          <div className="text-lg font-bold text-[var(--text)] tracking-[-0.3px]">⬡ Orbit</div>
          {!sidebarCollapsed && <div className="text-[11px] text-[var(--text-3)] tracking-[0.5px] mt-px">Agency OS</div>}
        </div>

        {/* Nav */}
        <div className="px-3 py-1">
          {!sidebarCollapsed && <div className="text-[10px] font-semibold uppercase tracking-[1.2px] text-[var(--text-3)] px-2 mb-1">Main</div>}
          <nav className="flex flex-col gap-px">
            {navItems.map(item => (
              <NavLink key={item.to} to={item.to} end={item.end} title={item.label}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded-lg no-underline text-[13.5px] font-medium transition-all duration-150
                  ${sidebarCollapsed ? 'md:justify-center md:px-2.5' : ''}
                  ${isActive ? 'bg-indigo-50 text-[var(--accent)] font-semibold' : 'text-[var(--text-2)] hover:bg-[var(--bg-3)] hover:text-[var(--text)]'}`
                }
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                  <path d={item.icon} />
                </svg>
                {!sidebarCollapsed && <span>{item.label}</span>}
              </NavLink>
            ))}
            {isManager && (
              <NavLink to="/members" title="Members"
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded-lg no-underline text-[13.5px] font-medium transition-all duration-150
                  ${sidebarCollapsed ? 'md:justify-center md:px-2.5' : ''}
                  ${isActive ? 'bg-indigo-50 text-[var(--accent)] font-semibold' : 'text-[var(--text-2)] hover:bg-[var(--bg-3)] hover:text-[var(--text)]'}`
                }
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
                </svg>
                {!sidebarCollapsed && <span>Members</span>}
              </NavLink>
            )}
            {isManager && (
              <NavLink to="/in-review" title="In Review"
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded-lg no-underline text-[13.5px] font-medium transition-all duration-150
                  ${sidebarCollapsed ? 'md:justify-center md:px-2.5' : ''}
                  ${isActive ? 'bg-indigo-50 text-[var(--accent)] font-semibold' : 'text-[var(--text-2)] hover:bg-[var(--bg-3)] hover:text-[var(--text)]'}`
                }
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                  <path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                </svg>
                {!sidebarCollapsed && <span>In Review</span>}
              </NavLink>
            )}
          </nav>
        </div>

        {/* Footer */}
        <div className="mt-auto px-4 py-3 border-t border-[var(--border)] bg-[var(--bg-3)]">
          {!sidebarCollapsed && <div className="text-[11px] text-[var(--text-3)] text-center">Orbit Agency OS</div>}
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top Header */}
        <header className="h-[73.5px] bg-[var(--bg-2)] border-b border-[var(--border)] flex items-center px-6 gap-4 sticky top-0 z-[100]">
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

          <GlobalSearch />

          <div className="flex items-center gap-3 ml-auto">
            <NotificationBell />
            <div className="w-px h-6 bg-[var(--border)]" />

            {/* Profile Section */}
            <div ref={profileDropdownRef} className="relative">
              <button
                onClick={() => setProfileDropdownOpen(prev => !prev)}
                className="flex items-center gap-2.5 bg-transparent border-none cursor-pointer px-2 py-1.5 rounded-xl hover:bg-[var(--bg-3)] transition-colors"
              >
                <div className="text-right">
                  <div className="text-[13px] font-semibold text-[var(--text)] leading-tight">{user?.name}</div>
                  <div className="flex gap-1 justify-end pt-0.5">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      className={`flex-shrink-0 transition-transform duration-200 ${profileDropdownOpen ? 'rotate-180' : ''}`}>
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                    <div className="text-[11px] text-[var(--text-3)] leading-tight capitalize">{user?.role}</div>
                  </div>
                </div>
                <Avatar user={user} />
              </button>

              {profileDropdownOpen && (
                <div className="absolute top-[calc(100%+8px)] right-0 bg-[var(--bg-2)] rounded-xl border border-[var(--border)] shadow-[0_8px_32px_rgba(0,0,0,0.14)] min-w-[200px] overflow-hidden z-[2000]">
                  <div className="px-4 py-3.5 border-b border-[var(--border)] flex items-center gap-2.5">
                    <Avatar user={user} />
                    <div>
                      <div className="text-[13px] font-semibold text-[var(--text)] leading-tight">{user?.name}</div>
                      <div className="text-[11px] text-[var(--text-3)] leading-tight capitalize">{user?.role}</div>
                    </div>
                  </div>
                  <div className="p-1.5">
                    <DropdownButton onClick={() => navigate('/account-settings')}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" />
                      </svg>
                      View Profile
                    </DropdownButton>
                    <DropdownButton onClick={() => navigate('/account-settings')}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                      </svg>
                      Account Settings
                    </DropdownButton>
                    <div className="h-px bg-[var(--border)] my-1.5 mx-0" />
                    <button
                      onClick={handleLogoutClick}
                      className="flex items-center gap-2.5 w-full px-2.5 py-2.5 rounded-lg bg-transparent border-none cursor-pointer text-[13px] text-red-500 text-left transition-colors hover:bg-red-50"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
                      </svg>
                      Log Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-[var(--bg)]">
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