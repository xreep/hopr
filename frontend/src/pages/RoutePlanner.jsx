import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api, { errorMessage } from '../utils/api'
import MapView from '../components/MapView'
import AddressAutocomplete from '../components/AddressAutocomplete'
import { fetchSuggestions } from '../utils/geocoding'
import { StatusBadge } from '../components/ui'
import { DEFAULT_DEPOT, VEHICLE_TYPES, PRIORITY_OPTIONS, MAX_STOPS_PER_ROUTE, ROUTE_COLORS, VOLT, VEHICLE_ICONS, vehicleTypeLabel } from '../config'
import Icon from '../components/icons'
import useMediaQuery from '../hooks/useMediaQuery'
import { csvToStops, SAMPLE_CSV } from '../utils/csv'
import { formatDuration, formatINR, formatKm } from '../utils/format'
import { formatClock, toISTInputValue, fromISTInputValue } from '../utils/time'

let keySeq = 0
const newStop = (data = {}) => ({
  key: ++keySeq,
  address: '',
  coordinates: null,
  customerName: '',
  customerPhone: '',
  priority: 'standard',
  windowStart: '',
  windowEnd: '',
  packageWeightKg: '',
  packageSize: 'small',
  notes: '',
  expanded: false,
  ...data
})

function nextQuarterHour() {
  const d = new Date(Date.now() + 15 * 60000)
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0)
  return d
}

function stopPayload(s) {
  const out = { address: s.address.trim(), coordinates: s.coordinates, priority: s.priority, packageSize: s.packageSize }
  if (s.customerName.trim()) out.customerName = s.customerName.trim()
  if (s.customerPhone.trim()) out.customerPhone = s.customerPhone.trim()
  if (s.windowStart) out.windowStart = s.windowStart
  if (s.windowEnd) out.windowEnd = s.windowEnd
  if (s.packageWeightKg !== '' && Number(s.packageWeightKg) >= 0) out.packageWeightKg = Number(s.packageWeightKg)
  if (s.notes.trim()) out.notes = s.notes.trim()
  return out
}

export default function RoutePlanner() {
  const navigate = useNavigate()
  const fileInput = useRef(null)
  const [name, setName] = useState('')
  const [departure, setDeparture] = useState(() => toISTInputValue(nextQuarterHour()))
  const [depot, setDepot] = useState(DEFAULT_DEPOT)
  const [depotText, setDepotText] = useState(DEFAULT_DEPOT.address)
  const [stops, setStops] = useState([newStop(), newStop()])
  const [vehicleMode, setVehicleMode] = useState('fleet')
  const [fleet, setFleet] = useState([])
  const [selectedVehicles, setSelectedVehicles] = useState([])
  const [vehicleType, setVehicleType] = useState('van')
  const [vehicleCount, setVehicleCount] = useState(1)
  const [trafficEnabled, setTrafficEnabled] = useState(true)
  const [returnToDepot, setReturnToDepot] = useState(false)
  const [plan, setPlan] = useState(null)
  const [activeRoute, setActiveRoute] = useState(0)
  const [drivers, setDrivers] = useState([])
  const [assignments, setAssignments] = useState({})
  const [optimizing, setOptimizing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [locating, setLocating] = useState(0)

  useEffect(() => {
    api.get('/vehicles', { params: { status: 'active', limit: 100 } })
      .then(res => {
        setFleet(res.data.vehicles)
        if (!res.data.vehicles.length) setVehicleMode('type')
      })
      .catch(() => setVehicleMode('type'))
    api.get('/drivers/available').then(res => setDrivers(res.data.drivers)).catch(() => {})
  }, [])

  // Any edit invalidates the previous optimization
  const touch = () => setPlan(null)

  const updateStop = (key, patch) => {
    setStops(prev => prev.map(s => (s.key === key ? { ...s, ...patch } : s)))
    touch()
  }
  const removeStop = key => {
    setStops(prev => (prev.length > 1 ? prev.filter(s => s.key !== key) : prev))
    touch()
  }
  const addStop = () => {
    setStops(prev => [...prev, newStop()])
    touch()
  }

  const vehiclesInPlan = vehicleMode === 'fleet' ? Math.max(1, selectedVehicles.length) : vehicleCount
  const filledStops = stops.filter(s => s.address.trim())
  const unlocated = filledStops.filter(s => !s.coordinates)
  const maxStops = MAX_STOPS_PER_ROUTE * vehiclesInPlan
  const windowErrors = stops.filter(s => s.windowStart && s.windowEnd && s.windowEnd <= s.windowStart)

  const importStops = async (incoming) => {
    const blankOnly = stops.every(s => !s.address.trim())
    const created = incoming.map(s => newStop(s))
    setStops(prev => (blankOnly ? created : [...prev, ...created]))
    touch()
    const missing = created.filter(s => !s.coordinates)
    if (!missing.length) return
    setLocating(missing.length)
    for (const s of missing) {
      try {
        const [hit] = await fetchSuggestions(s.address, { limit: 1 })
        if (hit) setStops(prev => prev.map(p => (p.key === s.key ? { ...p, coordinates: hit.coordinates } : p)))
      } catch { /* left unlocated; the user can pick a suggestion */ }
      setLocating(n => n - 1)
    }
  }

  const handleFile = e => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 512 * 1024) {
      toast.error('CSV is too large (max 512 KB)')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const { stops: rows, errors } = csvToStops(String(reader.result))
      if (errors.length) errors.slice(0, 3).forEach(m => toast.error(m))
      if (rows.length) {
        importStops(rows)
        toast.success(`Imported ${rows.length} stop${rows.length > 1 ? 's' : ''}`)
      }
    }
    reader.readAsText(file)
  }

  const buildPayload = () => ({
    stops: filledStops.map(stopPayload),
    depot: { name: depot.name, address: depot.address, coordinates: depot.coordinates },
    departureTime: fromISTInputValue(departure),
    trafficEnabled,
    returnToDepot,
    ...(vehicleMode === 'fleet' && selectedVehicles.length
      ? { vehicleIds: selectedVehicles }
      : { vehicleType, vehicleCount })
  })

  const optimize = async () => {
    if (filledStops.length < 1) return toast.error('Add at least one delivery address')
    if (unlocated.length) return toast.error(`Pick a suggestion for ${unlocated.length} address(es) so they can be located`)
    if (windowErrors.length) return toast.error('A delivery window ends before it starts')
    if (filledStops.length > maxStops) return toast.error(`At most ${MAX_STOPS_PER_ROUTE} stops per vehicle. Add vehicles or remove stops.`)
    if (vehicleMode === 'fleet' && !selectedVehicles.length && fleet.length) return toast.error('Select at least one vehicle')
    setOptimizing(true)
    try {
      const res = await api.post('/routes/optimize', buildPayload())
      setPlan(res.data)
      setActiveRoute(0)
      setAssignments({})
      const v = res.data.totals.violations
      toast.success(`Optimized ${res.data.totals.stops} stops into ${res.data.routes.length} route(s) in ${res.data.computeMs} ms`)
      if (v) toast(`${v} delivery window${v > 1 ? 's' : ''} can't be met. Check the warnings below.`)
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to optimize route'))
    } finally {
      setOptimizing(false)
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await api.post('/routes', {
        ...buildPayload(),
        name: name.trim() || undefined,
        assignments: plan.routes.map((_, i) => ({ driver: assignments[i] || undefined }))
      })
      toast.success(`Saved ${res.data.routes.length} route(s) · ${res.data.batchId}`)
      navigate(res.data.routes.length === 1 ? `/routes/${res.data.routes[0]._id}` : `/routes?batch=${res.data.batchId}`)
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to save routes'))
    } finally {
      setSaving(false)
    }
  }

  const mapData = useMemo(() => {
    const depotPoint = { id: 'depot', coordinates: depot.coordinates, label: 'H', variant: 'depot', title: depot.name || 'Depot' }
    if (!plan) {
      return {
        lines: [],
        points: [depotPoint, ...stops.filter(s => s.coordinates).map((s, i) => ({ id: s.key, coordinates: s.coordinates, label: i + 1, variant: 'muted', title: s.address }))]
      }
    }
    return {
      lines: plan.routes.map((r, i) => ({
        id: `r${i}`,
        coordinates: [r.depot.coordinates, ...r.stops.map(s => s.coordinates), ...(r.returnToDepot ? [r.depot.coordinates] : [])],
        color: i === activeRoute ? VOLT : ROUTE_COLORS[i % ROUTE_COLORS.length],
        width: i === activeRoute ? 4.5 : 3,
        opacity: i === activeRoute ? 1 : 0.45
      })),
      points: [depotPoint, ...plan.routes.flatMap((r, i) => r.stops.map(s => ({
        id: `r${i}-${s.sequence}`,
        coordinates: s.coordinates,
        label: s.sequence,
        variant: s.windowStatus === 'late' ? 'late' : i === activeRoute ? 'stop' : 'muted',
        title: `${s.sequence}. ${s.address}, ETA ${s.etaLabel}`
      })))]
    }
  }, [plan, stops, depot, activeRoute])

  const fitKey = plan ? `plan-${plan.computeMs}-${plan.routes.length}-${activeRoute}` : stops.filter(s => s.coordinates).map(s => s.coordinates.join()).join('|')
  const shownRoute = plan?.routes[activeRoute]
  const wideLayout = useMediaQuery('(min-width: 1101px)')

  return (
    <div className="planner">
      <div className="page-header">
        <div>
          <h1 className="page-title">Route planner</h1>
          <p className="page-subtitle">Add deliveries, pick vehicles, and let Hopr sequence every stop around traffic, windows, priority and fuel.</p>
        </div>
      </div>

      <div className="planner-grid">
        <section className="planner-map card" aria-label="Map">
          <MapView lines={mapData.lines} points={mapData.points} fitKey={fitKey} traffic={trafficEnabled} height="100%" insetBottom={shownRoute && wideLayout ? 96 : 0} />
          {shownRoute ? (
            <div className="planner-map-summary" aria-live="polite">
              <p className="text-micro text-ink-400">{plan.routes.length > 1 ? `Route ${activeRoute + 1} of ${plan.routes.length}, ${shownRoute.vehicle.name}` : shownRoute.vehicle.name}</p>
              <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 mt-1">
                <span className="planner-map-stat">{shownRoute.totals.distanceKm}<small>km</small></span>
                <span className="planner-map-stat">{formatDuration(shownRoute.totals.totalMinutes)}</span>
                <span className="planner-map-stat">{formatINR(shownRoute.totals.fuel.cost)}<small>fuel</small></span>
                <span className="text-small text-ink-300">{shownRoute.stops.length} stops, {shownRoute.returnToDepot ? 'back by' : 'done by'} {formatClock(shownRoute.finishTime)}</span>
              </div>
            </div>
          ) : (
            <div className="planner-map-summary is-idle">
              <p className="text-small text-ink-300">{filledStops.length ? `${filledStops.length - unlocated.length} of ${filledStops.length} addresses pinned. Optimize to draw the route.` : 'Add delivery addresses to see them on the map.'}</p>
            </div>
          )}
        </section>

        <section className="planner-panel" aria-label="Plan">
          <div className="card mb-4">
            <div className="card-body grid grid-2 gap-3">
              <div>
                <label className="form-label" htmlFor="batch-name">Batch name</label>
                <input id="batch-name" className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Morning run, Lalpur area" maxLength={100} />
              </div>
              <div>
                <label className="form-label" htmlFor="departure">Departure (IST)</label>
                <input id="departure" type="datetime-local" className="form-input" value={departure} onChange={e => { setDeparture(e.target.value); touch() }} />
              </div>
              <div className="sm:col-span-2">
                <label className="form-label" htmlFor="depot">Start depot</label>
                <AddressAutocomplete id="depot" value={depotText} coordinates={depot.coordinates}
                  onChange={text => { setDepotText(text); setDepot(d => ({ ...d, coordinates: null })) }}
                  onSelect={({ address, coordinates }) => { setDepotText(address); setDepot({ name: address.split(',')[0], address, coordinates }); touch() }} />
                {!depot.coordinates && (
                  <button type="button" className="btn btn-ghost btn-sm mt-1" onClick={() => { setDepot(DEFAULT_DEPOT); setDepotText(DEFAULT_DEPOT.address) }}>
                    Use Hopr Hub, Kokar
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="card mb-4">
            <div className="card-header flex-between">
              <h3>Deliveries <span className="text-ink-400 text-small font-sans font-normal">{filledStops.length} of {maxStops}</span></h3>
              <div className="flex gap-2">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileInput.current?.click()}><Icon name="upload" />Upload CSV</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
                  const blob = new Blob([SAMPLE_CSV], { type: 'text/csv' })
                  const a = document.createElement('a')
                  a.href = URL.createObjectURL(blob)
                  a.download = 'hopr-deliveries-template.csv'
                  a.click()
                  URL.revokeObjectURL(a.href)
                }}><Icon name="download" />Template</button>
                <input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} aria-label="Upload CSV of deliveries" />
              </div>
            </div>
            <div className="card-body stop-list">
              {locating > 0 && <p className="alert alert-info mb-3">Locating {locating} address(es)…</p>}
              {stops.map((stop, index) => (
                <StopEditor key={stop.key} index={index} stop={stop} onChange={patch => updateStop(stop.key, patch)}
                  onRemove={stops.length > 1 ? () => removeStop(stop.key) : null} />
              ))}
              <button type="button" className="btn btn-secondary w-full" onClick={addStop} disabled={stops.length >= maxStops}><Icon name="plus" />Add stop</button>
            </div>
          </div>

          <div className="card mb-4">
            <div className="card-header"><h3>Vehicles and constraints</h3></div>
            <div className="card-body space-y-4">
              <div className="tabs" role="tablist" aria-label="Vehicle selection">
                <button type="button" role="tab" aria-selected={vehicleMode === 'fleet'} className={`tab ${vehicleMode === 'fleet' ? 'active' : ''}`}
                  onClick={() => { setVehicleMode('fleet'); touch() }} disabled={!fleet.length}>Fleet vehicles</button>
                <button type="button" role="tab" aria-selected={vehicleMode === 'type'} className={`tab ${vehicleMode === 'type' ? 'active' : ''}`}
                  onClick={() => { setVehicleMode('type'); touch() }}>By vehicle type</button>
              </div>

              {vehicleMode === 'fleet' ? (
                <div className="vehicle-pick-list">
                  {fleet.map(v => {
                    const checked = selectedVehicles.includes(v._id)
                    return (
                      <label key={v._id} className={`vehicle-pick ${checked ? 'selected' : ''}`}>
                        <input type="checkbox" checked={checked} onChange={() => {
                          setSelectedVehicles(prev => (checked ? prev.filter(id => id !== v._id) : [...prev, v._id].slice(0, 10)))
                          touch()
                        }} />
                        <span className="font-medium">{v.name}</span>
                        <span className="text-xs text-muted">{vehicleTypeLabel(v.type)}, {v.capacity} kg, {v.mileage} {v.fuelType === 'electric' ? 'km/kWh' : 'km/L'}{v.driver ? `, driven by ${v.driver.name}` : ''}</span>
                      </label>
                    )
                  })}
                  {!fleet.length && <p className="text-sm text-muted">No active vehicles. Add some on the Vehicles page or plan by type.</p>}
                </div>
              ) : (
                <>
                  <div className="grid grid-2 gap-2">
                    {VEHICLE_TYPES.map(v => (
                      <button key={v.id} type="button" aria-pressed={vehicleType === v.id}
                        className={`vehicle-type ${vehicleType === v.id ? 'selected' : ''}`}
                        onClick={() => { setVehicleType(v.id); touch() }}>
                        <Icon name={VEHICLE_ICONS[v.id]} />
                        <span className="font-medium">{v.name}</span>
                        <span className="text-xs text-muted">{v.mileage} {v.unit} {v.fuelType}, {v.capacity} kg</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="form-label mb-0" htmlFor="vehicle-count">Number of vehicles</label>
                    <input id="vehicle-count" type="number" min="1" max="10" className="form-input w-24" value={vehicleCount}
                      onChange={e => { setVehicleCount(Math.max(1, Math.min(10, Number(e.target.value) || 1))); touch() }} />
                  </div>
                </>
              )}

              <label className="toggle-row">
                <input type="checkbox" checked={trafficEnabled} onChange={e => { setTrafficEnabled(e.target.checked); touch() }} />
                <span>
                  <span className="font-medium">Traffic-aware routing</span>
                  <span className="block text-xs text-muted">Uses Ranchi&apos;s rush-hour pattern and any congestion or closures you&apos;ve reported</span>
                </span>
              </label>
              <label className="toggle-row">
                <input type="checkbox" checked={returnToDepot} onChange={e => { setReturnToDepot(e.target.checked); touch() }} />
                <span className="font-medium">Return to depot after the last stop</span>
              </label>
            </div>
          </div>

          <div className="planner-action">
            <button type="button" className={`btn btn-lg w-full ${plan ? 'btn-secondary' : 'btn-primary'}`} onClick={optimize} disabled={optimizing || locating > 0}>
              {optimizing ? <><span className="spinner" /> Optimizing</> : plan ? <><Icon name="refresh" />Re-optimize</> : <><Icon name="bolt" />Optimize routes</>}
            </button>
          </div>

          {plan && (
            <PlanResults plan={plan} activeRoute={activeRoute} setActiveRoute={setActiveRoute}
              drivers={drivers} assignments={assignments} setAssignments={setAssignments}
              onSave={save} saving={saving} />
          )}
        </section>
      </div>
    </div>
  )
}

function StopEditor({ index, stop, onChange, onRemove }) {
  const invalidWindow = stop.windowStart && stop.windowEnd && stop.windowEnd <= stop.windowStart
  return (
    <div className={`stop-editor ${stop.coordinates ? 'is-located' : ''}`}>
      <div className="stop-editor-head">
        <span className="stop-index" aria-hidden="true">{index + 1}</span>
        <AddressAutocomplete
          className="flex-1"
          ariaLabel={`Stop ${index + 1} address`}
          value={stop.address}
          coordinates={stop.coordinates}
          onChange={address => onChange({ address, coordinates: null })}
          onSelect={({ address, coordinates }) => onChange({ address, coordinates })}
        />
        {onRemove && (
          <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={onRemove} aria-label={`Remove stop ${index + 1}`}><Icon name="x" /></button>
        )}
      </div>
      <div className="stop-editor-row">
        <input className="form-input" placeholder="Customer name" aria-label={`Stop ${index + 1} customer name`} value={stop.customerName}
          onChange={e => onChange({ customerName: e.target.value })} maxLength={100} />
        <select className="form-input form-select" aria-label={`Stop ${index + 1} priority`} value={stop.priority} onChange={e => onChange({ priority: e.target.value })}>
          {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label} priority</option>)}
        </select>
      </div>
      <div className="stop-editor-row">
        <label className="window-input">
          <span>Window from</span>
          <input type="time" className="form-input" aria-label={`Stop ${index + 1} window start`} value={stop.windowStart} onChange={e => onChange({ windowStart: e.target.value })} />
        </label>
        <label className="window-input">
          <span>Window to</span>
          <input type="time" className={`form-input ${invalidWindow ? 'error' : ''}`} aria-label={`Stop ${index + 1} window end`} value={stop.windowEnd} onChange={e => onChange({ windowEnd: e.target.value })} />
        </label>
        <label className="window-input">
          <span>Weight (kg)</span>
          <input type="number" min="0" step="0.1" className="form-input" aria-label={`Stop ${index + 1} package weight in kg`} value={stop.packageWeightKg} onChange={e => onChange({ packageWeightKg: e.target.value })} />
        </label>
      </div>
      {invalidWindow && <p className="form-error">The window has to end after it starts</p>}
      <button type="button" className="btn btn-ghost btn-sm self-start" onClick={() => onChange({ expanded: !stop.expanded })} aria-expanded={stop.expanded}>
        {stop.expanded ? 'Hide phone, size and notes' : 'Add phone, size and notes'}
      </button>
      {stop.expanded && (
        <div className="stop-editor-row">
          <input className="form-input" type="tel" placeholder="Customer phone" aria-label={`Stop ${index + 1} customer phone`} value={stop.customerPhone} onChange={e => onChange({ customerPhone: e.target.value })} maxLength={20} />
          <select className="form-input form-select" aria-label={`Stop ${index + 1} package size`} value={stop.packageSize} onChange={e => onChange({ packageSize: e.target.value })}>
            <option value="small">Small parcel</option>
            <option value="medium">Medium parcel</option>
            <option value="large">Large parcel</option>
          </select>
          <input className="form-input sm:col-span-2" placeholder="Notes for the driver" aria-label={`Stop ${index + 1} notes`} value={stop.notes} onChange={e => onChange({ notes: e.target.value })} maxLength={500} />
        </div>
      )}
    </div>
  )
}

const WINDOW_LABEL = s => (s.windowStatus === 'late' ? `${s.lateByMin} min late` : s.windowStatus === 'early' ? `Waits ${s.waitMinutes} min` : 'On time')

function PlanResults({ plan, activeRoute, setActiveRoute, drivers, assignments, setAssignments, onSave, saving }) {
  const route = plan.routes[activeRoute]
  const takenDrivers = new Set(Object.entries(assignments).filter(([i]) => Number(i) !== activeRoute).map(([, d]) => d))
  return (
    <div className="card plan-results mt-4" aria-live="polite">
      <div className="card-header">
        <div className="flex-between gap-3">
          <h3>Optimized plan</h3>
          <span className="text-micro text-ink-400">Solved in {plan.computeMs} ms{plan.incidentsConsidered ? `, ${plan.incidentsConsidered} traffic incident${plan.incidentsConsidered > 1 ? 's' : ''} avoided` : ''}</span>
        </div>
        <div className="plan-totals mt-2">
          <span>{plan.totals.routes} route{plan.totals.routes > 1 ? 's' : ''}</span>
          <span>{plan.totals.stops} stops</span>
          <span>{formatKm(plan.totals.distanceKm)}</span>
          <span>{formatINR(plan.totals.fuelCost)} fuel</span>
          <span>{plan.totals.co2Kg} kg CO₂</span>
        </div>
      </div>

      {plan.routes.length > 1 && (
        <div className="route-tabs" role="tablist" aria-label="Routes in this batch">
          {plan.routes.map((r, i) => (
            <button key={i} type="button" role="tab" aria-selected={i === activeRoute} className={`route-tab ${i === activeRoute ? 'active' : ''}`} onClick={() => setActiveRoute(i)}>
              <span className="route-swatch" style={{ background: i === activeRoute ? VOLT : ROUTE_COLORS[i % ROUTE_COLORS.length] }} aria-hidden="true" />
              Route {i + 1}<span className="text-micro block text-ink-400">{r.vehicle.name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="card-body space-y-4">
        <div className="grid grid-3 gap-2 metric-grid">
          <Metric label="Distance" value={formatKm(route.totals.distanceKm)} />
          <Metric label="Total time" value={formatDuration(route.totals.totalMinutes)} hint={`Back by ${formatClock(route.finishTime)}`} />
          <Metric label="Fuel" value={`${route.totals.fuel.quantity} ${route.totals.fuel.unit}`} hint={formatINR(route.totals.fuel.cost)} />
          <Metric label="Traffic" value={`×${route.totals.trafficImpactFactor}`} hint={`${route.totals.trafficLevel.charAt(0).toUpperCase()}${route.totals.trafficLevel.slice(1)} traffic`} />
          <Metric label="Load" value={`${route.totals.loadKg} kg`} hint={`${route.totals.utilizationPct}% of ${route.totals.capacityKg} kg`} />
          <Metric label="CO₂" value={`${route.totals.fuel.co2Kg} kg`} />
        </div>

        {route.violations.length > 0 && (
          <div className="alert alert-warning" role="alert">
            <p className="font-medium mb-1">Delivery windows at risk</p>
            <ul className="list-disc pl-5 text-small">
              {route.violations.map(v => <li key={v.sequence}>{v.message} ({v.lateByMin} min late)</li>)}
            </ul>
          </div>
        )}
        {route.capacityExceeded && <div className="alert alert-error">This load is heavier than the vehicle can carry.</div>}

        <ol className="timeline hop-seq" key={`${plan.computeMs}-${activeRoute}`}>
          <li className="timeline-item depot" style={{ '--i': 0 }}>
            <span className="timeline-dot">H</span>
            <div className="flex-1 flex-between gap-2">
              <div><p className="font-medium">{route.depot.name}</p><p className="text-micro text-ink-400">Start of route</p></div>
              <span className="eta-chip">{formatClock(route.departureTime)}</span>
            </div>
          </li>
          {route.stops.map((s, i) => (
            <li key={s.sequence} className={`timeline-item ${s.windowStatus}`} style={{ '--i': i + 1 }}>
              <span className="timeline-dot">{s.sequence}</span>
              <div className="min-w-0 flex-1">
                <div className="flex-between gap-2">
                  <p className="font-medium truncate">{s.customerName || s.address.split(',')[0]}</p>
                  <span className="eta-chip">{s.etaLabel}</span>
                </div>
                <p className="text-micro text-ink-400 truncate">{s.address}</p>
                <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
                  {s.priority === 'urgent' && <StatusBadge status="urgent" />}
                  {(s.windowStart || s.windowEnd) && (
                    <span className="text-micro text-ink-300">Window {s.windowStart || '…'} to {s.windowEnd || '…'}</span>
                  )}
                  {s.windowStatus !== 'none' && <StatusBadge status={s.windowStatus} label={WINDOW_LABEL(s)} />}
                  <span className="text-micro text-ink-400">+{s.legDistanceKm} km, {Math.round(s.legMinutes)} min{s.trafficLevel !== 'light' ? `, ${s.trafficLevel} traffic` : ''}</span>
                </div>
              </div>
            </li>
          ))}
        </ol>

        <details className="compare">
          <summary>Compare route options</summary>
          <div className="table-container mt-2">
            <table className="table compact">
              <thead><tr><th>Option</th><th>Distance</th><th>Time</th><th>Fuel cost</th><th>Late stops</th></tr></thead>
              <tbody>
                {route.alternatives.map(a => (
                  <tr key={a.key} className={a.key === 'optimized' ? 'text-ink-50 font-medium' : 'text-ink-300'}>
                    <td>{a.label}</td><td>{formatKm(a.distanceKm)}</td><td>{formatDuration(a.totalMinutes)}</td><td>{formatINR(a.fuelCost)}</td><td>{a.lateStops}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-small font-medium mt-4 mb-1">The same route in each vehicle type</p>
          <div className="table-container">
            <table className="table compact">
              <thead><tr><th>Vehicle</th><th>Energy</th><th>Cost</th><th>CO₂</th><th>Fits the load</th></tr></thead>
              <tbody>
                {route.vehicleComparison.map(v => (
                  <tr key={v.type} className={v.type === route.vehicle.type ? 'text-ink-50 font-medium' : 'text-ink-300'}>
                    <td>{v.label}</td><td>{v.quantity} {v.unit}</td><td>{formatINR(v.cost)}</td><td>{v.co2Kg} kg</td><td>{v.fitsLoad ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <div>
          <label className="form-label" htmlFor={`assign-${activeRoute}`}>Driver for this route</label>
          <select id={`assign-${activeRoute}`} className="form-input form-select" value={assignments[activeRoute] || ''}
            onChange={e => setAssignments(prev => ({ ...prev, [activeRoute]: e.target.value || undefined }))}>
            <option value="">Leave unassigned and auto-dispatch later</option>
            {drivers.filter(d => !takenDrivers.has(d._id)).map(d => (
              <option key={d._id} value={d._id}>{d.name}{d.vehicle ? `, ${d.vehicle.name}` : ''}{d.onRoute ? ' (on a route now)' : ''}</option>
            ))}
          </select>
        </div>

        <button type="button" className="btn btn-primary btn-lg w-full" onClick={onSave} disabled={saving}>
          {saving ? <><span className="spinner" /> Saving</> : <><Icon name="check" />Save {plan.routes.length > 1 ? `${plan.routes.length} routes` : 'route'}</>}
        </button>
      </div>
    </div>
  )
}

function Metric({ label, value, hint }) {
  return (
    <div className="metric">
      <p className="text-micro text-ink-400">{label}</p>
      <p className="metric-value">{value}</p>
      {hint && <p className="text-micro text-ink-300">{hint}</p>}
    </div>
  )
}
