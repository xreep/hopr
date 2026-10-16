import { useState, useEffect } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'

const FUEL_TYPES = ['diesel', 'petrol', 'electric', 'cng', 'hybrid']
const VEHICLE_STATUSES = ['active', 'maintenance', 'inactive']

const initialFormData = {
  vehicleId: '',
  name: '',
  type: 'van',
  fuelType: 'diesel',
  mileage: 12,
  capacity: 500,
  licensePlate: '',
  driverId: '',
  status: 'active',
  purchaseDate: '',
  lastMaintenance: '',
  nextMaintenance: ''
}

export default function VehicleManagement() {
  const [vehicles, setVehicles] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingVehicle, setEditingVehicle] = useState(null)
  const [formData, setFormData] = useState(initialFormData)
  const [submitting, setSubmitting] = useState(false)
  const [filters, setFilters] = useState({ status: '', fuelType: '', search: '' })

  useEffect(() => {
    fetchVehicles()
  }, [])

  const fetchVehicles = async () => {
    try {
      const params = new URLSearchParams()
      if (filters.status) params.append('status', filters.status)
      if (filters.fuelType) params.append('fuelType', filters.fuelType)
      if (filters.search) params.append('search', filters.search)
      
      const response = await api.get(`/vehicles?${params}`)
      setVehicles(response.data.vehicles || [])
    } catch (error) {
      toast.error('Failed to load vehicles')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenModal = (vehicle = null) => {
    if (vehicle) {
      setEditingVehicle(vehicle)
      setFormData({ ...initialFormData, ...vehicle })
    } else {
      setEditingVehicle(null)
      setFormData({ ...initialFormData, vehicleId: `VEH-${Date.now().toString(36).toUpperCase()}` })
    }
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingVehicle(null)
    setFormData(initialFormData)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      if (editingVehicle) {
        await api.put(`/vehicles/${editingVehicle._id}`, formData)
        toast.success('Vehicle updated')
      } else {
        await api.post('/vehicles', formData)
        toast.success('Vehicle added')
      }
      handleCloseModal()
      fetchVehicles()
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save vehicle')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (vehicle) => {
    if (!window.confirm(`Delete ${vehicle.name} (${vehicle.licensePlate})?`)) return
    try {
      await api.delete(`/vehicles/${vehicle._id}`)
      toast.success('Vehicle deleted')
      fetchVehicles()
    } catch (error) {
      toast.error('Failed to delete vehicle')
    }
  }

  const handleInputChange = (e) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
    }))
  }

  const filteredVehicles = vehicles.filter(v => {
    if (filters.status && v.status !== filters.status) return false
    if (filters.fuelType && v.fuelType !== filters.fuelType) return false
    if (filters.search) {
      const search = filters.search.toLowerCase()
      return v.name.toLowerCase().includes(search) ||
             v.licensePlate.toLowerCase().includes(search) ||
             v.vehicleId.toLowerCase().includes(search)
    }
    return true
  })

  const stats = {
    total: vehicles.length,
    active: vehicles.filter(v => v.status === 'active').length,
    maintenance: vehicles.filter(v => v.status === 'maintenance').length,
    electric: vehicles.filter(v => v.fuelType === 'electric').length
  }

  return (
    <div>
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Vehicle Management</h1>
          <p className="page-subtitle">Manage your fleet vehicles and assignments</p>
        </div>
        <button className="btn btn-primary" onClick={() => handleOpenModal()}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Vehicle
        </button>
      </div>

      <div className="grid grid-4 gap-4 mb-6">
        <div className="card stats-card">
          <p className="stats-label">Total Vehicles</p>
          <p className="stats-value">{stats.total}</p>
        </div>
        <div className="card stats-card">
          <p className="stats-label">Active</p>
          <p className="stats-value text-success">{stats.active}</p>
        </div>
        <div className="card stats-card">
          <p className="stats-label">Maintenance</p>
          <p className="stats-value text-warning">{stats.maintenance}</p>
        </div>
        <div className="card stats-card">
          <p className="stats-label">Electric</p>
          <p className="stats-value text-secondary">{stats.electric}</p>
        </div>
      </div>

      <div className="card">
        <div className="card-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            <select
              className="form-input form-select w-auto"
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              aria-label="Filter by status"
            >
              <option value="">All Status</option>
              {VEHICLE_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
            <select
              className="form-input form-select w-auto"
              value={filters.fuelType}
              onChange={(e) => setFilters({ ...filters, fuelType: e.target.value })}
              aria-label="Filter by fuel type"
            >
              <option value="">All Fuel Types</option>
              {FUEL_TYPES.map(f => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
            </select>
            <input
              type="text"
              className="form-input w-auto min-w-[200px]"
              placeholder="Search vehicles..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              aria-label="Search vehicles"
            />
          </div>
        </div>

        <div className="card-body p-0">
          {loading ? (
            <div className="page-loader py-12"><div className="spinner" /></div>
          ) : filteredVehicles.length === 0 ? (
            <div className="text-center py-12 text-secondary">
              <svg className="w-12 h-12 mx-auto mb-3 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16l2.879-2.879m0 0a3 3 0 104.243-4.242 3 3 0 00-4.243 4.242zm0 0L19.5 7.5M13.381 16H8" />
              </svg>
              <p>No vehicles found</p>
              <button className="btn btn-primary mt-3" onClick={() => handleOpenModal()}>Add your first vehicle</button>
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Vehicle ID</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Fuel</th>
                    <th>Mileage</th>
                    <th>Capacity</th>
                    <th>Plate</th>
                    <th>Status</th>
                    <th>Driver</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVehicles.map(vehicle => (
                    <tr key={vehicle._id}>
                      <td className="font-mono text-sm">{vehicle.vehicleId}</td>
                      <td className="font-medium">{vehicle.name}</td>
                      <td>{vehicle.type}</td>
                      <td>
                        <span className="badge badge-info">{vehicle.fuelType}</span>
                      </td>
                      <td>{vehicle.fuelType === 'electric' ? 'Electric' : `${vehicle.mileage} km/L`}</td>
                      <td>{vehicle.capacity} kg</td>
                      <td className="font-mono">{vehicle.licensePlate}</td>
                      <td>
                        <span className={`badge ${getStatusBadge(vehicle.status)}`}>
                          {vehicle.status}
                        </span>
                      </td>
                      <td>{vehicle.driver?.name || <span className="text-muted">Unassigned</span>}</td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleOpenModal(vehicle)}
                            aria-label={`Edit ${vehicle.name}`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            className="btn btn-ghost btn-sm text-error"
                            onClick={() => handleDelete(vehicle)}
                            aria-label={`Delete ${vehicle.name}`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={handleCloseModal} role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="card-header flex-between">
              <h3 id="modal-title" className="font-semibold">{editingVehicle ? 'Edit Vehicle' : 'Add Vehicle'}</h3>
              <button className="btn btn-ghost" onClick={handleCloseModal} aria-label="Close modal">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-2 gap-4">
                <div className="form-group">
                  <label htmlFor="vehicleId" className="form-label">Vehicle ID</label>
                  <input type="text" id="vehicleId" name="vehicleId" className="form-input" value={formData.vehicleId} onChange={handleInputChange} required readOnly />
                </div>
                <div className="form-group">
                  <label htmlFor="name" className="form-label">Name</label>
                  <input type="text" id="name" name="name" className="form-input" value={formData.name} onChange={handleInputChange} required placeholder="e.g., Delivery Van #1" />
                </div>
                <div className="form-group">
                  <label htmlFor="type" className="form-label">Type</label>
                  <select id="type" name="type" className="form-input form-select" value={formData.type} onChange={handleInputChange} required>
                    <option value="van">Van</option>
                    <option value="truck">Truck</option>
                    <option value="bike">Bicycle</option>
                    <option value="ev_van">Electric Van</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="fuelType" className="form-label">Fuel Type</label>
                  <select id="fuelType" name="fuelType" className="form-input form-select" value={formData.fuelType} onChange={handleInputChange} required>
                    {FUEL_TYPES.map(f => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="mileage" className="form-label">Mileage (km/L)</label>
                  <input type="number" id="mileage" name="mileage" className="form-input" value={formData.mileage} onChange={handleInputChange} min="0" step="0.1" disabled={formData.fuelType === 'electric'} />
                </div>
                <div className="form-group">
                  <label htmlFor="capacity" className="form-label">Capacity (kg)</label>
                  <input type="number" id="capacity" name="capacity" className="form-input" value={formData.capacity} onChange={handleInputChange} min="0" required />
                </div>
                <div className="form-group">
                  <label htmlFor="licensePlate" className="form-label">License Plate</label>
                  <input type="text" id="licensePlate" name="licensePlate" className="form-input" value={formData.licensePlate} onChange={handleInputChange} required placeholder="ABC-1234" />
                </div>
                <div className="form-group">
                  <label htmlFor="status" className="form-label">Status</label>
                  <select id="status" name="status" className="form-input form-select" value={formData.status} onChange={handleInputChange} required>
                    {VEHICLE_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="driverId" className="form-label">Assigned Driver</label>
                  <select id="driverId" name="driverId" className="form-input form-select" value={formData.driverId} onChange={handleInputChange}>
                    <option value="">Unassigned</option>
                  </select>
                </div>
              </div>

              <div className="divider" />

              <div className="grid grid-3 gap-4">
                <div className="form-group">
                  <label htmlFor="purchaseDate" className="form-label">Purchase Date</label>
                  <input type="date" id="purchaseDate" name="purchaseDate" className="form-input" value={formData.purchaseDate} onChange={handleInputChange} />
                </div>
                <div className="form-group">
                  <label htmlFor="lastMaintenance" className="form-label">Last Maintenance</label>
                  <input type="date" id="lastMaintenance" name="lastMaintenance" className="form-input" value={formData.lastMaintenance} onChange={handleInputChange} />
                </div>
                <div className="form-group">
                  <label htmlFor="nextMaintenance" className="form-label">Next Maintenance Due</label>
                  <input type="date" id="nextMaintenance" name="nextMaintenance" className="form-input" value={formData.nextMaintenance} onChange={handleInputChange} />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <button type="button" className="btn btn-outline" onClick={handleCloseModal}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? <span className="flex items-center gap-2"><span className="spinner" />Saving...</span> : (editingVehicle ? 'Update' : 'Add Vehicle')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function getStatusBadge(status) {
  switch (status) {
    case 'active': return 'badge-success'
    case 'maintenance': return 'badge-warning'
    case 'inactive': return 'badge-error'
    default: return 'badge-info'
  }
}