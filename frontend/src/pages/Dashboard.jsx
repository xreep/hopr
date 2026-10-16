import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import api, { errorMessage } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import usePolling from '../hooks/usePolling'
import { StatCard, StatusBadge, EmptyState, PageLoader } from '../components/ui'
import Icon from '../components/icons'
import { formatKm, formatDuration, initials } from '../utils/format'
import { formatClock, relativeTime, formatDateTime } from '../utils/time'

function greeting() {
  const hour = Number(new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }))
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

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
      setError(errorMessage(err, 'Could not load the dashboard'))
    }
  }, [])
  usePolling(load, 30000)

  if (!data && !error) return <PageLoader />

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{greeting()}, {user?.name?.split(' ')[0]}</h1>
          <p className="page-subtitle">{isDriver ? 'Your deliveries for today.' : 'Here is how today’s deliveries are going across Ranchi.'}</p>
        </div>
        {isDriver
          ? <Link to="/driver-panel" className="btn btn-primary"><Icon name="navigation" />Open my deliveries</Link>
          : <Link to="/route-planner" className="btn btn-primary"><Icon name="plus" />Plan routes</Link>}
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
        <StatCard label="Delivered today" value={data.completedToday} isKey />
        <StatCard label="Assigned routes" value={data.assignedRoutes} />
        <StatCard label="On-time rate" value={data.onTimeRate} suffix="%" hint="Last 30 days" />
        <StatCard label="Completion rate" value={data.completionRate} suffix="%" hint="Last 30 days" />
      </div>
      <div className="card">
        <div className="card-header"><h3>My routes</h3></div>
        <div className="card-body">
          {data.routes.length === 0
            ? <EmptyState title="No routes assigned yet">You&apos;ll hear an announcement when your fleet manager assigns one.</EmptyState>
            : <LiveRoutes routes={data.routes} />}
        </div>
      </div>
    </>
  )
}

function ManagerDashboard({ data }) {
  const alerts = [
    data.unassignedRoutes > 0 && { icon: 'users', text: `${data.unassignedRoutes} route${data.unassignedRoutes > 1 ? 's are' : ' is'} waiting for a driver`, to: '/routes?unassigned=true', action: 'Auto-dispatch' },
    data.routesNeedingRecalculation > 0 && { icon: 'refresh', text: `${data.routesNeedingRecalculation} route${data.routesNeedingRecalculation > 1 ? 's are' : ' is'} affected by new traffic`, to: '/monitor', action: 'Review' },
    data.activeIncidents > 0 && { icon: 'alert', text: `${data.activeIncidents} active traffic incident${data.activeIncidents > 1 ? 's' : ''}`, to: '/monitor', action: 'View on map' }
  ].filter(Boolean)

  return (
    <>
      <div className="grid grid-4 mb-6">
        <StatCard label="Delivered today" value={data.deliveriesToday} isKey hint={`${data.failedToday} failed, ${data.pendingToday} still to go`} />
        <StatCard label="On-time today" value={data.onTimeRateToday} suffix="%" hint="Within the window, or ETA + 15 min" />
        <StatCard label="Routes on the road" value={data.activeRoutes} hint={`${data.drivers.onRoute} of ${data.drivers.active} drivers driving`} />
        <StatCard label="Vehicles ready" value={data.vehicles.active} hint={data.vehicles.maintenance ? `${data.vehicles.maintenance} in maintenance` : 'None in maintenance'} />
      </div>

      {alerts.length > 0 && (
        <ul className="card mb-6 divide-y divide-white/5" aria-label="Needs attention">
          {alerts.map(a => (
            <li key={a.text} className="flex items-center gap-3 px-5 py-3">
              <span className="text-signal-amber"><Icon name={a.icon} /></span>
              <span className="flex-1 text-body">{a.text}</span>
              <Link to={a.to} className="btn btn-ghost btn-sm">{a.action}<Icon name="arrowRight" /></Link>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-2 gap-6">
        <div className="card">
          <div className="card-header flex-between">
            <h3>Live routes</h3>
            <Link to="/monitor" className="btn btn-ghost btn-sm">Live monitor<Icon name="arrowRight" /></Link>
          </div>
          <div className="card-body">
            {data.liveRoutes.length === 0
              ? <EmptyState title="Nothing on the road right now">Routes appear here as soon as a driver starts one.</EmptyState>
              : <LiveRoutes routes={data.liveRoutes} />}
          </div>
        </div>
        <div className="card">
          <div className="card-header flex-between">
            <h3>Recent routes</h3>
            <Link to="/routes" className="btn btn-ghost btn-sm">All routes<Icon name="arrowRight" /></Link>
          </div>
          {data.recentRoutes.length === 0 ? (
            <EmptyState title="No routes yet" action={<Link to="/route-planner" className="btn btn-secondary btn-sm">Plan your first route</Link>} />
          ) : (
            <ul className="divide-y divide-white/5">
              {data.recentRoutes.map(r => (
                <li key={r._id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <Link to={`/routes/${r._id}`} className="font-medium no-underline hover:underline">{r.name}</Link>
                    <p className="text-micro text-ink-400 truncate">
                      {r.driver?.name || 'No driver yet'}, {formatKm(r.totalDistance)}, planned {formatDateTime(r.plannedStart)}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  )
}

function LiveRoutes({ routes }) {
  return (
    <ul className="live-list">
      {routes.map(r => {
        const pct = (r.progress.done / Math.max(1, r.progress.total)) * 100
        return (
          <li key={r._id} className="live-item">
            <div className="flex items-start gap-3">
              <span className="avatar avatar-sm" aria-hidden="true">{initials(r.driver?.name || r.name)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex-between gap-2">
                  <Link to={`/routes/${r._id}`} className="font-medium truncate no-underline hover:underline">{r.driver?.name || r.name}</Link>
                  <span className="eta-chip">{r.progress.done}/{r.progress.total}</span>
                </div>
                <p className="text-micro text-ink-400 truncate">{r.name}, {formatKm(r.totalDistance)}, {formatDuration(r.estimatedTime)}</p>
                <div className="progress mt-2" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${r.progress.done} of ${r.progress.total} stops done`}>
                  <span style={{ width: `${pct}%` }} />
                </div>
                <p className="text-micro text-ink-300 mt-1.5">
                  {r.nextStop ? <>Next: {r.nextStop.customerName || r.nextStop.address.split(',')[0]} at <span className="eta-chip">{formatClock(r.nextStop.estimatedArrival)}</span></> : 'All stops done'}
                  {r.lastPingSecondsAgo !== null && <span className="text-ink-400">. GPS {relativeTime(Date.now() - r.lastPingSecondsAgo * 1000)}</span>}
                  {r.lateStops > 0 && <span className="text-signal-amber">. {r.lateStops} at risk</span>}
                  {r.needsRecalculation && <span className="text-signal-amber">. Traffic changed</span>}
                </p>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
