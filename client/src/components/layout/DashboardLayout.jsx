import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useLocation, useNavigate, Outlet } from 'react-router-dom';

const NAV = [
  { path: '/dashboard', icon: '📊', label: 'Dashboard' },
  { path: '/devices', icon: '📹', label: 'Devices' },
  { path: '/production', icon: '🎬', label: 'Production' },
  { path: '/vmix', icon: '🎛️', label: 'vMix Control' },
  { path: '/events', icon: '📅', label: 'Events' },
  { path: '/analytics', icon: '📈', label: 'Analytics' },
  { path: '/streaming', icon: '📡', label: 'Streaming' },
  { divider: true },
  { path: '/users', icon: '👥', label: 'Users', admin: true },
  { path: '/settings', icon: '⚙️', label: 'Settings', admin: true },
];

export default function DashboardLayout() {
  const { user, logout, isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [clock, setClock] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    tick(); const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const go = (p) => { navigate(p); setSidebarOpen(false); };

  return (
    <div className="app-layout">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <span className="brand-dot"></span>
          <h1>Pixel Perfect</h1>
        </div>
        <nav className="sidebar-nav">
          {NAV.map((item, i) => {
            if (item.divider) return <div key={i} className="nav-divider" />;
            if (item.admin && !isAdmin) return null;
            return (
              <button key={item.path} className={`nav-item ${location.pathname === item.path ? 'active' : ''}`} onClick={() => go(item.path)}>
                <span className="nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div style={{ marginBottom: 4 }}>⚡ Pixel Perfect v2.0</div>
          <div style={{ color: 'var(--text-muted)' }}>Loyadham Broadcast</div>
        </div>
      </aside>

      <div className="main-area">
        <header className="top-header">
          <div className="header-left">
            <button className="btn btn-icon btn-ghost" onClick={() => setSidebarOpen(!sidebarOpen)} style={{ display: 'none' }} id="mobile-menu-btn">☰</button>
            <span className="page-title">{NAV.find(n => n.path === location.pathname)?.label || 'Pixel Perfect'}</span>
          </div>
          <div className="header-right">
            <span className="header-clock">{clock}</span>
            <div className="header-user" onClick={logout} title="Click to logout">
              <span>👤</span>
              <span>{user?.display_name || user?.username}</span>
              <span className="badge badge-info">{user?.role?.replace('_', ' ')}</span>
            </div>
          </div>
        </header>
        <div className="page-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
