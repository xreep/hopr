import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import api, { errorMessage } from '../utils/api'
import { StatusBadge, EmptyState, SkeletonRows, StatCard } from '../components/ui'
import { formatKm, initials } from '../utils/format'
import { relativeTime } from '../utils/time'
import Icon from '../components/icons'

export default function Drivers() {
  const [drivers, setDrivers] = useState(null)
  const [vehicles, setVehicles] = useState([])
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(null)

  const load = useCallback(async () => {
    try {
      const [d, v] = await Promise.all([
        api.get('/drivers', { params: { limit: 100, ...(search && { search }) } }),
        api.get('/vehicles', { params: { status: 'active', limit: 100 } })
      ])
      setDrivers(d.data.drivers)
      setVehicles(v.data.vehicles)
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load drivers'))
      setDrivers([])
    }
  }, [search])

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, search])

  const assignVehicle = async (driver, vehicleId) => {
    setBusy(driver._id)
    try {
      if (vehicleId) {
        await api.patch(`/vehicles/${vehicleId}/assign-driver`, { driverId: driver._id })
        toast.success(`${driver.name} assigned`)
      } else if (driver.vehicle) {
        await api.patch(`/vehicles/${driver.vehicle._id}/assign-driver`, { driverId: null })
        toast.success('Vehicle unassigned')
      }
      load()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const toggleActive = async driver => {
    setBusy(driver._id)
    try {
      await api.patch(`/drivers/${driver._id}/status`, { isActive: !driver.isActive })
      toast.success(`${driver.name} ${driver.isActive ? 'deactivated' : 'activated'}`)
      load()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const list = drivers || []
  const onRoute = list.filter(d => d.activeRoute).length
  const delivered = list.reduce((s, d) => s + d.totalDeliveries, 0)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Drivers</h1>
          <p className="page-subtitle">Who&apos;s driving what, and how each driver is doing on real deliveries.</p>
        </div>
      </div>

      <div className="stats-strip mb-6">
        <StatCard label="Drivers" value={list.length} />
        <StatCard label="On a route now" value={onRoute} isKey />
        <StatCard label="Active accounts" value={list.filter(d => d.isActive).length} />
        <StatCard label="Deliveries completed" value={delivered} />
      </div>

      <div className="card">
        <div className="card-header">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"><Icon name="search" size={16} /></span>
            <input type="search" className="form-input pl-9" placeholder="Search by name or email" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search drivers" />
          </div>
        </div>
        {!drivers ? <SkeletonRows label="Loading drivers" /> : list.length === 0 ? (
          <EmptyState title="No drivers yet">Drivers can register from the login page, or an admin can create them.</EmptyState>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr><th>Driver</th><th>Status</th><th>Vehicle</th><th>Delivered</th><th>On time</th><th>Completed</th><th>Avg time</th><th>Distance</th><th>Last GPS</th><th className="text-right"><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {list.map(d => (
                  <tr key={d._id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="avatar avatar-sm" aria-hidden="true">{initials(d.name)}</span>
                        <div>
                          <p className="font-medium">{d.name}</p>
                          <p className="text-micro text-ink-400 whitespace-nowrap">{d.phone ? <a href={`tel:${d.phone}`} className="no-underline">{d.phone}</a> : d.email}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      {d.activeRoute
                        ? <Link to={`/routes/${d.activeRoute._id}`} className="no-underline"><StatusBadge status="on_route" label={`On ${d.activeRoute.routeId}`} /></Link>
                        : <StatusBadge status={d.isActive ? 'enabled' : 'inactive'} />}
                    </td>
                    <td>
                      <select className="form-input form-select form-input-sm" aria-label={`Vehicle for ${d.name}`} value={d.vehicle?._id || ''} disabled={busy === d._id || !d.isActive}
                        onChange={e => assignVehicle(d, e.target.value)}>
                        <option value="">No vehicle</option>
                        {vehicles.map(v => <option key={v._id} value={v._id}>{v.name} · {v.licensePlate}{v.driver && v.driver._id !== d._id ? ` (${v.driver.name})` : ''}</option>)}
                      </select>
                    </td>
                    <td className="nd-tabular">{d.totalDeliveries}{d.failedDeliveries ? <div className="text-micro text-signal-coral">{d.failedDeliveries} failed</div> : null}</td>
                    <td className="nd-tabular">{d.onTimeRate === null ? '—' : `${d.onTimeRate}%`}</td>
                    <td className="nd-tabular">{d.completionRate === null ? '—' : `${d.completionRate}%`}</td>
                    <td className="nd-tabular">{d.avgDeliveryMinutes === null ? '—' : `${Math.round(d.avgDeliveryMinutes)} min`}</td>
                    <td>{formatKm(d.distanceKm)}</td>
                    <td className="text-micro text-ink-300 whitespace-nowrap">{relativeTime(d.lastLocation?.updatedAt)}</td>
                    <td className="text-right">
                      <button type="button" className="btn btn-ghost btn-sm" disabled={busy === d._id} onClick={() => toggleActive(d)}>
                        {d.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
