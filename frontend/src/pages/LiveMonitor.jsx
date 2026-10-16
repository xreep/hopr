import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import api, { errorMessage } from '../utils/api'
import usePolling from '../hooks/usePolling'
import MapView from '../components/MapView'
import AddressAutocomplete from '../components/AddressAutocomplete'
import { StatusBadge, EmptyState } from '../components/ui'
import { ROUTE_COLORS } from '../config'
import { initials } from '../utils/format'
import { formatClock, relativeTime } from '../utils/time'
import { stopVariant, isStale } from '../utils/routeView'

const blankIncident = { type: 'congestion', label: '', coordinates: null, place: '', radiusKm: 0.6, severity: 1.8, durationMinutes: 120 }

export default function LiveMonitor() {
  const [routes, setRoutes] = useState([])
  const [incidents, setIncidents] = useState([])
  const [form, setForm] = useState(blankIncident)
  const [placing, setPlacing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [focus, setFocus] = useState(null)

  const load = useCallback(async () => {
    const [r, i] = await Promise.all([
      api.get('/routes', { params: { status: 'active', withGeometry: true, limit: 50 } }),
      api.get('/incidents')
    ])
    setRoutes(r.data.routes)
    setIncidents(i.data.incidents)
  }, [])
  usePolling(load, 10000)

  const planned = useCallback(async () => {
    const r = await api.get('/routes', { params: { status: 'planned', limit: 50 } })
    return r.data.routes.filter(x => x.needsRecalculation)
  }, [])
  const [plannedAffected, setPlannedAffected] = useState([])
  usePolling(async () => setPlannedAffected(await planned()), 30000)

  const mapData = useMemo(() => {
    const shown = focus ? routes.filter(r => r._id === focus) : routes
    return {
      lines: shown.map(r => ({ id: r._id, coordinates: r.geometry?.coordinates || [], color: ROUTE_COLORS[routes.indexOf(r) % ROUTE_COLORS.length], width: 4 })),
      points: shown.flatMap(r => {
        const current = r.stops.findIndex(s => s.status === 'pending' || s.status === 'in_progress')
        return r.stops.map((s, i) => ({ id: `${r._id}-${s._id}`, coordinates: s.coordinates, label: s.sequence, variant: stopVariant(s, i === current), title: `${r.name}: ${s.sequence}. ${s.address}` }))
      }),
      drivers: shown.filter(r => r.driverLocation?.coordinates?.length === 2).map(r => ({
        id: r._id,
        coordinates: r.driverLocation.coordinates,
        initials: initials(r.driver?.name),
        stale: isStale(r.driverLocation.updatedAt),
        title: `${r.driver?.name} · ${r.name} · GPS ${relativeTime(r.driverLocation.updatedAt)}`
      }))
    }
  }, [routes, focus])

  const incidentShapes = useMemo(() => [
    ...incidents.map(i => ({ id: i._id, coordinates: i.coordinates, radiusKm: i.radiusKm, type: i.type, label: i.label })),
    ...(form.coordinates ? [{ id: 'draft', coordinates: form.coordinates, radiusKm: form.radiusKm, type: form.type, label: 'New incident' }] : [])
  ], [incidents, form])

  const submitIncident = async e => {
    e.preventDefault()
    if (!form.coordinates) return toast.error('Click the map or search a place to set the location')
    if (!form.label.trim()) return toast.error('Describe the incident')
    setBusy(true)
    try {
      const res = await api.post('/incidents', {
        type: form.type,
        label: form.label.trim(),
        coordinates: form.coordinates,
        radiusKm: Number(form.radiusKm),
        ...(form.type === 'congestion' && { severity: Number(form.severity) }),
        durationMinutes: Number(form.durationMinutes)
      })
      const n = res.data.affectedRoutes.length
      toast.success(n ? `Incident reported · ${n} route(s) need recalculation` : 'Incident reported · no planned routes affected')
      setForm(blankIncident)
      setPlacing(false)
      load()
      setPlannedAffected(await planned())
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to report incident'))
    } finally {
      setBusy(false)
    }
  }

  const resolve = async incident => {
    try {
      await api.patch(`/incidents/${incident._id}/resolve`)
      toast.success('Incident resolved')
      load()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const recalc = async route => {
    try {
      const res = await api.post(`/routes/${route._id}/recalculate`, { reason: 'Traffic incident' })
      toast.success(`${route.name}: new finish ${formatClock(res.data.newFinish)}`)
      load()
      setPlannedAffected(await planned())
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const affected = [...routes.filter(r => r.needsRecalculation), ...plannedAffected]

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Live Monitor</h1>
          <p className="page-subtitle">Active deliveries, driver positions and traffic incidents (refreshes every 10 s)</p>
        </div>
      </div>

      <div className="monitor-grid">
        <div className="card overflow-hidden">
          <MapView lines={mapData.lines} points={mapData.points} drivers={mapData.drivers} incidents={incidentShapes}
            fitKey={`${focus}-${routes.length}`} traffic height={560}
            onMapClick={placing ? coords => setForm(f => ({ ...f, coordinates: coords, place: `${coords[1].toFixed(5)}, ${coords[0].toFixed(5)}` })) : undefined} />
        </div>

        <div className="space-y-4">
          <div className="card">
            <div className="card-header flex-between">
              <h3 className="font-semibold">On the road ({routes.length})</h3>
              {focus && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFocus(null)}>Show all</button>}
            </div>
            <div className="card-body">
              {routes.length === 0 ? <EmptyState title="No active routes" /> : (
                <ul className="live-list">
                  {routes.map((r, idx) => {
                    const done = r.stops.filter(s => s.status === 'completed' || s.status === 'failed').length
                    const next = r.stops.find(s => s.status === 'pending' || s.status === 'in_progress')
                    return (
                      <li key={r._id} className={`live-item ${focus === r._id ? 'selected' : ''}`}>
                        <button type="button" className="w-full text-left" onClick={() => setFocus(r._id)}>
                          <span className="route-swatch" style={{ background: ROUTE_COLORS[idx % ROUTE_COLORS.length] }} aria-hidden="true" />
                          <span className="font-medium">{r.driver?.name || 'Unassigned'}</span> <span className="text-sm text-muted">· {r.name}</span>
                          <span className="block text-xs text-secondary">
                            {done}/{r.stops.length} stops{next ? ` · next ETA ${formatClock(next.estimatedArrival)}` : ''} · GPS {relativeTime(r.driverLocation?.updatedAt)}
                          </span>
                        </button>
                        <Link to={`/routes/${r._id}`} className="text-xs">Details →</Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>

          {affected.length > 0 && (
            <div className="card">
              <div className="card-header"><h3 className="font-semibold">Needs recalculation</h3></div>
              <ul className="card-body space-y-2">
                {affected.map(r => (
                  <li key={r._id} className="flex-between gap-2">
                    <span className="text-sm">{r.name} <StatusBadge status={r.status} /></span>
                    <button type="button" className="btn btn-warning btn-sm" onClick={() => recalc(r)}>Recalculate</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card">
            <div className="card-header"><h3 className="font-semibold">Traffic incidents</h3></div>
            <div className="card-body">
              {incidents.length === 0 ? <p className="text-sm text-muted mb-3">No active incidents.</p> : (
                <ul className="space-y-2 mb-4">
                  {incidents.map(i => (
                    <li key={i._id} className="flex-between gap-2 text-sm">
                      <span><StatusBadge status={i.type === 'closure' ? 'failed' : 'late'} label={i.type === 'closure' ? 'Closure' : `Congestion ×${i.severity}`} /> {i.label}</span>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => resolve(i)}>Resolve</button>
                    </li>
                  ))}
                </ul>
              )}

              <form onSubmit={submitIncident} className="space-y-3 incident-form">
                <p className="font-medium text-sm">Report congestion or a road closure</p>
                <div className="tabs" role="radiogroup" aria-label="Incident type">
                  {['congestion', 'closure'].map(t => (
                    <button key={t} type="button" role="radio" aria-checked={form.type === t} className={`tab ${form.type === t ? 'active' : ''}`}
                      onClick={() => setForm(f => ({ ...f, type: t }))}>{t === 'closure' ? 'Road closure' : 'Congestion'}</button>
                  ))}
                </div>
                <input className="form-input" placeholder="e.g. Main Road closed for procession" aria-label="Incident description" value={form.label}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value }))} maxLength={120} />
                <AddressAutocomplete value={form.place} coordinates={form.coordinates} ariaLabel="Incident location" placeholder="Search a place, or click the map"
                  onChange={place => setForm(f => ({ ...f, place, coordinates: null }))}
                  onSelect={({ address, coordinates }) => setForm(f => ({ ...f, place: address, coordinates }))} />
                <button type="button" className={`btn btn-sm ${placing ? 'btn-primary' : 'btn-outline'}`} onClick={() => setPlacing(p => !p)} aria-pressed={placing}>
                  {placing ? 'Click on the map to place…' : 'Pick location on map'}
                </button>
                <div className="grid grid-3 gap-2">
                  <label className="text-xs">Radius (km)
                    <input type="number" step="0.1" min="0.1" max="5" className="form-input" value={form.radiusKm} onChange={e => setForm(f => ({ ...f, radiusKm: e.target.value }))} />
                  </label>
                  {form.type === 'congestion' && (
                    <label className="text-xs">Slowdown ×
                      <input type="number" step="0.1" min="1" max="4" className="form-input" value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))} />
                    </label>
                  )}
                  <label className="text-xs">Lasts (min)
                    <input type="number" min="5" max="1440" className="form-input" value={form.durationMinutes} onChange={e => setForm(f => ({ ...f, durationMinutes: e.target.value }))} />
                  </label>
                </div>
                <button type="submit" className="btn btn-warning w-full" disabled={busy}>Report incident</button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
