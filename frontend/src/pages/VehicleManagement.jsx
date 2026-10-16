import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import api, { errorMessage } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { Modal, StatusBadge, EmptyState, PageLoader, StatCard } from '../components/ui'
import { VEHICLE_TYPES, FUEL_UNITS, vehicleTypeLabel } from '../config'
import { formatDate } from '../utils/time'

const FUEL_TYPES = ['diesel', 'petrol', 'cng', 'electric', 'hybrid']
const VEHICLE_STATUSES = ['active', 'maintenance', 'inactive']

const emptyForm = () => ({
  vehicleId: `VEH-${Date.now().toString(36).toUpperCase().slice(-5)}`,
  name: '',
  type: 'van',
  fuelType: 'diesel',
  mileage: 16,
  capacity: 750,
  licensePlate: '',
  driver: '',
  status: 'active',
  purchaseDate: '',
  lastMaintenance: '',
  nextMaintenance: ''
})

const toDateInput = d => (d ? new Date(d).toISOString().slice(0, 10) : '')

function formFromVehicle(v) {
  return {
    vehicleId: v.vehicleId,
    name: v.name,
    type: v.type,
    fuelType: v.fuelType,
    mileage: v.mileage,
    capacity: v.capacity,
    licensePlate: v.licensePlate,
    driver: v.driver?._id || '',
    status: v.status,
    purchaseDate: toDateInput(v.purchaseDate),
    lastMaintenance: toDateInput(v.lastMaintenance),
    nextMaintenance: toDateInput(v.nextMaintenance)
  }
}

export default function VehicleManagement() {
  const { isAdmin } = useAuth()
  const [vehicles, setVehicles] = useState(null)
  const [drivers, setDrivers] = useState([])
  const [editing, setEditing] = useState(null) // null | 'new' | vehicle
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [filters, setFilters] = useState({ status: '', fuelType: '', search: '' })

  const load = useCallback(async () => {
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v))
      const res = await api.get('/vehicles', { params: { ...params, limit: 100 } })
      setVehicles(res.data.vehicles)
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load vehicles'))
      setVehicles([])
    }
  }, [filters])

  useEffect(() => {
    const t = setTimeout(load, filters.search ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, filters.search])

  useEffect(() => {
    api.get('/drivers/available').then(res => setDrivers(res.data.drivers)).catch(() => {})
  }, [])

  const open = (vehicle = null) => {
    setEditing(vehicle || 'new')
    setForm(vehicle ? formFromVehicle(vehicle) : emptyForm())
  }
  const close = () => setEditing(null)

  const set = (key, value) => setForm(prev => {
    const next = { ...prev, [key]: value }
    // Choosing a type pre-fills realistic defaults for that vehicle class
    if (key === 'type') {
      const profile = VEHICLE_TYPES.find(v => v.id === value)
      if (profile) Object.assign(next, { fuelType: profile.fuelType, mileage: profile.mileage, capacity: profile.capacity })
    }
    return next
  })

  const submit = async e => {
    e.preventDefault()
    setSubmitting(true)
    const payload = { ...form, mileage: form.mileage === '' ? '' : Number(form.mileage), capacity: Number(form.capacity), driver: form.driver || null }
    try {
      if (editing === 'new') {
        await api.post('/vehicles', payload)
        toast.success('Vehicle added')
      } else {
        await api.put(`/vehicles/${editing._id}`, payload)
        toast.success('Vehicle updated')
      }
      close()
      load()
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to save vehicle'))
    } finally {
      setSubmitting(false)
    }
  }

  const remove = async vehicle => {
    if (!window.confirm(`Delete ${vehicle.name} (${vehicle.licensePlate})?`)) return
    try {
      await api.delete(`/vehicles/${vehicle._id}`)
      toast.success('Vehicle deleted')
      load()
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to delete vehicle'))
    }
  }

  const list = vehicles || []
  const stats = {
    total: list.length,
    active: list.filter(v => v.status === 'active').length,
    maintenance: list.filter(v => v.status === 'maintenance').length,
    electric: list.filter(v => v.fuelType === 'electric').length
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Vehicles</h1>
          <p className="page-subtitle">Fleet, fuel efficiency, capacity and driver assignment</p>
        </div>
        <button className="btn btn-primary" onClick={() => open()}>+ Add vehicle</button>
      </div>

      <div className="grid grid-4 mb-6">
        <StatCard label="Vehicles" value={stats.total} />
        <StatCard label="Active" value={stats.active} tone="success" />
        <StatCard label="In maintenance" value={stats.maintenance} tone="warning" />
        <StatCard label="Electric" value={stats.electric} />
      </div>

      <div className="card">
        <div className="card-header flex flex-wrap gap-2">
          <select className="form-input form-select w-auto" value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })} aria-label="Filter by status">
            <option value="">All statuses</option>
            {VEHICLE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="form-input form-select w-auto" value={filters.fuelType} onChange={e => setFilters({ ...filters, fuelType: e.target.value })} aria-label="Filter by fuel type">
            <option value="">All fuel types</option>
            {FUEL_TYPES.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <input type="search" className="form-input w-auto flex-1 min-w-[180px]" placeholder="Search name, ID or plate" value={filters.search}
            onChange={e => setFilters({ ...filters, search: e.target.value })} aria-label="Search vehicles" />
        </div>

        {!vehicles ? <PageLoader /> : list.length === 0 ? (
          <EmptyState title="No vehicles found" action={<button className="btn btn-primary btn-sm" onClick={() => open()}>Add your first vehicle</button>} />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr><th>Vehicle</th><th>Type</th><th>Fuel · efficiency</th><th>Capacity</th><th>Plate</th><th>Status</th><th>Driver</th><th>Next service</th><th className="text-right">Actions</th></tr>
              </thead>
              <tbody>
                {list.map(v => (
                  <tr key={v._id}>
                    <td><span className="font-medium">{v.name}</span><div className="text-xs text-muted font-mono">{v.vehicleId}</div></td>
                    <td>{vehicleTypeLabel(v.type)}</td>
                    <td><span className="capitalize">{v.fuelType}</span> · {v.mileage} {FUEL_UNITS[v.fuelType]}</td>
                    <td>{v.capacity} kg</td>
                    <td className="font-mono">{v.licensePlate}</td>
                    <td><StatusBadge status={v.status} /></td>
                    <td>{v.driver?.name || <span className="text-muted">Unassigned</span>}</td>
                    <td className="text-sm">{v.nextMaintenance ? formatDate(v.nextMaintenance) : '-'}</td>
                    <td className="text-right whitespace-nowrap">
                      <button className="btn btn-ghost btn-sm" onClick={() => open(v)} aria-label={`Edit ${v.name}`}>Edit</button>
                      {isAdmin && <button className="btn btn-ghost btn-sm text-error" onClick={() => remove(v)} aria-label={`Delete ${v.name}`}>Delete</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <Modal title={editing === 'new' ? 'Add vehicle' : `Edit ${editing.name}`} onClose={close} size="lg">
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-2 gap-4">
              <Input label="Vehicle ID" id="vehicleId" value={form.vehicleId} onChange={v => set('vehicleId', v)} required maxLength={30} />
              <Input label="Name / model" id="vname" value={form.name} onChange={v => set('name', v)} required placeholder="e.g. Tata Ace Gold" maxLength={80} />
              <div>
                <label htmlFor="vtype" className="form-label">Type</label>
                <select id="vtype" className="form-input form-select" value={form.type} onChange={e => set('type', e.target.value)}>
                  {VEHICLE_TYPES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="fuelType" className="form-label">Fuel</label>
                <select id="fuelType" className="form-input form-select" value={form.fuelType} onChange={e => set('fuelType', e.target.value)}>
                  {FUEL_TYPES.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <Input label={`Efficiency (${FUEL_UNITS[form.fuelType]})`} id="mileage" type="number" step="0.1" min="0" value={form.mileage} onChange={v => set('mileage', v)} />
              <Input label="Payload capacity (kg)" id="capacity" type="number" min="1" value={form.capacity} onChange={v => set('capacity', v)} required />
              <Input label="License plate" id="plate" value={form.licensePlate} onChange={v => set('licensePlate', v)} required placeholder="JH01 AB 1234" maxLength={20} />
              <div>
                <label htmlFor="vstatus" className="form-label">Status</label>
                <select id="vstatus" className="form-input form-select" value={form.status} onChange={e => set('status', e.target.value)}>
                  {VEHICLE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label htmlFor="vdriver" className="form-label">Assigned driver</label>
                <select id="vdriver" className="form-input form-select" value={form.driver} onChange={e => set('driver', e.target.value)}>
                  <option value="">Unassigned</option>
                  {drivers.map(d => <option key={d._id} value={d._id}>{d.name}{d.vehicle && d.vehicle._id !== editing?._id ? ` (moves from ${d.vehicle.name})` : ''}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-3 gap-4">
              <Input label="Purchased" id="purchaseDate" type="date" value={form.purchaseDate} onChange={v => set('purchaseDate', v)} />
              <Input label="Last service" id="lastMaintenance" type="date" value={form.lastMaintenance} onChange={v => set('lastMaintenance', v)} />
              <Input label="Next service due" id="nextMaintenance" type="date" value={form.nextMaintenance} onChange={v => set('nextMaintenance', v)} />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-outline" onClick={close}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Saving…' : editing === 'new' ? 'Add vehicle' : 'Save changes'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

function Input({ label, id, onChange, ...props }) {
  return (
    <div>
      <label htmlFor={id} className="form-label">{label}</label>
      <input id={id} className="form-input" onChange={e => onChange(e.target.value)} {...props} />
    </div>
  )
}
