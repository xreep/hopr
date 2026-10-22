import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import api, { errorMessage } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { Modal, StatusBadge, EmptyState, SkeletonRows, StatCard } from '../components/ui'
import { VEHICLE_TYPES, FUEL_UNITS, VEHICLE_ICONS, vehicleTypeLabel } from '../config'
import Icon from '../components/icons'
import { useConfirm } from '../components/ConfirmDialog'
import { formatDate } from '../utils/time'
import AddressAutocomplete from '../components/AddressAutocomplete'

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
  nextMaintenance: '',
  base: null,
  baseText: ''
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
    nextMaintenance: toDateInput(v.nextMaintenance),
    base: v.base?.coordinates?.length === 2 ? v.base : null,
    baseText: v.base?.address || ''
  }
}

export default function VehicleManagement() {
  const { isAdmin } = useAuth()
  const [vehicles, setVehicles] = useState(null)
  const confirm = useConfirm()
  const [drivers, setDrivers] = useState([])
  const [hubs, setHubs] = useState([])
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
    api.get('/map/config').then(res => setHubs(res.data.hubs || [])).catch(() => {})
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
    const { baseText, ...fields } = form
    const payload = {
      ...fields,
      mileage: form.mileage === '' ? '' : Number(form.mileage),
      capacity: Number(form.capacity),
      driver: form.driver || null,
      base: form.base && baseText ? { name: form.base.name, address: form.base.address, coordinates: form.base.coordinates } : null
    }
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
    const ok = await confirm({
      title: `Delete ${vehicle.name}?`,
      message: [`${vehicle.licensePlate} will be removed from the fleet${vehicle.driver ? ` and ${vehicle.driver.name} will no longer have a vehicle` : ''}.`, 'Past routes keep their records.'],
      confirmLabel: 'Delete vehicle',
      tone: 'danger'
    })
    if (!ok) return
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
          <p className="page-subtitle">Your fleet, how far each vehicle goes on a litre or kWh, and who drives it.</p>
        </div>
        <button className="btn btn-primary" onClick={() => open()}><Icon name="plus" />Add vehicle</button>
      </div>

      <div className="stats-strip mb-6">
        <StatCard label="Vehicles" value={stats.total} />
        <StatCard label="In service" value={stats.active} isKey />
        <StatCard label="In maintenance" value={stats.maintenance} />
        <StatCard label="Electric" value={stats.electric} hint="Charged at the Kokar hub" />
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
          <input type="search" className="form-input w-auto flex-1 min-w-[180px]" placeholder="Search by name, ID or plate" value={filters.search}
            onChange={e => setFilters({ ...filters, search: e.target.value })} aria-label="Search vehicles" />
        </div>

        {!vehicles ? <SkeletonRows label="Loading vehicles" /> : list.length === 0 ? (
          <EmptyState title="No vehicles found" action={<button className="btn btn-primary btn-sm" onClick={() => open()}>Add your first vehicle</button>} />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr><th>Vehicle</th><th>Type</th><th>Fuel and efficiency</th><th>Capacity</th><th>Plate</th><th>Status</th><th>Driver</th><th>Next service</th><th className="text-right"><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {list.map(v => (
                  <tr key={v._id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="icon-tile"><Icon name={VEHICLE_ICONS[v.type]} /></span>
                        <div><span className="font-medium">{v.name}</span><div className="text-micro text-ink-400">{v.vehicleId}{v.base?.name ? `, ${v.base.name}` : ''}</div></div>
                      </div>
                    </td>
                    <td>{vehicleTypeLabel(v.type)}</td>
                    <td><span className="capitalize">{v.fuelType}</span><div className="text-micro text-ink-400">{v.mileage} {FUEL_UNITS[v.fuelType]}</div></td>
                    <td>{v.capacity} kg</td>
                    <td className="nd-tabular tracking-wide">{v.licensePlate}</td>
                    <td><StatusBadge status={v.status === 'active' ? 'in_service' : v.status} /></td>
                    <td>{v.driver?.name || <span className="text-ink-400">No driver</span>}</td>
                    <td className="text-sm">{v.nextMaintenance ? formatDate(v.nextMaintenance) : '-'}</td>
                    <td className="text-right whitespace-nowrap">
                      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => open(v)} aria-label={`Edit ${v.name}`} title="Edit"><Icon name="edit" /></button>
                      {isAdmin && <button className="btn btn-ghost btn-sm btn-icon hover:text-signal-coral" onClick={() => remove(v)} aria-label={`Delete ${v.name}`} title="Delete"><Icon name="trash" /></button>}
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
              <Input label="License plate" id="plate" value={form.licensePlate} onChange={v => set('licensePlate', v)} required placeholder="e.g. MH02 AB 1234" maxLength={20} />
              <div>
                <label htmlFor="vstatus" className="form-label">Status</label>
                <select id="vstatus" className="form-input form-select" value={form.status} onChange={e => set('status', e.target.value)}>
                  {VEHICLE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="vdriver" className="form-label">Assigned driver</label>
                <select id="vdriver" className="form-input form-select" value={form.driver} onChange={e => set('driver', e.target.value)}>
                  <option value="">Unassigned</option>
                  {drivers.map(d => <option key={d._id} value={d._id}>{d.name}{d.vehicle && d.vehicle._id !== editing?._id ? ` (moves from ${d.vehicle.name})` : ''}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="vbase" className="form-label">Home hub</label>
              <AddressAutocomplete id="vbase" value={form.baseText} coordinates={form.base?.coordinates} placeholder="Where the vehicle starts its day"
                onChange={text => setForm(prev => ({ ...prev, baseText: text, base: null }))}
                onSelect={({ address, coordinates }) => setForm(prev => ({ ...prev, baseText: address, base: { name: address.split(',')[0], address, coordinates } }))} />
              {hubs.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2" role="group" aria-label="Existing hubs">
                  {hubs.map(h => (
                    <button key={h.coordinates.join()} type="button" title={h.address} aria-label={`${h.name || h.address.split(',')[0]}, ${h.address}`}
                      className={`btn btn-sm ${form.base?.coordinates?.join() === h.coordinates.join() ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setForm(prev => ({ ...prev, baseText: h.address, base: { name: h.name, address: h.address, coordinates: h.coordinates } }))}>
                      {h.name || h.address.split(',')[0]}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-micro text-ink-400 mt-1">Auto-dispatch only offers this vehicle&apos;s driver routes in the same city.</p>
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
