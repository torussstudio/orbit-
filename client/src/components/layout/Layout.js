import { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate, Link } from 'react-router-dom';
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
  const [confirmModal, setConfirmModal] = useState({ show: false, loading: false });

  const handleLogoutClick = () => setConfirmModal({ show: true, loading: false });

  const handleConfirmLogout = async () => {
    setConfirmModal(prev => ({ ...prev, loading: true }));
    try {
      await logout();
      navigate('/login');
    } finally {
      setConfirmModal({ show: false, loading: false });
    }
  };

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

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="user-avatar">{user?.name?.[0]?.toUpperCase()}</div>
            <div className="user-info">
              <div className="user-name">{user?.name}</div>
              <div className="user-role">{user?.role}</div>
            </div>
            <button className="btn-logout" onClick={handleLogoutClick} title="Logout">⏻</button>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
            <NotificationBell />
            <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="user-avatar" style={{ width: '32px', height: '32px', fontSize: '13px' }}>
                {user?.name?.[0]?.toUpperCase()}
              </div>
              <div style={{ display: 'none' }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>{user?.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-3)' }}>{user?.role}</div>
              </div>
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