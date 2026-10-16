import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { errorMessage } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import usePolling from '../hooks/usePolling'
import { StatCard, StatusBadge, EmptyState, PageLoader } from '../components/ui'
import { formatKm, formatDuration } from '../utils/format'
import { formatClock, relativeTime, formatDateTime } from '../utils/time'

export default function Dashboard() {
  const { user, isDriver } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await api.get('/dashboard')
      setData(res.data)
      setError('')
    } catch (err) {
      setError(errorMessage(err, 'Failed to load dashboard'))
    }
  }, [])
  usePolling(load, 30000)

  if (!data && !error) return <PageLoader />

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Welcome back, {user?.name?.split(' ')[0]}. Here&apos;s today at a glance.</p>
        </div>
        {isDriver
          ? <Link to="/driver-panel" className="btn btn-primary">Open my deliveries</Link>
          : <Link to="/route-planner" className="btn btn-primary">+ Plan routes</Link>}
      </div>
      {error && <div className="alert alert-error mb-4">{error}</div>}
      {data && (isDriver ? <DriverDashboard data={data} /> : <ManagerDashboard data={data} />)}
    </div>
  )
}

function DriverDashboard({ data }) {
  return (
    <>
      <div className="grid grid-4 mb-6">
        <StatCard label="Assigned routes" value={data.assignedRoutes} />
        <StatCard label="Delivered today" value={data.completedToday} tone="success" />
        <StatCard label="On-time rate (30 days)" value={data.onTimeRate} suffix="%" />
        <StatCard label="Completion rate (30 days)" value={data.completionRate} suffix="%" />
      </div>
      <div className="card">
        <div className="card-header"><h3 className="font-semibold">My routes</h3></div>
        <div className="card-body">
          {data.routes.length === 0
            ? <EmptyState title="No routes assigned yet">Your fleet manager will assign a route. You&apos;ll hear an announcement when it arrives.</EmptyState>
            : <LiveRoutesTable routes={data.routes} />}
        </div>
      </div>
    </>
  )
}

function ManagerDashboard({ data }) {
  return (
    <>
      <div className="grid grid-4 mb-6">
        <StatCard label="Delivered today" value={data.deliveriesToday} tone="success" hint={`${data.failedToday} failed · ${data.pendingToday} pending`} />
        <StatCard label="On-time today" value={data.onTimeRateToday} suffix="%" hint="Within window, or ETA + 15 min" />
        <StatCard label="Active routes" value={data.activeRoutes} hint={`${data.drivers.onRoute} of ${data.drivers.active} drivers on the road`} />
        <StatCard label="Fleet ready" value={data.vehicles.active} hint={`${data.vehicles.maintenance} in maintenance`} />
      </div>

      {(data.unassignedRoutes > 0 || data.routesNeedingRecalculation > 0 || data.activeIncidents > 0) && (
        <div className="alert alert-warning mb-6 flex flex-wrap gap-4 items-center">
          {data.unassignedRoutes > 0 && <span><strong>{data.unassignedRoutes}</strong> route(s) waiting for a driver. <Link to="/routes">Auto-dispatch →</Link></span>}
          {data.routesNeedingRecalculation > 0 && <span><strong>{data.routesNeedingRecalculation}</strong> route(s) affected by traffic. <Link to="/monitor">Review →</Link></span>}
          {data.activeIncidents > 0 && <span><strong>{data.activeIncidents}</strong> active traffic incident(s)</span>}
        </div>
      )}

      <div className="grid grid-2 gap-6">
        <div className="card">
          <div className="card-header flex-between">
            <h3 className="font-semibold">Live routes</h3>
            <Link to="/monitor" className="text-sm">Open live monitor</Link>
          </div>
          <div className="card-body">
            {data.liveRoutes.length === 0
              ? <EmptyState title="No routes on the road">Start or dispatch a route to track it here.</EmptyState>
              : <LiveRoutesTable routes={data.liveRoutes} />}
          </div>
        </div>
        <div className="card">
          <div className="card-header flex-between">
            <h3 className="font-semibold">Recent routes</h3>
            <Link to="/routes" className="text-sm">View all</Link>
          </div>
          <div className="card-body p-0">
            {data.recentRoutes.length === 0 ? (
              <EmptyState title="No routes yet" action={<Link to="/route-planner" className="btn btn-primary btn-sm">Plan your first route</Link>} />
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr><th>Route</th><th>Status</th><th>Driver</th><th>Distance</th><th>Planned</th></tr>
                  </thead>
                  <tbody>
                    {data.recentRoutes.map(r => (
                      <tr key={r._id}>
                        <td><Link to={`/routes/${r._id}`} className="font-medium">{r.name}</Link><div className="text-xs text-muted font-mono">{r.routeId}</div></td>
                        <td><StatusBadge status={r.status} /></td>
                        <td>{r.driver?.name || <span className="text-muted">Unassigned</span>}</td>
                        <td>{formatKm(r.totalDistance)}</td>
                        <td className="text-sm">{formatDateTime(r.plannedStart)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function LiveRoutesTable({ routes }) {
  return (
    <ul className="live-list">
      {routes.map(r => (
        <li key={r._id} className="live-item">
          <div className="flex-between gap-3">
            <div className="min-w-0">
              <Link to={`/routes/${r._id}`} className="font-medium truncate block">{r.name}</Link>
              <p className="text-xs text-muted">
                {r.driver?.name || 'Unassigned'} · {r.progress.done}/{r.progress.total} stops · {formatKm(r.totalDistance)} · {formatDuration(r.estimatedTime)}
              </p>
            </div>
            <StatusBadge status={r.status} />
          </div>
          <div className="progress mt-2" aria-label={`${r.progress.done} of ${r.progress.total} stops done`}>
            <span style={{ width: `${(r.progress.done / Math.max(1, r.progress.total)) * 100}%` }} />
          </div>
          <p className="text-xs text-secondary mt-1">
            {r.nextStop ? <>Next: {r.nextStop.customerName || r.nextStop.address} · ETA {formatClock(r.nextStop.estimatedArrival)}</> : 'All stops done'}
            {r.lastPingSecondsAgo !== null && <> · GPS {relativeTime(Date.now() - r.lastPingSecondsAgo * 1000)}</>}
            {r.lateStops > 0 && <span className="text-error"> · {r.lateStops} at risk</span>}
            {r.needsRecalculation && <span className="text-warning"> · traffic changed</span>}
          </p>
        </li>
      ))}
    </ul>
  )
}
