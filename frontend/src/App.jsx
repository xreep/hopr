import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import { PageLoader } from './components/ui'

const Login = lazy(() => import('./pages/Login'))
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

const MANAGERS = ['admin', 'fleet_manager']

function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth()

  if (loading) return <PageLoader />
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
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
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
