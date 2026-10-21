import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import api, { errorMessage } from '../utils/api'
import usePolling from '../hooks/usePolling'
import { StatusBadge, EmptyState, SkeletonRows } from '../components/ui'
import DemoSeedButton from '../components/DemoSeedButton'
import DispatchPreviewDialog from '../components/DispatchPreviewDialog'
import { speak } from '../utils/speak'
import Icon from '../components/icons'
import { useConfirm } from '../components/ConfirmDialog'
import { formatKm, formatDuration, formatINR } from '../utils/format'
import { formatDateTime } from '../utils/time'

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'planned', label: 'Planned' },
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' }
]

export default function RoutesPage() {
  const [params, setParams] = useSearchParams()
  const status = params.get('status') || ''
  const batch = params.get('batch') || ''
  const unassigned = params.get('unassigned') === 'true'
  const query = params.get('q') || ''
  const [routes, setRoutes] = useState(null)
  const [drivers, setDrivers] = useState([])
  const [busy, setBusy] = useState(null)
  const [dispatching, setDispatching] = useState(false)
  const confirm = useConfirm()
  const closeDispatch = useCallback(() => setDispatching(false), [])

  // Opened from the command palette: /routes?dispatch=1
  useEffect(() => {
    if (params.get('dispatch') !== '1') return
    setDispatching(true)
    const next = new URLSearchParams(params)
    next.delete('dispatch')
    setParams(next, { replace: true })
  }, [params, setParams])

  const load = useCallback(async () => {
    try {
      const res = await api.get('/routes', {
        params: { limit: 100, ...(status && { status }), ...(batch && { batchId: batch }), ...(unassigned && { unassigned: true }) }
      })
      setRoutes(res.data.routes)
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load routes'))
      setRoutes([])
    }
  }, [status, batch, unassigned])
  usePolling(load, 20000)

  useEffect(() => {
    api.get('/drivers/available').then(res => setDrivers(res.data.drivers)).catch(() => {})
  }, [])

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: key === 'q' }) // typing a search should not fill the back button
  }

  const patchRoute = async (route, body, message) => {
    setBusy(route._id)
    try {
      await api.patch(`/routes/${route._id}`, body)
      toast.success(message)
      load()
    } catch (err) {
      toast.error(errorMessage(err, 'Update failed'))
    } finally {
      setBusy(null)
    }
  }

  const remove = async route => {
    const ok = await confirm({
      title: `Delete ${route.name}?`,
      message: [`${route.routeId} and its ${route.stops?.length ?? 0} stops will be removed, along with any delivery photos and signatures.`, 'This cannot be undone.'],
      confirmLabel: 'Delete route',
      tone: 'danger'
    })
    if (!ok) return
    setBusy(route._id)
    try {
      await api.delete(`/routes/${route._id}`)
      toast.success('Route deleted')
      load()
    } catch (err) {
      toast.error(errorMessage(err, 'Delete failed'))
    } finally {
      setBusy(null)
    }
  }

  const unassignedCount = routes?.filter(r => r.status === 'planned' && !r.driver).length || 0
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const shown = !routes ? null : !words.length ? routes : routes.filter(r => {
    const haystack = `${r.name} ${r.routeId} ${r.batchId || ''} ${r.driver?.name || ''} ${r.vehicle?.name || ''}`.toLowerCase()
    return words.every(w => haystack.includes(w))
  })

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Routes and dispatch</h1>
          <p className="page-subtitle">Every batch you&apos;ve planned, who&apos;s driving it, and how far along it is.</p>
        </div>
        <div className="flex gap-2 flex-wrap" id="dispatch-actions">
          <DemoSeedButton />
          <button type="button" className="btn btn-secondary" onClick={() => setDispatching(true)}><Icon name="bolt" />Auto-dispatch</button>
          <Link to="/route-planner" className="btn btn-primary"><Icon name="plus" />New batch</Link>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-body flex flex-wrap gap-2 items-center">
          <div className="relative w-full sm:w-64">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"><Icon name="search" size={16} /></span>
            <input type="search" className="form-input pl-9" placeholder="Name, route ID or driver" value={query}
              onChange={e => setFilter('q', e.target.value)} aria-label="Search routes" />
          </div>
          <div className="tabs" role="tablist" aria-label="Filter by status">
            {STATUS_FILTERS.map(f => (
              <button key={f.value} type="button" role="tab" aria-selected={status === f.value} className={`tab ${status === f.value ? 'active' : ''}`}
                onClick={() => setFilter('status', f.value)}>{f.label}</button>
            ))}
          </div>
          <label className="toggle-row ml-auto">
            <input type="checkbox" checked={unassigned} onChange={e => setFilter('unassigned', e.target.checked ? 'true' : '')} />
            <span className="text-sm">Unassigned only {unassignedCount ? `(${unassignedCount})` : ''}</span>
          </label>
          {batch && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFilter('batch', '')} aria-label={`Clear batch filter ${batch}`}>Batch {batch}<Icon name="x" /></button>}
        </div>
      </div>

      {!shown ? <div className="card"><SkeletonRows label="Loading routes" /></div> : shown.length === 0 ? (
        <div className="card">
          {query
            ? <EmptyState title={`No routes match “${query}”`} action={<button type="button" className="btn btn-secondary btn-sm" onClick={() => setFilter('q', '')}>Clear search</button>}>Search covers route names, route and batch IDs, drivers and vehicles.</EmptyState>
            : <EmptyState title="No routes match" action={<Link to="/route-planner" className="btn btn-primary btn-sm">Plan a batch</Link>} />}
        </div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table className="table min-w-[920px]">
              <thead>
                <tr>
                  <th>Route</th><th>Status</th><th>Stops</th><th>Distance and time</th><th>Fuel</th><th>Planned start</th><th>Driver</th><th className="text-right"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map(r => {
                  const done = r.stops.filter(s => s.status === 'completed' || s.status === 'failed').length
                  const editable = r.status === 'planned'
                  return (
                    <tr key={r._id}>
                      <td>
                        <Link to={`/routes/${r._id}`} className="font-medium no-underline hover:underline">{r.name}</Link>
                        <div className="text-micro text-ink-400 whitespace-nowrap">{r.routeId}, {r.batchId}</div>
                        {r.violations?.length > 0 && <div className="text-micro text-signal-amber">{r.violations.length} window{r.violations.length > 1 ? 's' : ''} at risk</div>}
                        {r.needsRecalculation && <div className="text-micro text-signal-amber">Traffic changed, recalculate</div>}
                      </td>
                      <td><StatusBadge status={r.status} /></td>
                      <td className="nd-tabular">{done}/{r.stops.length}</td>
                      <td className="nd-tabular whitespace-nowrap">{formatKm(r.totalDistance)}<div className="text-micro text-ink-400">{formatDuration(r.estimatedTime)}</div></td>
                      <td className="nd-tabular whitespace-nowrap">{formatINR(r.fuelCost)}</td>
                      <td className="text-small whitespace-nowrap">{formatDateTime(r.plannedStart)}</td>
                      <td>
                        {editable ? (
                          <select className="form-input form-select form-input-sm" aria-label={`Driver for ${r.name}`} value={r.driver?._id || ''} disabled={busy === r._id}
                            onChange={e => patchRoute(r, { driver: e.target.value || null }, e.target.value ? 'Driver assigned' : 'Driver unassigned')}>
                            <option value="">Unassigned</option>
                            {drivers.map(d => <option key={d._id} value={d._id}>{d.name}{d.onRoute ? ' (on route)' : ''}</option>)}
                          </select>
                        ) : (<span className="whitespace-nowrap">{r.driver?.name || <span className="text-ink-400">—</span>}</span>)}
                        {r.vehicle && <div className="text-micro text-ink-400 whitespace-nowrap">{r.vehicle.name}</div>}
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <Link to={`/routes/${r._id}`} className="btn btn-ghost btn-sm">Open</Link>
                        {editable && <button type="button" className="btn btn-ghost btn-sm" disabled={busy === r._id} onClick={() => patchRoute(r, { status: 'cancelled' }, 'Route cancelled')}>Cancel route</button>}
                        {r.status !== 'active' && <button type="button" className="btn btn-ghost btn-sm btn-icon hover:text-signal-coral" disabled={busy === r._id} onClick={() => remove(r)} aria-label={`Delete ${r.name}`} title="Delete"><Icon name="trash" /></button>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {dispatching && (
        <DispatchPreviewDialog
          onClose={closeDispatch}
          onApplied={result => {
            setDispatching(false)
            const n = result.assigned.length
            toast.success(n ? `Auto-dispatch assigned ${n} route${n === 1 ? '' : 's'}` : 'No routes were assigned')
            speak(`Auto-dispatch finished. ${n} route${n === 1 ? '' : 's'} assigned.`)
            if (result.skipped.length) toast(`${result.skipped.length} skipped: ${result.skipped[0].reason}`)
            load()
          }}
        />
      )}
    </div>
  )
}
