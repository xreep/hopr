import { useState, useEffect } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'

const ROLES = ['admin', 'fleet_manager', 'driver']

export default function AdminPanel() {
  const { isAdmin } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [formData, setFormData] = useState(initialFormData)
  const [submitting, setSubmitting] = false

  const initialFormData = {
    name: '',
    email: '',
    password: '',
    role: 'driver',
    phone: '',
    isActive: true
  }

  useEffect(() => {
    if (!isAdmin) return
    fetchUsers()
  }, [isAdmin])

  const fetchUsers = async () => {
    try {
      const response = await api.get('/admin/users')
      setUsers(response.data.users || [])
    } catch (error) {
      toast.error('Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenModal = (user = null) => {
    if (user) {
      setEditingUser(user)
      setFormData({ ...initialFormData, ...user, password: '' })
    } else {
      setEditingUser(null)
      setFormData(initialFormData)
    }
    setShowModal(true)
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setEditingUser(null)
    setFormData(initialFormData)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const data = { ...formData }
      if (!data.password) delete data.password
      
      if (editingUser) {
        await api.put(`/admin/users/${editingUser._id}`, data)
        toast.success('User updated')
      } else {
        await api.post('/admin/users', data)
        toast.success('User created')
      }
      handleCloseModal()
      fetchUsers()
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save user')
    } finally {
      setSubmitting(false)
    }
  }

  const handleInputChange = (e) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? e.target.checked : value
    }))
  }

  const handleDelete = async (user) => {
    if (user._id === 'current') return
    if (!window.confirm(`Delete ${user.name} (${user.email})?`)) return
    try {
      await api.delete(`/admin/users/${user._id}`)
      toast.success('User deleted')
      fetchUsers()
    } catch (error) {
      toast.error('Failed to delete user')
    }
  }

  const handleToggleStatus = async (user) => {
    try {
      await api.patch(`/admin/users/${user._id}/status`, { isActive: !user.isActive })
      toast.success(`User ${!user.isActive ? 'activated' : 'deactivated'}`)
      fetchUsers()
    } catch (error) {
      toast.error('Failed to update status')
    }
  }

  const stats = {
    total: users.length,
    admins: users.filter(u => u.role === 'admin').length,
    managers: users.filter(u => u.role === 'fleet_manager').length,
    drivers: users.filter(u => u.role === 'driver').length,
    active: users.filter(u => u.isActive).length
  }

  return (
    <div>
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Admin Panel</h1>
          <p className="page-subtitle">Manage users, roles, and system settings</p>
        </div>
        <button className="btn btn-primary" onClick={() => handleOpenModal()}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          Add User
        </button>
      </div>

      <div className="grid grid-5 gap-4 mb-6">
        <div className="card stats-card">
          <p className="stats-label">Total Users</p>
          <p className="stats-value">{stats.total}</p>
        </div>
        <div className="card stats-card">
          <p className="stats-label">Admins</p>
          <p className="stats-value text-primary">{stats.admins}</p>
        </div>
        <div className="card stats-card">
          <p className="stats-label">Fleet Managers</p>
          <p className="stats-value text-secondary">{stats.managers}</p>
        </div>
        <div className="card stats-card">
          <p className="stats-label">Drivers</p>
          <p className="stats-value text-success">{stats.drivers}</p>
        </div>
        <div className="card stats-card">
          <p className="stats-label">Active</p>
          <p className="stats-value text-success">{stats.active}</p>
        </div>
      </div>

      <div className="card">
        <div className="card-body p-0">
          {loading ? (
            <div className="page-loader py-12"><div className="spinner" /></div>
          ) : users.length === 0 ? (
            <div className="text-center py-12 text-secondary">
              <p>No users found</p>
              <button className="btn btn-primary mt-3" onClick={() => handleOpenModal()}>Add your first user</button>
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Phone</th>
                    <th>Status</th>
                    <th>Last Login</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user._id}>
                      <td className="font-medium">{user.name}</td>
                      <td>{user.email}</td>
                      <td>
                        <span className={`badge ${getRoleBadge(user.role)}`}>
                          {user.role.replace('_', ' ')}
                        </span>
                      </td>
                      <td>{user.phone || '-'}</td>
                      <td>
                        <span className={`badge ${user.isActive ? 'badge-success' : 'badge-error'}`}>
                          {user.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="text-muted text-sm">
                        {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleOpenModal(user)}
                            aria-label={`Edit ${user.name}`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            className={`btn btn-ghost btn-sm ${user.isActive ? 'text-warning' : 'text-success'}`}
                            onClick={() => handleToggleStatus(user)}
                            aria-label={`${user.isActive ? 'Deactivate' : 'Activate'} ${user.name}`}
                          >
                            {user.isActive ? (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                          {user._id !== 'current' && (
                            <button
                              className="btn btn-ghost btn-sm text-error"
                              onClick={() => handleDelete(user)}
                              aria-label={`Delete ${user.name}`}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
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

      <div className="card mt-6">
        <div className="card-header">
          <h3 className="font-semibold">System Settings</h3>
        </div>
        <div className="card-body space-y-6">
          <div className="grid grid-2 gap-6">
            <div>
              <h4 className="font-medium mb-3">Map Configuration</h4>
              <div className="space-y-3">
                <div className="form-group">
                  <label htmlFor="mapboxToken" className="form-label">Mapbox Access Token</label>
                  <input
                    type="password"
                    id="mapboxToken"
                    className="form-input"
                    placeholder="pk.xxxxxxxxxxxxxxxx"
                    defaultValue={import.meta.env.VITE_MAPBOX_TOKEN || ''}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="googleMapsKey" className="form-label">Google Maps API Key</label>
                  <input
                    type="password"
                    id="googleMapsKey"
                    className="form-input"
                    placeholder="AIzaSyxxxxxxxxxxxx"
                  />
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-3">Default Settings</h4>
              <div className="space-y-3">
                <div className="form-group">
                  <label htmlFor="defaultFuelPrice" className="form-label">Default Fuel Price ($/L)</label>
                  <input
                    type="number"
                    id="defaultFuelPrice"
                    className="form-input"
                    step="0.01"
                    min="0"
                    defaultValue="1.50"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="optimizationTimeout" className="form-label">Route Optimization Timeout (seconds)</label>
                  <input
                    type="number"
                    id="optimizationTimeout"
                    className="form-input"
                    min="5"
                    max="60"
                    defaultValue="10"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t flex justify-end">
            <button className="btn btn-primary">Save Settings</button>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={handleCloseModal} role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="card-header flex-between">
              <h3 id="modal-title" className="font-semibold">{editingUser ? 'Edit User' : 'Add User'}</h3>
              <button className="btn btn-ghost" onClick={handleCloseModal} aria-label="Close modal">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div className="grid grid-2 gap-4">
                <div className="form-group">
                  <label htmlFor="name" className="form-label">Full Name</label>
                  <input type="text" id="name" name="name" className="form-input" value={formData.name} onChange={handleInputChange} required />
                </div>
                <div className="form-group">
                  <label htmlFor="email" className="form-label">Email</label>
                  <input type="email" id="email" name="email" className="form-input" value={formData.email} onChange={handleInputChange} required />
                </div>
                <div className="form-group">
                  <label htmlFor="role" className="form-label">Role</label>
                  <select id="role" name="role" className="form-input form-select" value={formData.role} onChange={handleInputChange} required>
                    {ROLES.map(r => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="phone" className="form-label">Phone</label>
                  <input type="tel" id="phone" name="phone" className="form-input" value={formData.phone} onChange={handleInputChange} placeholder="+1 (555) 000-0000" />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="password" className="form-label">
                  Password {editingUser ? '(leave blank to keep current)' : ''}
                </label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  className="form-input"
                  value={formData.password}
                  onChange={handleInputChange}
                  required={!editingUser}
                  minLength={6}
                  placeholder={editingUser ? '••••••••' : 'Enter password'}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  name="isActive"
                  className="w-4 h-4 text-primary rounded border-border focus:ring-primary"
                  checked={formData.isActive}
                  onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                />
                <label htmlFor="isActive" className="text-sm">Active</label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <button type="button" className="btn btn-outline" onClick={handleCloseModal}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? <span className="flex items-center gap-2"><span className="spinner" />Saving...</span> : (editingUser ? 'Update' : 'Create User')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function getRoleBadge(role) {
  switch (role) {
    case 'admin': return 'badge-error'
    case 'fleet_manager': return 'badge-primary'
    case 'driver': return 'badge-success'
    default: return 'badge-info'
  }
}