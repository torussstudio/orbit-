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
    <div style={{ position: 'relative', flex: 1, maxWidth: '480px' }}>
      <div style={{ position: 'relative' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }}>
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results && hasResults && setShowDropdown(true)}
          placeholder="Search projects, tasks, members..."
          style={{
            width: '100%', padding: '8px 12px 8px 36px', borderRadius: '8px',
            border: '1px solid var(--border)', background: 'var(--bg-3)',
            fontSize: '13px', color: 'var(--text)', outline: 'none',
            boxSizing: 'border-box', transition: 'border-color 0.15s',
          }}
          onFocusCapture={e => e.target.style.borderColor = 'var(--accent)'}
          onBlurCapture={e => e.target.style.borderColor = 'var(--border)'}
        />
        {loading && (
          <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)' }}>
            <div className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }} />
          </div>
        )}
        {query && !loading && (
          <button onClick={() => { setQuery(''); setShowDropdown(false); }}
            style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: '16px', lineHeight: 1, padding: '2px' }}>
            ×
          </button>
        )}
      </div>

      {showDropdown && (
        <div ref={dropdownRef} style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
          background: 'var(--bg-2)', borderRadius: '10px', border: '1px solid var(--border)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 2000, overflow: 'hidden',
          maxHeight: '420px', overflowY: 'auto',
        }}>
          {!hasResults ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-3)', fontSize: '13px' }}>
              No results for "{query}"
            </div>
          ) : (
            <>
              <div style={{ padding: '8px 14px', fontSize: '11px', color: 'var(--text-3)', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>
                {totalCount} result{totalCount !== 1 ? 's' : ''} found
              </div>

              {results.projects?.length > 0 && (
                <div>
                  <div style={{ padding: '8px 14px 4px', fontSize: '10px', fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.8px', textTransform: 'uppercase' }}>Projects</div>
                  {results.projects.map(p => (
                    <Link key={p.id} to={`/projects/${p.id}`} onClick={handleSelect}
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', textDecoration: 'none', transition: 'background 0.1s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-3)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(99,102,241,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" /></svg>
                      </div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>{p.name}</div>
                        {p.description && <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '1px' }}>{p.description.slice(0, 50)}{p.description.length > 50 ? '...' : ''}</div>}
                      </div>
                      <span style={{ marginLeft: 'auto', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'var(--bg-4)', color: 'var(--text-3)' }}>{p.status}</span>
                    </Link>
                  ))}
                </div>
              )}

              {results.tasks?.length > 0 && (
                <div style={{ borderTop: results.projects?.length > 0 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ padding: '8px 14px 4px', fontSize: '10px', fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.8px', textTransform: 'uppercase' }}>Tasks</div>
                  {results.tasks.map(t => (
                    <Link key={t.id} to={`/projects/${t.project_id}/tasks/${t.id}`} onClick={handleSelect}
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', textDecoration: 'none', transition: 'background 0.1s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-3)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: 'rgba(245,158,11,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '1px' }}>{t.project_name}</div>
                      </div>
                      <span className={`badge badge-${t.stage?.toLowerCase().replace(/\s/g,'')}`} style={{ fontSize: '10px', flexShrink: 0 }}>{t.stage}</span>
                    </Link>
                  ))}
                </div>
              )}

              {results.members?.length > 0 && (
                <div style={{ borderTop: (results.projects?.length > 0 || results.tasks?.length > 0) ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ padding: '8px 14px 4px', fontSize: '10px', fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.8px', textTransform: 'uppercase' }}>Members</div>
                  {results.members.map(m => (
                    <Link key={m.id} to="/members" onClick={handleSelect}
                      style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', textDecoration: 'none', transition: 'background 0.1s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-3)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <div className="user-avatar" style={{ width: '28px', height: '28px', fontSize: '11px', flexShrink: 0 }}>{m.name[0]}</div>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>{m.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '1px' }}>{m.email}</div>
                      </div>
                      <span style={{ marginLeft: 'auto', fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'var(--bg-4)', color: 'var(--text-3)' }}>{m.role}</span>
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

  // Close dropdown on route change
  useEffect(() => {
    setProfileDropdownOpen(false);
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

  // Close profile dropdown on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(e.target)) {
        setProfileDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-text">⬡ Orbit</div>
          <div className="logo-sub">Agency OS</div>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-section-label">Main</div>
          <nav className="sidebar-nav">
            <NavLink to="/" end>
              <Icon d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              Dashboard
            </NavLink>
            <NavLink to="/projects">
              <Icon d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
              Projects
            </NavLink>
            <NavLink to="/calendar">
              <Icon d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              Calendar
            </NavLink>
            {isManager && (
              <NavLink to="/members">
                <Icon d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
                Members
              </NavLink>
            )}
            {isManager && (
              <NavLink to="/in-review">
                <Icon d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                In Review
              </NavLink>
            )}
          </nav>
        </div>

        {/* Sidebar footer kept minimal — main profile now lives in header */}
        <div className="sidebar-footer" style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-3)', textAlign: 'center' }}>
            Orbit Agency OS
          </div>
        </div>
      </aside>

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        {/* Top Header */}
        <header style={{
          height: '73.5px', background: 'var(--bg-2)', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', padding: '0 24px', gap: '16px',
          position: 'sticky', top: 0, zIndex: 100,
        }}>
          <GlobalSearch />

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: 'auto' }}>
            <NotificationBell />

            <div style={{ width: '1px', height: '24px', background: 'var(--border)' }} />

            {/* Profile Section */}
            <div ref={profileDropdownRef} style={{ position: 'relative' }}>
              {/* Profile trigger button */}
              <button
                onClick={() => setProfileDropdownOpen(prev => !prev)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '6px 8px', borderRadius: '10px',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-3)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                {/* Text info (left side) */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>
                    {user?.name}
                  </div>
                  <div style={{ display: 'flex' , gap: '5px' , justifyContent: 'end', paddingTop: '3px'}}>

                {/* Chevron down */}
                <svg
                  width="13" height="13" viewBox="0 0 24 24" fill="none"
                  stroke="var(--text-3)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ flexShrink: 0, transition: 'transform 0.2s', transform: profileDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>


                  <div style={{ fontSize: '11px', color: 'var(--text-3)', lineHeight: 1.3, textTransform: 'capitalize' }}>
                    {user?.role}
                  </div>

                  </div>
                </div>

                {/* Avatar (right side) */}
                <div className="user-avatar" style={{ width: '36px', height: '36px', fontSize: '14px', fontWeight: 700, flexShrink: 0, overflow: 'hidden', padding: 0 }}>
    {user?.avatar_url
      ? <img src={user.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', display: 'block' }} />
      : user?.name?.[0]?.toUpperCase()
    }
  </div>
              </button>

              {/* Dropdown menu */}
              {profileDropdownOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                  background: 'var(--bg-2)', borderRadius: '12px',
                  border: '1px solid var(--border)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
                  minWidth: '200px', overflow: 'hidden', zIndex: 2000,
                }}>
                  {/* User info header in dropdown */}
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className="user-avatar" style={{ width: '36px', height: '36px', fontSize: '14px', fontWeight: 700, flexShrink: 0, overflow: 'hidden', padding: 0 }}>
    {user?.avatar_url
      ? <img src={user.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', display: 'block' }} />
      : user?.name?.[0]?.toUpperCase()
    }
  </div>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>{user?.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-3)', lineHeight: 1.3, textTransform: 'capitalize' }}>{user?.role}</div>
                    </div>
                  </div>

                  {/* Menu items */}
                  <div style={{ padding: '6px' }}>
                    {/* View Profile → Account Settings (same page, top section) */}
                    <button
                      onClick={() => navigate('/account-settings')}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        width: '100%', padding: '9px 10px', borderRadius: '8px',
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: '13px', color: 'var(--text)', textAlign: 'left',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-3)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z" />
                      </svg>
                      View Profile
                    </button>

                    {/* My Task — static for now */}
                    <button
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        width: '100%', padding: '9px 10px', borderRadius: '8px',
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: '13px', color: 'var(--text)', textAlign: 'left',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-3)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                      </svg>
                      My Task
                    </button>

                    {/* Account Settings → navigates to /account-settings */}
                    <button
                      onClick={() => navigate('/account-settings')}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        width: '100%', padding: '9px 10px', borderRadius: '8px',
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: '13px', color: 'var(--text)', textAlign: 'left',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-3)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                      </svg>
                      Account Settings
                    </button>

                    <div style={{ height: '1px', background: 'var(--border)', margin: '6px 0' }} />

                    {/* Logout — functional */}
                    <button
                      onClick={handleLogoutClick}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        width: '100%', padding: '9px 10px', borderRadius: '8px',
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: '13px', color: 'var(--danger, #ef4444)', textAlign: 'left',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
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

        <main className="main-content">
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