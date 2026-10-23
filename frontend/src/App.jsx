import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import { PageLoader } from './components/ui'

const Login = lazy(() => import('./pages/Login'))
const PasswordReset = lazy(() => import('./pages/PasswordReset'))
// Public website pages
const SiteProduct = lazy(() => import('./pages/site/Product'))
const SiteUseCases = lazy(() => import('./pages/site/UseCases'))
const SitePricing = lazy(() => import('./pages/site/Pricing'))
const SiteSecurity = lazy(() => import('./pages/site/Security'))
const SiteAbout = lazy(() => import('./pages/site/About'))
const SiteContact = lazy(() => import('./pages/site/Contact'))
const SiteFaq = lazy(() => import('./pages/site/Faq'))
const SiteChangelog = lazy(() => import('./pages/site/Changelog'))
const SitePrivacy = lazy(() => import('./pages/site/Privacy'))
const SiteTerms = lazy(() => import('./pages/site/Terms'))
const Landing = lazy(() => import('./pages/Landing'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const RoutePlanner = lazy(() => import('./pages/RoutePlanner'))
const RoutesPage = lazy(() => import('./pages/Routes'))
const RouteDetail = lazy(() => import('./pages/RouteDetail'))
const LiveMonitor = lazy(() => import('./pages/LiveMonitor'))
const VehicleManagement = lazy(() => import('./pages/VehicleManagement'))
const Drivers = lazy(() => import('./pages/Drivers'))
const DriverPanel = lazy(() => import('./pages/DriverPanel'))
const Analytics = lazy(() => import('./pages/Analytics'))
const AdminPanel = lazy(() => import('./pages/AdminPanel'))
const Profile = lazy(() => import('./pages/Profile'))
const NotFound = lazy(() => import('./pages/NotFound'))
const Track = lazy(() => import('./pages/Track'))
const DesignSystem = lazy(() => import('./pages/DesignSystem'))

const MANAGERS = ['admin', 'fleet_manager']

// The session check failed without a 401 (rate limited, server unreachable): keep the
// session and retry instead of bouncing a signed-in user to the login page
function SessionRetry() {
  const { sessionError, refreshUser, logout } = useAuth()
  const limited = sessionError.status === 429
  const waitSeconds = Math.min(Math.max(sessionError.retryAfter ?? 5, 3), 30)

  useEffect(() => {
    const t = setTimeout(refreshUser, waitSeconds * 1000)
    return () => clearTimeout(t)
  }, [sessionError, refreshUser, waitSeconds])

  return (
    <div className="empty-state min-h-screen flex flex-col items-center justify-center">
      <p>{limited ? 'Too many requests for a moment' : 'Can\u2019t reach Hopr right now'}</p>
      <p className="text-small mt-1 max-w-[46ch]">You&apos;re still signed in. Trying again in about {waitSeconds} seconds.</p>
      <div className="mt-4 flex gap-2">
        <button type="button" className="btn btn-secondary" onClick={refreshUser}>Try again</button>
        <button type="button" className="btn btn-ghost" onClick={logout}>Sign out</button>
      </div>
    </div>
  )
}

function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading, sessionError } = useAuth()

  if (loading) return <PageLoader />
  if (!user && sessionError) return <SessionRetry />
  if (!user) return <Navigate to="/login" replace />
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />
  }
  return children
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <PageLoader />
  if (user) return <Navigate to="/dashboard" replace />
  return children
}

const guard = (element, roles) => <ProtectedRoute allowedRoles={roles}>{element}</ProtectedRoute>

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/forgot-password" element={<PublicRoute><PasswordReset /></PublicRoute>} />
        <Route path="/reset-password" element={<PasswordReset />} />
        <Route path="/product" element={<SiteProduct />} />
        <Route path="/use-cases" element={<SiteUseCases />} />
        <Route path="/pricing" element={<SitePricing />} />
        <Route path="/security" element={<SiteSecurity />} />
        <Route path="/about" element={<SiteAbout />} />
        <Route path="/contact" element={<SiteContact />} />
        <Route path="/faq" element={<SiteFaq />} />
        <Route path="/changelog" element={<SiteChangelog />} />
        <Route path="/privacy" element={<SitePrivacy />} />
        <Route path="/terms" element={<SiteTerms />} />
        {/* Public customer tracking: the token in the link is the only credential */}
        <Route path="/track/:token" element={<Track />} />
        {/* Living style guide, development builds only */}
        {import.meta.env.DEV && <Route path="/design-system" element={<DesignSystem />} />}
        {/* Public homepage; signed-in users go straight to their dashboard */}
        <Route index element={<PublicRoute><Landing /></PublicRoute>} />
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="route-planner" element={guard(<RoutePlanner />, MANAGERS)} />
          <Route path="routes" element={guard(<RoutesPage />, MANAGERS)} />
          <Route path="routes/:id" element={<RouteDetail />} />
          <Route path="monitor" element={guard(<LiveMonitor />, MANAGERS)} />
          <Route path="vehicles" element={guard(<VehicleManagement />, MANAGERS)} />
          <Route path="drivers" element={guard(<Drivers />, MANAGERS)} />
          <Route path="driver-panel" element={guard(<DriverPanel />, ['driver'])} />
          <Route path="analytics" element={guard(<Analytics />, MANAGERS)} />
          <Route path="admin" element={guard(<AdminPanel />, ['admin'])} />
          <Route path="profile" element={<Profile />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
