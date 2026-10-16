import { useState, useEffect } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'

const colorClasses = {
  primary: 'bg-blue-100 text-blue-600',
  secondary: 'bg-cyan-100 text-cyan-600',
  success: 'bg-emerald-100 text-emerald-600',
  warning: 'bg-amber-100 text-amber-600',
  error: 'bg-red-100 text-red-600',
  info: 'bg-sky-100 text-sky-600'
}

function StatsCard({ title, value, trend, trendLabel, icon: Icon, color = 'primary' }) {
  return (
    <div className="card stats-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="stats-label">{title}</p>
          <p className="stats-value">{value}</p>
          {trend !== undefined && (
            <span className={`stats-trend ${trend >= 0 ? 'positive' : 'negative'}`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                {trend >= 0 ? (
                  <path d="M18 15l-6-6-6 6" />
                ) : (
                  <path d="M6 9l6 6 6-6" />
                )}
              </svg>
              {Math.abs(trend)}% {trendLabel}
            </span>
          )}
        </div>
        <div className={`p-3 rounded-lg ${colorClasses[color] || colorClasses.primary}`}>
          <Icon className="w-6 h-6" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}

function TruckIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16l2.879-2.879m0 0a3 3 0 104.243-4.242 3 3 0 00-4.243 4.242zm0 0L19.5 7.5M13.381 16H8" /></svg>
}
function RouteIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" /></svg>
}
function ClockIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
}
function DollarIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
}
function UserIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
}
function CheckIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
}

export default function Dashboard() {
  const { user, isAdmin, isFleetManager, isDriver } = useAuth()
  const [stats, setStats] = useState(null)
  const [recentRoutes, setRecentRoutes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      const [statsRes, routesRes] = await Promise.all([
        api.get('/dashboard/stats'),
        api.get('/routes?limit=5&sort=-createdAt')
      ])
      setStats(statsRes.data)
      setRecentRoutes(routesRes.data.routes || [])
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error)
      setStats({
        totalRoutes: 0,
        activeRoutes: 0,
        completedToday: 0,
        totalDistance: 0,
        fuelSaved: 0,
        onTimeRate: 0
      })
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="page-loader">
        <div className="spinner" />
      </div>
    )
  }

  const driverStats = [
    { title: 'Assigned Routes', value: stats?.assignedRoutes || 0, icon: RouteIcon, color: 'primary' },
    { title: 'Completed Today', value: stats?.completedToday || 0, icon: CheckIcon, color: 'success', trend: 12, trendLabel: 'vs yesterday' },
    { title: 'Distance (km)', value: stats?.totalDistance || 0, icon: TruckIcon, color: 'secondary' },
    { title: 'On-Time Rate', value: `${stats?.onTimeRate || 0}%`, icon: ClockIcon, color: 'warning', trend: 5, trendLabel: 'this week' }
  ]

  const managerStats = [
    { title: 'Total Routes', value: stats?.totalRoutes || 0, icon: RouteIcon, color: 'primary', trend: 8, trendLabel: 'this month' },
    { title: 'Active Routes', value: stats?.activeRoutes || 0, icon: TruckIcon, color: 'secondary' },
    { title: 'Fuel Saved (L)', value: stats?.fuelSaved || 0, icon: DollarIcon, color: 'success', trend: 15, trendLabel: 'vs last month' },
    { title: 'On-Time Rate', value: `${stats?.onTimeRate || 0}%`, icon: ClockIcon, color: 'warning', trend: 3, trendLabel: 'this quarter' }
  ]

  const adminStats = [
    { title: 'Total Routes', value: stats?.totalRoutes || 0, icon: RouteIcon, color: 'primary', trend: 12, trendLabel: 'this month' },
    { title: 'Active Drivers', value: stats?.activeDrivers || 0, icon: UserIcon, color: 'secondary', trend: 5, trendLabel: 'this week' },
    { title: 'Vehicles', value: stats?.totalVehicles || 0, icon: TruckIcon, color: 'success' },
    { title: 'Revenue', value: `$${(stats?.revenue || 0).toLocaleString()}`, icon: DollarIcon, color: 'warning', trend: 18, trendLabel: 'vs last month' }
  ]

  const displayStats = isDriver ? driverStats : isAdmin ? adminStats : managerStats

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Welcome back, {user?.name}. Here&apos;s your overview.</p>
        </div>
        <button className="btn btn-primary" onClick={() => window.location.href = '/route-planner'}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Route
        </button>
      </div>

      <div className="grid grid-4 mb-6" role="region" aria-label="Key metrics">
        {displayStats.map((stat, index) => (
          <StatsCard key={index} {...stat} />
        ))}
      </div>

      <div className="grid grid-2 gap-6">
        <div className="card">
          <div className="card-header flex-between">
            <h3 className="text-lg font-semibold">Recent Routes</h3>
            <a href="/routes" className="text-sm text-primary">View all</a>
          </div>
          <div className="card-body p-0">
            {recentRoutes.length === 0 ? (
              <div className="text-center py-8 text-secondary">
                <RouteIcon className="w-12 h-12 mx-auto mb-3 text-muted" aria-hidden="true" />
                <p>No routes yet</p>
                <button className="btn btn-primary mt-3" onClick={() => window.location.href = '/route-planner'}>
                  Create your first route
                </button>
              </div>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Route ID</th>
                      <th>Stops</th>
                      <th>Distance</th>
                      <th>Status</th>
                      <th>Driver</th>
                      <th>ETA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentRoutes.map(route => (
                      <tr key={route._id}>
                        <td className="font-mono text-sm">{route.routeId?.slice(-8).toUpperCase()}</td>
                        <td>{route.stops?.length || 0}</td>
                        <td>{(route.totalDistance || 0).toFixed(1)} km</td>
                        <td>
                          <span className={`badge ${getStatusBadge(route.status)}`}>
                            {route.status}
                          </span>
                        </td>
                        <td>{route.driver?.name || 'Unassigned'}</td>
                        <td>{route.estimatedTime ? formatTime(route.estimatedTime) : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header flex-between">
            <h3 className="text-lg font-semibold">Quick Actions</h3>
          </div>
          <div className="card-body">
            <div className="grid grid-2 gap-3">
              <button className="btn btn-outline p-4 flex flex-col items-start gap-2" onClick={() => window.location.href = '/route-planner'}>
                <RouteIcon className="w-6 h-6 text-primary" aria-hidden="true" />
                <span className="font-medium">Plan Route</span>
                <span className="text-xs text-muted">Optimize multi-stop delivery</span>
              </button>
              <button className="btn btn-outline p-4 flex flex-col items-start gap-2" onClick={() => window.location.href = '/vehicles'}>
                <TruckIcon className="w-6 h-6 text-secondary" aria-hidden="true" />
                <span className="font-medium">Manage Vehicles</span>
                <span className="text-xs text-muted">Add or edit fleet vehicles</span>
              </button>
              <button className="btn btn-outline p-4 flex flex-col items-start gap-2" onClick={() => window.location.href = '/drivers'}>
                <UserIcon className="w-6 h-6 text-success" aria-hidden="true" />
                <span className="font-medium">Assign Drivers</span>
                <span className="text-xs text-muted">Match drivers to routes</span>
              </button>
              <button className="btn btn-outline p-4 flex flex-col items-start gap-2" onClick={() => window.location.href = '/analytics'}>
                <svg className="w-6 h-6 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2z" /></svg>
                <span className="font-medium">View Analytics</span>
                <span className="text-xs text-muted">Performance insights</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function getStatusBadge(status) {
  switch (status?.toLowerCase()) {
    case 'completed': return 'badge-success'
    case 'in_progress': return 'badge-primary'
    case 'pending': return 'badge-warning'
    case 'failed': return 'badge-error'
    default: return 'badge-info'
  }
}

function formatTime(minutes) {
  const hrs = Math.floor(minutes / 60)
  const mins = minutes % 60
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`
}