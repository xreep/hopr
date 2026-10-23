import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import api, { errorMessage } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import usePolling from '../hooks/usePolling'
import usePageTitle from '../hooks/usePageTitle'
import MapView from '../components/MapView'
import { StatusBadge, PageLoader, EmptyState } from '../components/ui'
import AuthImage from '../components/AuthImage'
import { useConfirm } from '../components/ConfirmDialog'
import Icon from '../components/icons'
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
  usePageTitle(route?.name || 'Route')
  const [busy, setBusy] = useState(false)
  const confirm = useConfirm()

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

  const recalculate = async () => {
    if (route.manualOrder && !(await confirm({
      title: 'Replace your stop order?',
      message: 'You put these stops in order by hand. Recalculating lets Hopr choose the order again.',
      confirmLabel: 'Recalculate'
    }))) return
    return reoptimize()
  }

  // Moves one stop up or down; the server re-times the route in the new order
  const moveStop = (index, offset) => {
    const order = route.stops.map(s => s._id)
    ;[order[index], order[index + offset]] = [order[index + offset], order[index]]
    return act(() => api.patch(`/routes/${id}/order`, { order }), 'Stop order updated and ETAs re-timed')
  }

  const reoptimize = () => act(() => api.post(`/routes/${id}/recalculate`, { reason: 'Manual recalculation' }), res => {
    const before = new Date(res.data.previousFinish).getTime()
    const after = new Date(res.data.newFinish).getTime()
    const diff = Math.round((after - before) / 60000)
    return `Re-optimized remaining stops · finish ${formatClock(res.data.newFinish)} (${diff >= 0 ? '+' : ''}${diff} min)`
  })

  const mapData = useMemo(() => {
    if (!route) return null
    const current = route.stops.findIndex(s => s.status === 'pending' || s.status === 'in_progress')
    return {
      lines: [{ id: 'route', coordinates: route.geometry?.coordinates || [], width: 4.5 }],
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
  const canReorder = isManager && route.status === 'planned' && route.stops.length > 1

  return (
    <div>
      <div className="page-header">
        <div>
          <Link to={isManager ? '/routes' : '/driver-panel'} className="btn btn-ghost btn-sm -ml-2 mb-1"><Icon name="arrowRight" className="rotate-180" />{isManager ? 'All routes' : 'My deliveries'}</Link>
          <h1 className="page-title flex flex-wrap items-center gap-3">{route.name} <StatusBadge status={route.status} /></h1>
          <p className="page-subtitle flex flex-wrap items-center gap-x-2 gap-y-1"><span className="route-plate">{route.routeId}</span>Batch {route.batchId}, planned for {formatDateTime(route.plannedStart)}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" className="btn btn-ghost" onClick={() => window.print()}><Icon name="print" />Print route sheet</button>
          {canRecalculate && <button type="button" className="btn btn-secondary" onClick={recalculate} disabled={busy}><Icon name="refresh" />Recalculate remaining stops</button>}
          {isOwnerDriver && route.status === 'planned' && (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => act(() => api.patch(`/routes/${id}/start`), 'Route started')}><Icon name="play" />Start route</button>
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
          {route.geometrySource === 'estimated' && <p className="text-xs text-muted px-4 py-2">Path shown as straight legs: road routing was unavailable when this route was planned. Recalculating the remaining stops tries again.</p>}
        </div>

        <div className="card">
          <div className="card-header"><h3 className="font-semibold">Planned vs actual</h3></div>
          <div className="card-body">
            <table className="table compact">
              <thead><tr><th></th><th>Planned</th><th>Actual</th></tr></thead>
              <tbody>
                <tr><td>Distance</td><td>{formatKm(route.totalDistance)}{route.roadDistanceKm ? <div className="text-xs text-muted">road {formatKm(route.roadDistanceKm)}</div> : null}</td><td>{route.actualDistance > 0 ? formatKm(route.actualDistance) : '-'}</td></tr>
                <tr><td>Duration</td><td>{formatDuration(route.estimatedTime)}{route.liveTrafficDriveMin ? <div className="text-xs text-muted">driving {formatDuration(route.liveTrafficDriveMin)} in live traffic (Mapbox)</div> : null}</td><td>{route.actualTime ? formatDuration(route.actualTime) : route.startedAt ? `running ${formatDuration((Date.now() - new Date(route.startedAt)) / 60000)}` : '-'}</td></tr>
                <tr><td>Fuel</td><td>{route.fuelEstimate} {route.fuelUnit}, {formatINR(route.fuelCost)}</td><td>—</td></tr>
                <tr><td>Deliveries</td><td>{route.stops.length}</td><td>{route.stops.filter(s => s.status === 'completed').length} delivered, {route.stops.filter(s => s.status === 'failed').length} failed</td></tr>
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
              {route.savings && (route.savings.distanceKm > 0.05
                ? <><dt>Saved by optimizing</dt><dd>{formatKm(route.savings.distanceKm)}, {formatINR(route.savings.fuelCost)} and {route.savings.minutes} min against the order entered</dd></>
                : route.savings.distanceKm < -0.05
                  ? <><dt>Against the order entered</dt><dd>{formatKm(-route.savings.distanceKm)} longer, to meet delivery windows and priorities</dd></>
                  : <><dt>Against the order entered</dt><dd>The stops were already in the best order</dd></>)}
              {route.driverLocation?.updatedAt && <><dt>Last GPS</dt><dd>{relativeTime(route.driverLocation.updatedAt)}</dd></>}
            </dl>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header flex-between">
          <h3 className="font-semibold">Stops ({done}/{route.stops.length} done)</h3>
          {route.manualOrder && <span className="text-micro text-ink-400">Order set by hand</span>}
        </div>
        <ol className="timeline card-body">
          {route.stops.map((s, i) => (
            <StopRow key={s._id} stop={s}
              reorder={canReorder ? { up: i > 0 ? () => moveStop(i, -1) : null, down: i < route.stops.length - 1 ? () => moveStop(i, 1) : null, busy } : null} />
          ))}
        </ol>
      </div>

      <PrintSheet route={route} />

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

// The route manifest on paper, for drivers without a smartphone or signal. Hidden on
// screen; "Print route sheet" prints only this (see @media print in index.css).
function PrintSheet({ route }) {
  return createPortal(
    <section className="print-sheet" aria-hidden="true">
      <h1>{route.name} <span>{route.routeId}</span></h1>
      <p>
        Planned for {formatDateTime(route.plannedStart)} · from {route.depot?.name || 'the hub'}
        {route.driver?.name ? ` · driver ${route.driver.name}` : ''}
        {route.vehicle ? ` · ${route.vehicle.name} (${route.vehicle.licensePlate})` : ''}
        {' · '}{formatKm(route.totalDistance)}, about {formatDuration(route.estimatedTime)}
      </p>
      <table>
        <thead>
          <tr><th>#</th><th>Customer and address</th><th>Phone</th><th>Window</th><th>ETA</th><th>Parcel</th><th>Signature or reason</th></tr>
        </thead>
        <tbody>
          {route.stops.map(s => (
            <tr key={s._id}>
              <td>{s.sequence}</td>
              <td><strong>{s.customerName || s.address.split(',')[0]}</strong><br />{s.address}{s.notes ? <><br /><em>Note: {s.notes}</em></> : null}</td>
              <td>{s.customerPhone || ''}</td>
              <td>{s.windowStart || s.windowEnd ? `${s.windowStart || '…'} to ${s.windowEnd || '…'}` : ''}</td>
              <td>{formatClock(s.estimatedArrival)}</td>
              <td>{s.packageWeightKg > 0 ? `${s.packageWeightKg} kg` : ''}{s.priority !== 'standard' ? ` ${s.priority}` : ''}</td>
              <td></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>,
    document.body
  )
}

function StopRow({ stop, reorder }) {
  const etaDiff = stop.plannedArrival && stop.estimatedArrival
    ? Math.round((new Date(stop.estimatedArrival) - new Date(stop.plannedArrival)) / 60000)
    : 0
  return (
    <li className={`timeline-item status-${stop.status} ${stop.windowStatus}`}>
      <span className="timeline-dot">{stop.sequence}</span>
      <div className="min-w-0 flex-1">
        <div className="flex-between gap-2 flex-wrap">
          <p className="font-medium">{stop.customerName || stop.address.split(',')[0]} <span className="text-micro text-ink-400 font-normal">{stop.deliveryId}</span></p>
          <div className="flex items-center gap-1">
            {reorder && (
              <>
                <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={reorder.up} disabled={!reorder.up || reorder.busy} aria-label={`Move stop ${stop.sequence} earlier`}><Icon name="arrowUp" /></button>
                <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={reorder.down} disabled={!reorder.down || reorder.busy} aria-label={`Move stop ${stop.sequence} later`}><Icon name="arrowDown" /></button>
              </>
            )}
            <StatusBadge status={stop.status} />
          </div>
        </div>
        <p className="text-sm text-secondary">{stop.address}</p>
        <div className="flex flex-wrap gap-2 mt-1 text-xs items-center">
          {stop.priority !== 'standard' && <StatusBadge status={stop.priority} />}
          {stop.status === 'completed'
            ? <span>Delivered {formatClock(stop.completedAt)}</span>
            : stop.status === 'failed'
              ? <span className="text-error">Failed {formatClock(stop.failedAt)}: {stop.failureReason}</span>
              : <span>ETA <span className="eta-chip">{formatClock(stop.estimatedArrival)}</span>{etaDiff > 0
                ? <span className="text-signal-amber">, {formatDuration(etaDiff)} later than planned</span>
                : etaDiff < -5 ? <span className="text-ink-400">, ahead of plan</span> : null}</span>}
          {stop.receivedAt && <span className="text-ink-400">Recorded on the phone without signal, received {formatClock(stop.receivedAt)}</span>}
          {(stop.windowStart || stop.windowEnd) && <span className="text-ink-300">Window {stop.windowStart || '…'} to {stop.windowEnd || '…'}</span>}
          {stop.windowStatus === 'late' && stop.status !== 'completed' && <StatusBadge status="late" label={`${stop.lateByMin} min late`} />}
          {stop.packageWeightKg > 0 && <span className="text-ink-400">{stop.packageWeightKg} kg, {stop.packageSize} parcel</span>}
          {stop.customerPhone && <a href={`tel:${stop.customerPhone}`} className="no-underline hover:underline whitespace-nowrap">{stop.customerPhone}</a>}
        </div>
        {stop.notes && <p className="text-xs text-muted mt-1">Note: {stop.notes}</p>}
        {stop.trackingToken && stop.status !== 'completed' && stop.status !== 'failed' && (
          <div className="flex flex-wrap gap-x-2 gap-y-1 mt-1 -ml-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={async () => {
              try {
                await navigator.clipboard.writeText(`${window.location.origin}/track/${stop.trackingToken}`)
                toast.success('Customer tracking link copied')
              } catch { toast.error('Copy failed') }
            }}><Icon name="copy" />Copy tracking link</button>
            <a className="btn btn-ghost btn-sm" href={`/track/${stop.trackingToken}`} target="_blank" rel="noopener noreferrer"><Icon name="external" />Open tracking page</a>
          </div>
        )}
        {stop.proof && (stop.proof.photo || stop.proof.signature) && (
          <div className="pod-view mt-2">
            {stop.proof.photo && <figure><AuthImage id={stop.proof.photo} alt={`Delivery photo for ${stop.customerName || stop.address}`} className="pod-thumb" /><figcaption>Photo</figcaption></figure>}
            {stop.proof.signature && <figure><AuthImage id={stop.proof.signature} alt={`Signature for ${stop.customerName || stop.address}`} className="pod-thumb pod-signature" /><figcaption>Signature</figcaption></figure>}
            <div className="text-xs text-secondary">
              <p>Completed {formatDateTime(stop.proof.completedAt)}{stop.proof.completedBy?.name ? ` by ${stop.proof.completedBy.name}` : ''}</p>
              {stop.proof.note && <p className="mt-1">“{stop.proof.note}”</p>}
            </div>
          </div>
        )}
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
