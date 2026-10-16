import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import api, { errorMessage } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import usePolling from '../hooks/usePolling'
import MapView from '../components/MapView'
import { StatusBadge, PageLoader, EmptyState } from '../components/ui'
import { formatDuration, formatINR, formatKm, initials } from '../utils/format'
import { formatClock, formatDateTime, relativeTime } from '../utils/time'
import { vehicleTypeLabel } from '../config'
import { stopVariant, isStale } from '../utils/routeView'

export default function RouteDetail() {
  const { id } = useParams()
  const { isManager, user } = useAuth()
  const [route, setRoute] = useState(null)
  const [error, setError] = useState('')
  const [incidents, setIncidents] = useState([])
  const [drivers, setDrivers] = useState([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await api.get(`/routes/${id}`)
      setRoute(res.data.route)
      setError('')
    } catch (err) {
      setError(errorMessage(err, 'Failed to load route'))
    }
  }, [id])
  usePolling(load, route?.status === 'active' ? 10000 : 60000)

  useEffect(() => {
    api.get('/incidents').then(res => setIncidents(res.data.incidents)).catch(() => {})
    if (isManager) api.get('/drivers/available').then(res => setDrivers(res.data.drivers)).catch(() => {})
  }, [isManager])

  const act = async (fn, success) => {
    setBusy(true)
    try {
      const res = await fn()
      if (res?.data?.route) setRoute(res.data.route)
      else await load()
      if (success) toast.success(typeof success === 'function' ? success(res) : success)
    } catch (err) {
      toast.error(errorMessage(err, 'Action failed'))
    } finally {
      setBusy(false)
    }
  }

  const recalculate = () => act(() => api.post(`/routes/${id}/recalculate`, { reason: 'Manual recalculation' }), res => {
    const before = new Date(res.data.previousFinish).getTime()
    const after = new Date(res.data.newFinish).getTime()
    const diff = Math.round((after - before) / 60000)
    return `Re-optimized remaining stops · finish ${formatClock(res.data.newFinish)} (${diff >= 0 ? '+' : ''}${diff} min)`
  })

  const mapData = useMemo(() => {
    if (!route) return null
    const current = route.stops.findIndex(s => s.status === 'pending' || s.status === 'in_progress')
    return {
      lines: [{ id: 'route', coordinates: route.geometry?.coordinates || [], color: '#2563eb', width: 5 }],
      points: [
        ...(route.depot?.coordinates ? [{ id: 'depot', coordinates: route.depot.coordinates, label: 'H', variant: 'depot', title: route.depot.name }] : []),
        ...route.stops.map((s, i) => ({ id: s._id, coordinates: s.coordinates, label: s.sequence, variant: stopVariant(s, i === current), title: `${s.sequence}. ${s.customerName || ''} ${s.address}` }))
      ],
      driver: route.driverLocation?.coordinates?.length === 2
        ? { coordinates: route.driverLocation.coordinates, initials: initials(route.driver?.name), stale: isStale(route.driverLocation.updatedAt) }
        : null
    }
  }, [route])

  if (error && !route) return <div className="card"><EmptyState title={error} action={<Link to="/routes" className="btn btn-primary btn-sm">Back to routes</Link>} /></div>
  if (!route) return <PageLoader />

  const done = route.stops.filter(s => s.status === 'completed' || s.status === 'failed').length
  const isOwnerDriver = user?.role === 'driver' && route.driver?._id === user._id
  const canRecalculate = (isManager || isOwnerDriver) && ['planned', 'active'].includes(route.status) && done < route.stops.length

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="text-sm text-muted"><Link to={isManager ? '/routes' : '/driver-panel'}>← {isManager ? 'Routes' : 'My deliveries'}</Link></p>
          <h1 className="page-title flex items-center gap-3">{route.name} <StatusBadge status={route.status} /></h1>
          <p className="page-subtitle font-mono">{route.routeId} · {route.batchId} · planned {formatDateTime(route.plannedStart)}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {canRecalculate && <button type="button" className="btn btn-outline" onClick={recalculate} disabled={busy}>↻ Recalculate remaining</button>}
          {isOwnerDriver && route.status === 'planned' && (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => act(() => api.patch(`/routes/${id}/start`), 'Route started')}>Start route</button>
          )}
        </div>
      </div>

      {route.needsRecalculation && canRecalculate && (
        <div className="alert alert-warning mb-4 flex-between gap-3">
          <span>A new traffic incident affects this route&apos;s remaining stops.</span>
          <button type="button" className="btn btn-warning btn-sm" onClick={recalculate} disabled={busy}>Recalculate now</button>
        </div>
      )}
      {route.violations?.length > 0 && (
        <div className="alert alert-warning mb-4">
          <p className="font-medium">Delivery windows at risk</p>
          <ul className="list-disc pl-5 text-sm">{route.violations.map(v => <li key={v.sequence}>{v.message} ({v.lateByMin} min late)</li>)}</ul>
        </div>
      )}

      <div className="grid grid-2 gap-6 mb-6">
        <div className="card overflow-hidden">
          <MapView lines={mapData.lines} points={mapData.points} driver={mapData.driver}
            incidents={incidents.map(i => ({ id: i._id, coordinates: i.coordinates, radiusKm: i.radiusKm, type: i.type, label: i.label }))}
            fitKey={route._id + route.stops.map(s => s.sequence).join()} height={380} />
          {route.geometrySource === 'estimated' && <p className="text-xs text-muted px-4 py-2">Path shown as straight legs (road geometry needs a Mapbox token on the server).</p>}
        </div>

        <div className="card">
          <div className="card-header"><h3 className="font-semibold">Planned vs actual</h3></div>
          <div className="card-body">
            <table className="table compact">
              <thead><tr><th></th><th>Planned</th><th>Actual</th></tr></thead>
              <tbody>
                <tr><td>Distance</td><td>{formatKm(route.totalDistance)}{route.roadDistanceKm ? <div className="text-xs text-muted">road {formatKm(route.roadDistanceKm)}</div> : null}</td><td>{route.actualDistance > 0 ? formatKm(route.actualDistance) : '-'}</td></tr>
                <tr><td>Duration</td><td>{formatDuration(route.estimatedTime)}</td><td>{route.actualTime ? formatDuration(route.actualTime) : route.startedAt ? `running ${formatDuration((Date.now() - new Date(route.startedAt)) / 60000)}` : '-'}</td></tr>
                <tr><td>Fuel</td><td>{route.fuelEstimate} {route.fuelUnit} · {formatINR(route.fuelCost)}</td><td>-</td></tr>
                <tr><td>Deliveries</td><td>{route.stops.length}</td><td>{route.stops.filter(s => s.status === 'completed').length} done · {route.stops.filter(s => s.status === 'failed').length} failed</td></tr>
              </tbody>
            </table>
            <dl className="detail-list mt-4">
              <dt>Driver</dt>
              <dd>
                {isManager && route.status === 'planned' ? (
                  <select className="form-input form-select form-input-sm" aria-label="Assign driver" value={route.driver?._id || ''} disabled={busy}
                    onChange={e => act(() => api.patch(`/routes/${id}`, { driver: e.target.value || null }), e.target.value ? 'Driver assigned' : 'Driver unassigned')}>
                    <option value="">Unassigned</option>
                    {drivers.map(d => <option key={d._id} value={d._id}>{d.name}{d.onRoute ? ' (on route)' : ''}</option>)}
                  </select>
                ) : (route.driver?.name || 'Unassigned')}
              </dd>
              <dt>Vehicle</dt><dd>{route.vehicle ? `${route.vehicle.name} (${route.vehicle.licensePlate})` : vehicleTypeLabel(route.vehicleType)}</dd>
              <dt>Traffic</dt><dd>×{route.trafficImpactFactor} ({route.trafficLevel}){route.trafficEnabled ? '' : ' · traffic-aware off'}</dd>
              <dt>Load</dt><dd>{route.loadKg} kg{route.capacityKg ? ` of ${route.capacityKg} kg` : ''}</dd>
              <dt>CO₂</dt><dd>{route.co2Kg} kg</dd>
              {route.savings && (route.savings.distanceKm >= 0
                ? <><dt>Saved vs entered order</dt><dd>{formatKm(route.savings.distanceKm)} · {formatINR(route.savings.fuelCost)} · {route.savings.minutes} min</dd></>
                : <><dt>vs entered order</dt><dd>{formatKm(-route.savings.distanceKm)} longer, a trade-off to meet delivery windows and priorities</dd></>)}
              {route.driverLocation?.updatedAt && <><dt>Last GPS</dt><dd>{relativeTime(route.driverLocation.updatedAt)}</dd></>}
            </dl>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header flex-between">
          <h3 className="font-semibold">Stops ({done}/{route.stops.length} done)</h3>
        </div>
        <ol className="timeline card-body">
          {route.stops.map(s => <StopRow key={s._id} stop={s} route={route} isManager={isManager} onChanged={load} />)}
        </ol>
      </div>

      {route.recalculations?.length > 0 && (
        <div className="card mt-6">
          <div className="card-header"><h3 className="font-semibold">Recalculation history</h3></div>
          <ul className="card-body text-sm space-y-1">
            {route.recalculations.map((r, i) => (
              <li key={i}>{formatDateTime(r.at)}: {r.reason}. Finish {formatClock(r.previousFinish)} → {formatClock(r.newFinish)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function StopRow({ stop }) {
  const etaDiff = stop.plannedArrival && stop.estimatedArrival
    ? Math.round((new Date(stop.estimatedArrival) - new Date(stop.plannedArrival)) / 60000)
    : 0
  return (
    <li className={`timeline-item status-${stop.status} ${stop.windowStatus}`}>
      <span className="timeline-dot">{stop.sequence}</span>
      <div className="min-w-0 flex-1">
        <div className="flex-between gap-2 flex-wrap">
          <p className="font-medium">{stop.customerName || stop.address.split(',')[0]} <span className="text-xs text-muted font-mono">{stop.deliveryId}</span></p>
          <StatusBadge status={stop.status} />
        </div>
        <p className="text-sm text-secondary">{stop.address}</p>
        <div className="flex flex-wrap gap-2 mt-1 text-xs items-center">
          {stop.priority !== 'standard' && <StatusBadge status={stop.priority} />}
          {stop.status === 'completed'
            ? <span>Delivered {formatClock(stop.completedAt)}</span>
            : stop.status === 'failed'
              ? <span className="text-error">Failed {formatClock(stop.failedAt)}: {stop.failureReason}</span>
              : <span>ETA {formatClock(stop.estimatedArrival)}{etaDiff ? <span className={etaDiff > 0 ? 'text-error' : 'text-success'}> ({etaDiff > 0 ? '+' : ''}{etaDiff} min vs plan)</span> : null}</span>}
          {(stop.windowStart || stop.windowEnd) && <span>Window {stop.windowStart || '…'}–{stop.windowEnd || '…'}</span>}
          {stop.windowStatus === 'late' && stop.status !== 'completed' && <StatusBadge status="late" label={`${stop.lateByMin} min late`} />}
          {stop.packageWeightKg > 0 && <span className="text-muted">{stop.packageWeightKg} kg · {stop.packageSize}</span>}
          {stop.customerPhone && <a href={`tel:${stop.customerPhone}`}>{stop.customerPhone}</a>}
        </div>
        {stop.notes && <p className="text-xs text-muted mt-1">Note: {stop.notes}</p>}
        {stop.issues?.length > 0 && (
          <ul className="issue-list mt-2">
            {stop.issues.map((i, k) => (
              <li key={k} className="text-xs"><StatusBadge status={i.type === 'delay' ? 'late' : 'pending'} label={i.type === 'delay' ? `Delay ${i.delayMinutes} min` : 'Issue'} /> {i.description} · {formatClock(i.reportedAt)}</li>
            ))}
          </ul>
        )}
      </div>
    </li>
  )
}
