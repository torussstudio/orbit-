import { Outlet, NavLink, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const Icon = ({ d }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

export default function Layout() {
  const { user, logout, isManager } = useAuth();

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
          </nav>
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="user-avatar">{user?.name?.[0]?.toUpperCase()}</div>
            <div className="user-info">
              <div className="user-name">{user?.name}</div>
              <div className="user-role">{user?.role}</div>
            </div>
            <button className="btn-logout" onClick={logout} title="Logout">⏻</button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
