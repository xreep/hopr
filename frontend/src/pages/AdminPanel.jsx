import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import api, { errorMessage } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { Modal, StatusBadge, EmptyState, PageLoader, StatCard } from '../components/ui'
import { formatDate } from '../utils/time'
import { MAPBOX_TOKEN } from '../config'
import DemoSeedButton from '../components/DemoSeedButton'

const ROLES = ['admin', 'fleet_manager', 'driver']
const roleLabel = r => r.replace('_', ' ')
const initialFormData = { name: '', email: '', password: '', role: 'driver', phone: '', isActive: true }

export default function AdminPanel() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState(null)
  const [config, setConfig] = useState(null)
  const [editing, setEditing] = useState(null) // null | 'new' | user
  const [formData, setFormData] = useState(initialFormData)
  const [submitting, setSubmitting] = useState(false)
  const [roleFilter, setRoleFilter] = useState('')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await api.get('/admin/users', { params: { limit: 100, ...(roleFilter && { role: roleFilter }), ...(search && { search }) } })
      setUsers(res.data.users)
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load users'))
      setUsers([])
    }
  }, [roleFilter, search])

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, search])

  useEffect(() => {
    api.get('/map/config').then(res => setConfig(res.data)).catch(() => {})
  }, [])

  const open = (user = null) => {
    setEditing(user || 'new')
    setFormData(user ? { ...initialFormData, name: user.name, email: user.email, role: user.role, phone: user.phone || '', isActive: user.isActive } : initialFormData)
  }
  const close = () => setEditing(null)
  const set = (key, value) => setFormData(prev => ({ ...prev, [key]: value }))

  const submit = async e => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const data = { ...formData }
      if (!data.password) delete data.password
      if (editing === 'new') {
        delete data.isActive
        await api.post('/admin/users', data)
        toast.success('User created')
      } else {
        await api.put(`/admin/users/${editing._id}`, data)
        toast.success(data.password ? 'User updated · their sessions were signed out' : 'User updated')
      }
      close()
      load()
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to save user'))
    } finally {
      setSubmitting(false)
    }
  }

  const toggleStatus = async user => {
    try {
      await api.patch(`/admin/users/${user._id}/status`, { isActive: !user.isActive })
      toast.success(`${user.name} ${user.isActive ? 'deactivated' : 'activated'}`)
      load()
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to update status'))
    }
  }

  const remove = async user => {
    if (!window.confirm(`Delete ${user.name} (${user.email})? This cannot be undone.`)) return
    try {
      await api.delete(`/admin/users/${user._id}`)
      toast.success('User deleted')
      load()
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to delete user'))
    }
  }

  const list = users || []
  const isSelf = u => u._id === me?._id
  const editingSelf = editing && editing !== 'new' && isSelf(editing)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Admin Panel</h1>
          <p className="page-subtitle">Users, roles and system configuration</p>
        </div>
        <button className="btn btn-primary" onClick={() => open()}>+ Add user</button>
      </div>

      <div className="grid grid-4 mb-6">
        <StatCard label="Users" value={list.length} />
        <StatCard label="Admins" value={list.filter(u => u.role === 'admin').length} />
        <StatCard label="Fleet managers" value={list.filter(u => u.role === 'fleet_manager').length} />
        <StatCard label="Drivers" value={list.filter(u => u.role === 'driver').length} hint={`${list.filter(u => u.isActive).length} active accounts in total`} />
      </div>

      <div className="card mb-6">
        <div className="card-body flex-between flex-wrap gap-3">
          <div>
            <p className="font-semibold">Demo data</p>
            <p className="text-sm text-muted">Creates the demo accounts and fleet if missing, and a fresh 5-stop Ranchi route with delivery windows assigned to driver@hopr.com.</p>
          </div>
          <DemoSeedButton className="btn btn-primary" />
        </div>
      </div>

      <div className="card">
        <div className="card-header flex flex-wrap gap-2">
          <select className="form-input form-select w-auto" value={roleFilter} onChange={e => setRoleFilter(e.target.value)} aria-label="Filter by role">
            <option value="">All roles</option>
            {ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </select>
          <input type="search" className="form-input flex-1 min-w-[180px]" placeholder="Search name or email" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search users" />
        </div>
        {!users ? <PageLoader /> : list.length === 0 ? <EmptyState title="No users found" /> : (
          <div className="table-container">
            <table className="table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Phone</th><th>Status</th><th>Last login</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {list.map(u => (
                  <tr key={u._id}>
                    <td className="font-medium">{u.name}{isSelf(u) && <span className="text-xs text-muted"> (you)</span>}</td>
                    <td>{u.email}</td>
                    <td><span className={`badge ${u.role === 'admin' ? 'badge-error' : u.role === 'fleet_manager' ? 'badge-primary' : 'badge-success'} capitalize`}>{roleLabel(u.role)}</span></td>
                    <td>{u.phone || '-'}</td>
                    <td><StatusBadge status={u.isActive ? 'active' : 'inactive'} /></td>
                    <td className="text-sm text-muted">{u.lastLogin ? formatDate(u.lastLogin) : 'Never'}</td>
                    <td className="text-right whitespace-nowrap">
                      <button className="btn btn-ghost btn-sm" onClick={() => open(u)} aria-label={`Edit ${u.name}`}>Edit</button>
                      {!isSelf(u) && (
                        <>
                          <button className={`btn btn-ghost btn-sm ${u.isActive ? 'text-warning' : 'text-success'}`} onClick={() => toggleStatus(u)}>{u.isActive ? 'Deactivate' : 'Activate'}</button>
                          <button className="btn btn-ghost btn-sm text-error" onClick={() => remove(u)} aria-label={`Delete ${u.name}`}>Delete</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card mt-6">
        <div className="card-header"><h3 className="font-semibold">System configuration</h3></div>
        <div className="card-body">
          <dl className="detail-list">
            <dt>Map tiles (browser)</dt><dd>{MAPBOX_TOKEN ? 'Mapbox GL (token configured)' : 'Schematic fallback. Set VITE_MAPBOX_TOKEN on Vercel.'}</dd>
            <dt>Geocoding (server)</dt><dd>{config ? (config.geocoder === 'mapbox' ? 'Mapbox Geocoding API' : 'OpenStreetMap Photon (set MAPBOX_TOKEN on Render for Mapbox)') : '…'}</dd>
            <dt>Default depot</dt><dd>{config?.depot?.address || '…'}</dd>
            <dt>Fuel prices</dt><dd>Ranchi retail defaults, overridable with FUEL_PRICE_* environment variables on the server</dd>
          </dl>
          <p className="text-xs text-muted mt-3">Secrets are managed as environment variables on the hosting platforms and are never shown in the app.</p>
        </div>
      </div>

      {editing && (
        <Modal title={editing === 'new' ? 'Add user' : `Edit ${editing.name}`} onClose={close}>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-2 gap-4">
              <div>
                <label htmlFor="uname" className="form-label">Full name</label>
                <input id="uname" className="form-input" value={formData.name} onChange={e => set('name', e.target.value)} required maxLength={100} />
              </div>
              <div>
                <label htmlFor="uemail" className="form-label">Email</label>
                <input id="uemail" type="email" className="form-input" value={formData.email} onChange={e => set('email', e.target.value)} required />
              </div>
              <div>
                <label htmlFor="urole" className="form-label">Role</label>
                <select id="urole" className="form-input form-select capitalize" value={formData.role} onChange={e => set('role', e.target.value)} disabled={editingSelf}>
                  {ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="uphone" className="form-label">Phone</label>
                <input id="uphone" type="tel" className="form-input" value={formData.phone} onChange={e => set('phone', e.target.value)} placeholder="+91 98xxx xxxxx" maxLength={20} />
              </div>
            </div>
            <div>
              <label htmlFor="upassword" className="form-label">{editing === 'new' ? 'Password' : 'Reset password (leave blank to keep)'}</label>
              <input id="upassword" type="password" className="form-input" value={formData.password} onChange={e => set('password', e.target.value)}
                required={editing === 'new'} minLength={6} maxLength={128} autoComplete="new-password" />
            </div>
            {editing !== 'new' && !editingSelf && (
              <label className="toggle-row">
                <input type="checkbox" checked={formData.isActive} onChange={e => set('isActive', e.target.checked)} /> <span>Account active</span>
              </label>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-outline" onClick={close}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Saving…' : editing === 'new' ? 'Create user' : 'Save changes'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
