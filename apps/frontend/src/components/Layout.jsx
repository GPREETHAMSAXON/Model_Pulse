import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: '⬡' },
];

export default function Layout() {
  const { user, logout } = useAuthStore();

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--mp-bg)' }}>
      {/* Sidebar */}
      <aside style={{
        width: 220, background: 'var(--mp-surface)',
        borderRight: '1px solid var(--mp-border)',
        display: 'flex', flexDirection: 'column',
        padding: '24px 0', flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ padding: '0 20px 28px', borderBottom: '1px solid var(--mp-border)' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--mp-text)' }}>
            <span style={{ color: 'var(--mp-primary)' }}>Model</span>Pulse
          </div>
          <div style={{ fontSize: 11, color: 'var(--mp-muted)', marginTop: 4 }}>ML Monitoring</div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '16px 12px' }}>
          {nav.map(({ to, label, icon }) => (
            <NavLink key={to} to={to} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', borderRadius: 8, marginBottom: 4,
              textDecoration: 'none', fontSize: 14, fontWeight: 500,
              color: isActive ? 'var(--mp-primary)' : 'var(--mp-muted)',
              background: isActive ? 'rgba(99,102,241,0.12)' : 'transparent',
            })}>
              <span>{icon}</span> {label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div style={{
          padding: '16px 20px', borderTop: '1px solid var(--mp-border)',
        }}>
          <div style={{ fontSize: 13, color: 'var(--mp-text)', marginBottom: 2 }}>
            {user?.name || 'User'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--mp-muted)', marginBottom: 12 }}>
            {user?.plan?.toUpperCase() || 'HOBBY'} plan
          </div>
          <button onClick={logout} style={{
            width: '100%', padding: '7px', borderRadius: 6, border: '1px solid var(--mp-border)',
            background: 'transparent', color: 'var(--mp-muted)', fontSize: 12, cursor: 'pointer',
          }}>
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: 'auto', padding: '32px' }}>
        <Outlet />
      </main>
    </div>
  );
}
