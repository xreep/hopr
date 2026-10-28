import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import api, { errorMessage } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import usePolling from '../hooks/usePolling'
import { StatCard, StatusBadge, EmptyState, PageSkeleton } from '../components/ui'
import Icon from '../components/icons'
import MapView from '../components/MapView'
import useMediaQuery from '../hooks/useMediaQuery'
import { buildFleetMap, buildPlanMap } from '../utils/fleetMap'
import { formatKm, initials } from '../utils/format'
import { formatClock, formatDateTime } from '../utils/time'
import { useT } from '../i18n/language'
import { durationIn } from '../i18n/strings'

function greeting(t) {
  const hour = Number(new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }))
  if (hour < 12) return t('dash.greeting.morning')
  if (hour < 17) return t('dash.greeting.afternoon')
  return t('dash.greeting.evening')
}

export default function Dashboard() {
  const { user, isDriver } = useAuth()
  const { t } = useT()
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
  // Faster while a demo morning is driving, so the figures keep up with the vans
  usePolling(load, data?.demo?.running ? 4000 : 30000)

  if (!data && !error) return <PageSkeleton label="Loading the dashboard" />

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{greeting(t)}, {user?.name?.split(' ')[0]}</h1>
          <p className="page-subtitle">{isDriver ? t('dash.driverSubtitle') : 'How today’s deliveries are going across your hubs.'}</p>
        </div>
        {isDriver
          ? <Link to="/driver-panel" className="btn btn-primary"><Icon name="navigation" />{t('dash.openDeliveries')}</Link>
          : <Link to="/route-planner" className="btn btn-primary"><Icon name="plus" />Plan routes</Link>}
      </div>
      {error && <div className="alert alert-error mb-4">{error}</div>}
      {data && (isDriver ? <DriverDashboard data={data} /> : <ManagerDashboard data={data} reload={load} />)}
    </div>
  )
}

function DriverDashboard({ data }) {
  const { t } = useT()
  return (
    <>
      <div className="stats-strip mb-6">
        <StatCard label={t('dash.deliveredToday')} value={data.completedToday} isKey />
        <StatCard label={t('dash.assignedRoutes')} value={data.assignedRoutes} />
        <StatCard label={t('dash.onTimeRate')} value={data.onTimeRate} suffix="%" hint={t('dash.last30')} />
        <StatCard label={t('dash.completionRate')} value={data.completionRate} suffix="%" hint={t('dash.last30')} />
      </div>
      <div className="card">
        <div className="card-header"><h3>{t('dash.myRoutes')}</h3></div>
        <div className="card-body">
          {data.routes.length === 0
            ? <EmptyState title={t('dash.noRoutes')}>{t('dash.noRoutesHint')}</EmptyState>
            : <LiveRoutes routes={data.routes} />}
        </div>
      </div>
    </>
  )
}

function ManagerDashboard({ data, reload }) {
  const alerts = [
    data.driversAwaitingApproval > 0 && { icon: 'user', text: `${data.driversAwaitingApproval} new driver${data.driversAwaitingApproval > 1 ? 's are' : ' is'} waiting for approval`, to: '/drivers', action: 'Review' },
    data.unassignedRoutes > 0 && { icon: 'users', text: `${data.unassignedRoutes} route${data.unassignedRoutes > 1 ? 's are' : ' is'} waiting for a driver`, to: '/routes?dispatch=1', action: 'Auto-dispatch' },
    data.routesNeedingRecalculation > 0 && { icon: 'refresh', text: `${data.routesNeedingRecalculation} route${data.routesNeedingRecalculation > 1 ? 's are' : ' is'} affected by new traffic`, to: '/monitor', action: 'Review' },
    data.activeIncidents > 0 && { icon: 'alert', text: `${data.activeIncidents} active traffic incident${data.activeIncidents > 1 ? 's' : ''}`, to: '/monitor', action: 'View on map' }
  ].filter(Boolean)

  return (
    <>
      <div className="stats-strip mb-6">
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

      <FleetCard liveRoutes={data.liveRoutes} demo={data.demo} onDemoChange={reload} />

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
    </>
  )
}

// The fleet right now: every route on the road on one map, next to the list of drivers.
// Pointing at a driver highlights their route; "watch" zooms the map to it. Before anyone
// is on the road the map shows the day's planned routes and the hubs instead.
function FleetCard({ liveRoutes, demo, onDemoChange }) {
  const [routes, setRoutes] = useState([])
  const [planned, setPlanned] = useState({ routes: [], hubs: [] })
  const [focus, setFocus] = useState(null)
  const [watching, setWatching] = useState(null)
  const [busy, setBusy] = useState(false)
  const narrow = useMediaQuery('(max-width: 1100px)')
  const loadFleet = useCallback(async () => {
    try {
      const res = await api.get('/routes', { params: { status: 'active', withGeometry: true, limit: 50 } })
      setRoutes(res.data.routes)
      if (res.data.routes.length === 0) {
        const [plan, config] = await Promise.all([
          api.get('/routes', { params: { status: 'planned', withGeometry: true, limit: 50, sort: 'plannedStart' } }),
          api.get('/map/config')
        ])
        setPlanned({ routes: plan.data.routes, hubs: config.data.hubs })
      }
    } catch { /* the list beside the map still shows progress */ }
  }, [])
  usePolling(loadFleet, liveRoutes.length ? 3000 : 15000)

  const watched = routes.some(r => r._id === watching) ? watching : null
  const map = useMemo(() => (routes.length
    ? buildFleetMap(routes, watched || focus, { focusOnly: Boolean(watched) })
    : buildPlanMap(planned.routes, planned.hubs)), [routes, planned, focus, watched])
  const fitKey = routes.length ? `fleet-${watched || ''}-${routes.map(r => r._id).join()}` : `plan-${planned.routes.map(r => r._id).join()}-${planned.hubs.length}`

  const demoAction = async (request, success, failure) => {
    setBusy(true)
    try {
      const res = await request()
      toast.success(success(res.data))
      await Promise.all([onDemoChange(), loadFleet()])
    } catch (err) {
      toast.error(errorMessage(err, failure))
    } finally {
      setBusy(false)
    }
  }
  const runDemo = () => demoAction(() => api.post('/demo/simulate'), d => `${d.started.length} demo vans are on the road`, 'Could not start the demo morning')
  const stopDemo = () => demoAction(() => api.delete('/demo/simulate'), () => 'Demo morning stopped. Its routes are back to planned', 'Could not stop the demo morning')

  return (
    <section className="card fleet-card mb-6" aria-label="Fleet on the road">
      <div className="fleet-map">
        <MapView lines={map.lines} points={map.points} drivers={map.drivers} fitKey={fitKey} height={narrow ? 300 : 460} />
        {watched
          ? <button type="button" className="fleet-empty fleet-back" onClick={() => setWatching(null)}>Show all routes</button>
          : liveRoutes.length === 0 && <p className="fleet-empty">{planned.routes.length ? 'Nobody on the road yet: today\u2019s planned routes and hubs' : 'No drivers on the road'}</p>}
      </div>
      <div className="fleet-side">
        <div className="card-header flex-between">
          <h3>On the road</h3>
          <Link to="/monitor" className="btn btn-ghost btn-sm">Live monitor<Icon name="arrowRight" /></Link>
        </div>
        {demo?.running > 0 && (
          <div className="demo-bar" role="status">
            <p className="text-small"><strong>Demo morning</strong>: {demo.running} van{demo.running > 1 ? 's' : ''} driving at {demo.speedup}&times; real time</p>
            <button type="button" className="btn btn-outline btn-sm" onClick={stopDemo} disabled={busy} title="Stops the vans and puts the demo routes back as planned">Stop and reset</button>
          </div>
        )}
        <div className="card-body">
          {liveRoutes.length === 0
            ? (
              <EmptyState title="Nothing on the road right now"
                action={demo?.waiting > 0 && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={runDemo} disabled={busy}>
                    {busy ? <><span className="spinner spinner-sm" /> Starting</> : <><Icon name="play" />Run a demo morning</>}
                  </button>
                )}>
                {demo?.waiting > 0
                  ? `Dispatch the ${demo.waiting} demo route${demo.waiting > 1 ? 's' : ''} and drive them along their roads at ${demo.speedup}\u00d7 speed, to watch the live map, ETAs and customer tracking update.`
                  : 'Routes appear here as soon as a driver starts one.'}
              </EmptyState>
            )
            : <LiveRoutes routes={liveRoutes} focus={focus} onFocus={setFocus} watching={watched} onWatch={id => setWatching(w => (w === id ? null : id))} />}
        </div>
      </div>
    </section>
  )
}

function LiveRoutes({ routes, focus, onFocus, watching, onWatch }) {
  const { t, lang, ago } = useT()
  return (
    <ul className="live-list">
      {routes.map(r => {
        const pct = (r.progress.done / Math.max(1, r.progress.total)) * 100
        return (
          <li key={r._id} className={`live-item ${focus === r._id ? 'is-focused' : ''}`}
            onMouseEnter={onFocus && (() => onFocus(r._id))} onMouseLeave={onFocus && (() => onFocus(null))}
            onFocus={onFocus && (() => onFocus(r._id))} onBlur={onFocus && (() => onFocus(null))}>
            <div className="flex items-start gap-3">
              <span className="avatar avatar-sm" aria-hidden="true">{initials(r.driver?.name || r.name)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex-between gap-2">
                  <Link to={`/routes/${r._id}`} className="font-medium truncate no-underline hover:underline">{r.driver?.name || r.name}</Link>
                  <span className="flex items-center gap-1">
                    <span className="eta-chip">{r.progress.done}/{r.progress.total}</span>
                    {onWatch && (
                      <button type="button" className={`btn btn-sm btn-icon ${watching === r._id ? 'btn-secondary' : 'btn-ghost'}`} aria-pressed={watching === r._id}
                        aria-label={`Zoom the map to ${r.driver?.name || r.name}`} title="Zoom the map to this route" onClick={() => onWatch(r._id)}>
                        <Icon name="map" size={16} />
                      </button>
                    )}
                  </span>
                </div>
                <p className="text-micro text-ink-400 truncate">{r.name}, {formatKm(r.totalDistance)}, {durationIn(lang, r.estimatedTime)}</p>
                <div className="progress mt-2" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${r.progress.done} of ${r.progress.total} stops done`}>
                  <span style={{ width: `${pct}%` }} />
                </div>
                <p className="text-micro text-ink-300 mt-1.5">
                  {r.nextStop ? <>{t('dash.next', { name: r.nextStop.customerName || r.nextStop.address.split(',')[0] })} <span className="eta-chip">{formatClock(r.nextStop.estimatedArrival)}</span></> : t('dash.allDone')}
                  {r.lastPingSecondsAgo !== null && <span className="text-ink-400">. GPS {ago(Date.now() - r.lastPingSecondsAgo * 1000)}</span>}
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
