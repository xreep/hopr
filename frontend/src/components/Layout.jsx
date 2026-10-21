import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { initials } from '../utils/format'
import MuteToggle from './MuteToggle'
import Icon, { HopMark } from './icons'
import ErrorBoundary from './ErrorBoundary'
import CommandPalette from './CommandPalette'
import { isMac } from '../utils/platform'
import usePageTitle from '../hooks/usePageTitle'

const MANAGERS = ['admin', 'fleet_manager']
const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: 'dashboard', roles: ['admin', 'fleet_manager', 'driver'] },
  { name: 'My deliveries', href: '/driver-panel', icon: 'navigation', roles: ['driver'] },
  { name: 'Route planner', href: '/route-planner', icon: 'map', roles: MANAGERS },
  { name: 'Routes & dispatch', href: '/routes', icon: 'list', roles: MANAGERS },
  { name: 'Live monitor', href: '/monitor', icon: 'radar', roles: MANAGERS },
  { name: 'Vehicles', href: '/vehicles', icon: 'truck', roles: MANAGERS },
  { name: 'Drivers', href: '/drivers', icon: 'users', roles: MANAGERS },
  { name: 'Analytics', href: '/analytics', icon: 'chart', roles: MANAGERS },
  { name: 'Admin', href: '/admin', icon: 'shield', roles: ['admin'] },
  { name: 'Profile', href: '/profile', icon: 'user', roles: ['admin', 'fleet_manager', 'driver'] }
]

const PAGE_TITLES = Object.fromEntries(navigation.map(item => [item.href, item.name]))

const todayIST = () => new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long' })
const ROLE_LABELS = { admin: 'Admin', fleet_manager: 'Fleet manager', driver: 'Driver' }

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)

  // Cmd/Ctrl+K anywhere, or "/" when not typing, opens search
  useEffect(() => {
    const onKey = e => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(open => !open)
      } else if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => { setSidebarOpen(false) }, [location.pathname])
  // Route detail pages name themselves after the route
  usePageTitle(location.pathname.startsWith('/routes/') ? null : PAGE_TITLES[location.pathname] || 'Page not found')

  const filteredNav = navigation.filter(item => item.roles.includes(user?.role))

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">Skip to content</a>
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`} aria-label="Main navigation">
        <div className="sidebar-header flex-between">
          <NavLink to="/dashboard" className="brand" aria-label="Hopr dashboard">
            <HopMark size={30} />
            <span>Hopr</span>
          </NavLink>
          <button type="button" className="btn btn-ghost btn-sm btn-icon menu-button" onClick={() => setSidebarOpen(false)} aria-label="Close navigation menu">
            <Icon name="x" />
          </button>
        </div>
        <nav className="sidebar-nav">
          <ul>
            {filteredNav.map(item => (
              <li key={item.href}>
                <NavLink to={item.href} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`} end={item.href === '/routes'}>
                  <Icon name={item.icon} />
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
              <p className="text-body font-medium truncate">{user?.name}</p>
              <p className="text-micro text-ink-400">{ROLE_LABELS[user?.role]}</p>
            </div>
            <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={handleLogout} aria-label="Log out" title="Log out">
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </aside>

      <div className="main-content">
        <header className="top-bar">
          <div className="flex items-center gap-3 min-w-0">
            <button className="btn btn-ghost btn-icon menu-button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation menu" aria-expanded={sidebarOpen}>
              <Icon name="menu" size={20} />
            </button>
            <NavLink to="/dashboard" className="brand lg:hidden" aria-label="Hopr dashboard"><HopMark size={24} /></NavLink>
            <span className="text-small text-ink-400 hidden md:block">{todayIST()}, Ranchi</span>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" className="btn btn-ghost btn-sm palette-trigger" onClick={() => setPaletteOpen(true)} aria-label="Search and run commands" aria-keyshortcuts={isMac() ? 'Meta+K' : 'Control+K'}>
              <Icon name="search" />
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden md:inline-flex">{isMac() ? '⌘K' : 'Ctrl K'}</kbd>
            </button>
            <MuteToggle />
          </div>
        </header>
        <main id="main" className="page-content">
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} pages={filteredNav} />
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} aria-hidden="true" />}
    </div>
  )
}
