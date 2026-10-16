import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { initials } from '../utils/format'
import MuteToggle from './MuteToggle'

const Icon = ({ d, className = 'w-5 h-5' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    {[].concat(d).map(path => <path key={path} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />)}
  </svg>
)

const ICONS = {
  dashboard: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z',
  planner: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7',
  routes: 'M4 6h16M4 12h16M4 18h7',
  monitor: ['M15 12a3 3 0 11-6 0 3 3 0 016 0z', 'M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z'],
  vehicles: ['M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z', 'M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0'],
  drivers: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
  analytics: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  admin: ['M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z', 'M15 12a3 3 0 11-6 0 3 3 0 016 0z'],
  driverPanel: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z',
  profile: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  logout: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1'
}

const MANAGERS = ['admin', 'fleet_manager']
const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: 'dashboard', roles: ['admin', 'fleet_manager', 'driver'] },
  { name: 'My Deliveries', href: '/driver-panel', icon: 'driverPanel', roles: ['driver'] },
  { name: 'Route Planner', href: '/route-planner', icon: 'planner', roles: MANAGERS },
  { name: 'Routes & Dispatch', href: '/routes', icon: 'routes', roles: MANAGERS },
  { name: 'Live Monitor', href: '/monitor', icon: 'monitor', roles: MANAGERS },
  { name: 'Vehicles', href: '/vehicles', icon: 'vehicles', roles: MANAGERS },
  { name: 'Drivers', href: '/drivers', icon: 'drivers', roles: MANAGERS },
  { name: 'Analytics', href: '/analytics', icon: 'analytics', roles: MANAGERS },
  { name: 'Admin Panel', href: '/admin', icon: 'admin', roles: ['admin'] },
  { name: 'Profile', href: '/profile', icon: 'profile', roles: ['admin', 'fleet_manager', 'driver'] }
]

const todayIST = () => new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'short' })

export default function Layout({ headerExtras = null }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => { setSidebarOpen(false) }, [location.pathname])

  const filteredNav = navigation.filter(item => item.roles.includes(user?.role))

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">Skip to content</a>
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} aria-label="Main navigation">
        <div className="sidebar-header">
          <NavLink to="/dashboard" className="brand">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            <span>Hopr</span>
          </NavLink>
        </div>
        <nav className="sidebar-nav">
          <ul>
            {filteredNav.map(item => (
              <li key={item.href}>
                <NavLink
                  to={item.href}
                  className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                  end={item.href === '/routes'}
                >
                  <Icon d={ICONS[item.icon]} />
                  {item.name}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="sidebar-footer">
          <div className="flex items-center gap-3">
            <div className="avatar" aria-hidden="true">{initials(user?.name)}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-muted capitalize">{user?.role?.replace('_', ' ')}</p>
            </div>
          </div>
          <button className="btn btn-ghost w-full mt-3 justify-start" onClick={handleLogout}>
            <Icon d={ICONS.logout} />
            Logout
          </button>
        </div>
      </aside>

      <div className="main-content">
        <header className="top-bar">
          <div className="flex items-center gap-3">
            <button
              className="btn btn-ghost menu-button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={sidebarOpen}
            >
              <Icon d={ICONS.menu} className="w-6 h-6" />
            </button>
            <span className="text-sm text-secondary hidden md:block">{todayIST()}</span>
          </div>
          <div className="flex items-center gap-2">
            {headerExtras}
            <MuteToggle />
          </div>
        </header>
        <main id="main" className="page-content">
          <Outlet />
        </main>
      </div>

      {sidebarOpen && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}
    </div>
  )
}
