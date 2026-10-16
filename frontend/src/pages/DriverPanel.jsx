import { useCallback, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import api, { errorMessage } from '../utils/api'
import usePolling from '../hooks/usePolling'
import MapView from '../components/MapView'
import { Modal, StatusBadge, EmptyState, PageLoader } from '../components/ui'
import ProofOfDeliveryDialog from '../components/ProofOfDeliveryDialog'
import { formatKm, formatDuration, initials } from '../utils/format'
import { formatClock, minutesUntil } from '../utils/time'
import { stopVariant, isStale } from '../utils/routeView'
import { useAuth } from '../context/AuthContext'
import useDriverLocation from '../hooks/useDriverLocation'
import { relativeTime } from '../utils/time'

const FAILURE_REASONS = ['Customer not available', 'Address not found', 'Customer refused delivery', 'Access restricted / gate locked', 'Package damaged']

export default function DriverPanel() {
  const { user } = useAuth()
  const [routes, setRoutes] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState(null) // { kind: 'pod' | 'fail' | 'issue', stop }
  const knownIds = useRef(null)

  const load = useCallback(async () => {
    const res = await api.get('/routes/driver/assigned')
    const list = res.data.routes
    // Announce routes that appeared since the last poll
    if (knownIds.current) {
      const fresh = list.filter(r => !knownIds.current.has(r._id))
      fresh.forEach(r => toast.success(`New route assigned: ${r.name} (${r.stops.length} stops)`))
    }
    knownIds.current = new Set(list.map(r => r._id))
    setRoutes(list)
    setSelectedId(prev => (prev && list.some(r => r._id === prev) ? prev : (list.find(r => r.status === 'active') || list[0])?._id || null))
  }, [])
  usePolling(load, 15000)

  const route = routes?.find(r => r._id === selectedId) || null
  const gps = useDriverLocation(route)
  const [picking, setPicking] = useState(false)
  const currentIndex = route ? route.stops.findIndex(s => s.status === 'pending' || s.status === 'in_progress') : -1
  const currentStop = currentIndex >= 0 ? route.stops[currentIndex] : null

  const applyRoute = updated => {
    setRoutes(prev => {
      if (!prev) return prev
      if (updated.status === 'completed' || updated.status === 'cancelled') return prev.filter(r => r._id !== updated._id)
      return prev.map(r => (r._id === updated._id ? { ...r, ...updated, vehicle: r.vehicle } : r))
    })
  }

  const call = async (request, success) => {
    setBusy(true)
    try {
      const res = await request()
      if (res.data.route) applyRoute(res.data.route)
      if (success) toast.success(success(res.data.route))
      return res
    } catch (err) {
      toast.error(errorMessage(err, 'Update failed'))
      return null
    } finally {
      setBusy(false)
    }
  }

  const startRoute = () => call(() => api.patch(`/routes/${route._id}/start`), () => 'Route started. Drive safe!')
  const setStatus = (stop, status, reason) => call(
    () => api.patch(`/routes/${route._id}/stops/${stop._id}/status`, { status, ...(reason && { reason }) }),
    updated => (updated.status === 'completed' ? 'All stops done. Route complete!' : 'Marked as failed')
  )

  const mapData = useMemo(() => {
    if (!route) return null
    return {
      lines: [{ id: 'r', coordinates: route.geometry?.coordinates || [], color: '#2563eb', width: 5 }],
      points: [
        ...(route.depot?.coordinates ? [{ id: 'depot', coordinates: route.depot.coordinates, label: 'H', variant: 'depot', title: route.depot.name }] : []),
        ...route.stops.map((s, i) => ({ id: s._id, coordinates: s.coordinates, label: s.sequence, variant: stopVariant(s, i === currentIndex), title: s.address }))
      ],
      driver: gps.position
        ? { coordinates: gps.position, initials: initials(user?.name), stale: false }
        : route.driverLocation?.coordinates?.length === 2
          ? { coordinates: route.driverLocation.coordinates, initials: initials(user?.name), stale: isStale(route.driverLocation.updatedAt) }
          : null
    }
  }, [route, currentIndex, user, gps.position])

  if (!routes) return <PageLoader />

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">My deliveries</h1>
          <p className="page-subtitle">Assigned routes, navigation and delivery status</p>
        </div>
      </div>

      {routes.length === 0 ? (
        <div className="card"><EmptyState title="No routes assigned">New assignments appear here automatically.</EmptyState></div>
      ) : (
        <div className="driver-grid">
          <aside className="card driver-routes">
            <div className="card-header"><h3 className="font-semibold">Routes ({routes.length})</h3></div>
            <ul>
              {routes.map(r => {
                const done = r.stops.filter(s => s.status === 'completed' || s.status === 'failed').length
                return (
                  <li key={r._id}>
                    <button type="button" className={`route-select ${r._id === selectedId ? 'active' : ''}`} onClick={() => setSelectedId(r._id)}>
                      <span className="flex-between gap-2"><span className="font-medium truncate">{r.name}</span><StatusBadge status={r.status} /></span>
                      <span className="text-xs text-muted">{done}/{r.stops.length} stops · {formatKm(r.totalDistance)} · {formatDuration(r.estimatedTime)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </aside>

          {route && (
            <section className="space-y-4">
              <div className="card overflow-hidden">
                <MapView lines={mapData.lines} points={mapData.points} driver={mapData.driver} fitKey={route._id} height={300}
                  onMapClick={picking ? async coords => { await gps.sendManual(coords); setPicking(false); toast.success('Location updated') } : undefined} />
                {route.status === 'active' && (
                  <LocationBar gps={gps} picking={picking} setPicking={setPicking} canSimulate={route.geometry?.coordinates?.length > 1} isDemo={route.isDemo} />
                )}
                <div className="card-body flex-between flex-wrap gap-3">
                  <div>
                    <p className="font-semibold">{route.name}</p>
                    <p className="text-xs text-muted">{route.routeId}{route.vehicle ? ` · ${route.vehicle.name} (${route.vehicle.licensePlate})` : ''}</p>
                  </div>
                  <div className="flex gap-2">
                    <Link to={`/routes/${route._id}`} className="btn btn-ghost btn-sm">Details</Link>
                    {route.status === 'planned' && <button type="button" className="btn btn-primary" onClick={startRoute} disabled={busy}>Start route</button>}
                  </div>
                </div>
              </div>

              {currentStop ? (
                <div className="card current-stop">
                  <div className="card-header flex-between">
                    <span className="text-sm text-muted">Stop {currentStop.sequence} of {route.stops.length}</span>
                    <StatusBadge status={currentStop.priority} />
                  </div>
                  <div className="card-body space-y-3">
                    <div>
                      <p className="text-lg font-semibold">{currentStop.customerName || 'Customer'}</p>
                      <p className="text-secondary">{currentStop.address}</p>
                      <p className="text-sm mt-1">
                        ETA <strong>{formatClock(currentStop.estimatedArrival)}</strong>
                        {minutesUntil(currentStop.estimatedArrival) !== null && ` (${minutesUntil(currentStop.estimatedArrival) >= 0 ? 'in ' : ''}${Math.abs(minutesUntil(currentStop.estimatedArrival))} min${minutesUntil(currentStop.estimatedArrival) < 0 ? ' ago' : ''})`}
                        {(currentStop.windowStart || currentStop.windowEnd) && <> · window {currentStop.windowStart || '…'}–{currentStop.windowEnd || '…'}</>}
                      </p>
                      {currentStop.notes && <p className="alert alert-info mt-2 text-sm">{currentStop.notes}</p>}
                      {currentStop.packageWeightKg > 0 && <p className="text-xs text-muted mt-1">{currentStop.deliveryId} · {currentStop.packageWeightKg} kg · {currentStop.packageSize}</p>}
                    </div>
                    <div className="driver-actions">
                      <a className="btn btn-secondary" target="_blank" rel="noopener noreferrer"
                        href={`https://www.google.com/maps/dir/?api=1&destination=${currentStop.coordinates[1]},${currentStop.coordinates[0]}&travelmode=driving`}>
                        Navigate
                      </a>
                      {currentStop.customerPhone && <a className="btn btn-outline" href={`tel:${currentStop.customerPhone}`}>Call</a>}
                      {currentStop.trackingToken && <ShareTrackingButton token={currentStop.trackingToken} name={currentStop.customerName} />}
                      <button type="button" className="btn btn-success" disabled={busy} onClick={() => setDialog({ kind: 'pod', stop: currentStop })}>Mark delivered</button>
                      <button type="button" className="btn btn-danger" disabled={busy} onClick={() => setDialog({ kind: 'fail', stop: currentStop })}>Failed</button>
                      <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setDialog({ kind: 'issue', stop: currentStop })}>Report issue / delay</button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="card"><EmptyState title="All stops on this route are done" /></div>
              )}

              <div className="card">
                <div className="card-header"><h3 className="font-semibold">All stops</h3></div>
                <ol className="timeline card-body">
                  {route.stops.map((s, i) => (
                    <li key={s._id} className={`timeline-item status-${s.status} ${i === currentIndex ? 'current' : ''}`}>
                      <span className="timeline-dot">{s.sequence}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex-between gap-2">
                          <p className="font-medium truncate">{s.customerName || s.address.split(',')[0]}</p>
                          <StatusBadge status={s.status} />
                        </div>
                        <p className="text-xs text-muted truncate">{s.address}</p>
                        <p className="text-xs">{s.status === 'completed' ? `Delivered ${formatClock(s.completedAt)}` : s.status === 'failed' ? `Failed: ${s.failureReason}` : `ETA ${formatClock(s.estimatedArrival)}`}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          )}
        </div>
      )}

      {dialog?.kind === 'pod' && (
        <ProofOfDeliveryDialog route={route} stop={dialog.stop} onClose={() => setDialog(null)} onCompleted={updated => {
          applyRoute(updated)
          setDialog(null)
          toast.success(updated.status === 'completed' ? 'All stops done. Route complete!' : 'Delivery completed with proof')
        }} />
      )}
      {dialog?.kind === 'fail' && (
        <FailDialog stop={dialog.stop} onClose={() => setDialog(null)} onSubmit={async reason => {
          const res = await setStatus(dialog.stop, 'failed', reason)
          if (res) setDialog(null)
        }} />
      )}
      {dialog?.kind === 'issue' && (
        <IssueDialog stop={dialog.stop} onClose={() => setDialog(null)} onSubmit={async body => {
          const res = await call(() => api.post(`/routes/${route._id}/stops/${dialog.stop._id}/issues`, body), () => (body.type === 'delay' ? 'Delay reported, ETAs updated' : 'Issue reported'))
          if (res) setDialog(null)
        }} />
      )}
    </div>
  )
}

function FailDialog({ stop, onClose, onSubmit }) {
  const [reason, setReason] = useState(FAILURE_REASONS[0])
  const [other, setOther] = useState('')
  const final = reason === 'Other' ? other.trim() : reason
  return (
    <Modal title={`Delivery failed: ${stop.customerName || stop.address.split(',')[0]}`} onClose={onClose}>
      <fieldset className="space-y-2">
        <legend className="form-label">Reason</legend>
        {[...FAILURE_REASONS, 'Other'].map(r => (
          <label key={r} className="toggle-row">
            <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} /> <span>{r}</span>
          </label>
        ))}
        {reason === 'Other' && <input className="form-input" aria-label="Describe the reason" value={other} onChange={e => setOther(e.target.value)} maxLength={300} autoFocus />}
      </fieldset>
      <div className="flex justify-end gap-2 mt-4">
        <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-danger" disabled={!final} onClick={() => onSubmit(final)}>Mark as failed</button>
      </div>
    </Modal>
  )
}

function IssueDialog({ stop, onClose, onSubmit }) {
  const [type, setType] = useState('delay')
  const [delayMinutes, setDelay] = useState(15)
  const [description, setDescription] = useState('')
  const valid = type === 'delay' ? delayMinutes >= 1 && delayMinutes <= 600 : description.trim().length > 0
  return (
    <Modal title={`Report for stop ${stop.sequence}`} onClose={onClose}>
      <div className="tabs mb-3" role="radiogroup" aria-label="Report type">
        <button type="button" role="radio" aria-checked={type === 'delay'} className={`tab ${type === 'delay' ? 'active' : ''}`} onClick={() => setType('delay')}>Running late</button>
        <button type="button" role="radio" aria-checked={type === 'issue'} className={`tab ${type === 'issue' ? 'active' : ''}`} onClick={() => setType('issue')}>Other issue</button>
      </div>
      {type === 'delay' && (
        <div className="form-group">
          <label htmlFor="delay" className="form-label">Delay (minutes)</label>
          <input id="delay" type="number" min="1" max="600" className="form-input" value={delayMinutes} onChange={e => setDelay(Number(e.target.value))} />
          <p className="text-xs text-muted mt-1">All remaining ETAs (and customer tracking) shift by this amount.</p>
        </div>
      )}
      <div className="form-group">
        <label htmlFor="desc" className="form-label">{type === 'delay' ? 'Cause (optional)' : 'What happened?'}</label>
        <textarea id="desc" className="form-input" rows={3} value={description} onChange={e => setDescription(e.target.value)} maxLength={500}
          placeholder={type === 'delay' ? 'e.g. Traffic jam at Kutchery Chowk' : 'e.g. Wrong flat number on the parcel'} />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={!valid}
          onClick={() => onSubmit(type === 'delay' ? { type, delayMinutes, description: description.trim() || undefined } : { type, description: description.trim() })}>
          Send report
        </button>
      </div>
    </Modal>
  )
}

const GPS_LABELS = {
  idle: 'Location sharing is off',
  waiting: 'Waiting for GPS…',
  live: 'Sharing live location',
  denied: 'Location permission blocked',
  unavailable: 'GPS unavailable on this device',
  error: 'GPS error'
}

function LocationBar({ gps, picking, setPicking, canSimulate, isDemo }) {
  const problem = ['denied', 'unavailable', 'error'].includes(gps.status) && gps.mode === 'gps'
  return (
    <div className={`location-bar ${gps.status === 'live' ? 'live' : problem ? 'problem' : ''}`} role="status" aria-live="polite">
      <div className="min-w-0">
        <p className="text-sm font-medium">
          <span className="gps-dot" aria-hidden="true" />
          {gps.mode === 'simulate' ? 'Demo drive: simulated GPS along the route' : gps.mode === 'manual' ? 'Location set manually' : GPS_LABELS[gps.status]}
        </p>
        <p className="text-xs text-muted">
          {gps.lastSentAt ? `Last update ${relativeTime(gps.lastSentAt)} · every 5 s` : 'Customers see your position on their tracking page'}
          {gps.error && <span className="text-error"> · {gps.error}</span>}
          {problem && ' · use "Update location" or pick your position on the map'}
        </p>
      </div>
      <div className="flex gap-2 flex-wrap">
        <button type="button" className="btn btn-outline btn-sm" onClick={async () => {
          gps.setMode('gps')
          const ok = await gps.updateNow()
          if (ok) toast.success('Location updated')
          else toast.error('Could not read GPS. Pick your position on the map instead.')
        }}>Update location</button>
        <button type="button" className={`btn btn-sm ${picking ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={picking} onClick={() => setPicking(p => !p)}>
          {picking ? 'Tap the map…' : 'Pick on map'}
        </button>
        {canSimulate && (isDemo || problem || gps.mode === 'simulate') && (
          <button type="button" className={`btn btn-sm ${gps.mode === 'simulate' ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={gps.mode === 'simulate'}
            onClick={() => gps.setMode(gps.mode === 'simulate' ? 'gps' : 'simulate')}>
            {gps.mode === 'simulate' ? 'Stop demo drive' : 'Simulate drive (demo)'}
          </button>
        )}
      </div>
    </div>
  )
}

function ShareTrackingButton({ token, name }) {
  const url = `${window.location.origin}/track/${token}`
  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Track your Hopr delivery', text: `Hi ${name || ''}, track your delivery live:`.trim(), url })
      } else {
        await navigator.clipboard.writeText(url)
        toast.success('Tracking link copied')
      }
    } catch { /* share sheet dismissed */ }
  }
  return <button type="button" className="btn btn-outline" onClick={share}>Share tracking</button>
}
