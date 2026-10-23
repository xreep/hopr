import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import api, { errorMessage } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { Modal, StatusBadge, EmptyState, SkeletonRows, StatCard, TableRegion } from '../components/ui'
import { formatDate } from '../utils/time'
import DemoSeedButton from '../components/DemoSeedButton'
import WebsiteInbox from '../components/WebsiteInbox'
import useDemoMode from '../hooks/useDemoMode'
import { MAP_PROVIDER } from '../config'
import Icon from '../components/icons'
import { useConfirm } from '../components/ConfirmDialog'

const ROLES = ['admin', 'fleet_manager', 'driver']
const roleLabel = r => r.replace('_', ' ')
const initialFormData = { name: '', email: '', password: '', role: 'driver', phone: '', isActive: true }

export default function AdminPanel() {
  const { user: me } = useAuth()
  const demo = useDemoMode()
  const [users, setUsers] = useState(null)
  const [config, setConfig] = useState(null)
  const [editing, setEditing] = useState(null) // null | 'new' | user
  const [formData, setFormData] = useState(initialFormData)
  const [submitting, setSubmitting] = useState(false)
  const [roleFilter, setRoleFilter] = useState('')
  const [search, setSearch] = useState('')
  const confirm = useConfirm()

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
    const ok = await confirm({
      title: `Delete ${user.name}?`,
      message: [`${user.email} will no longer be able to sign in.`, 'This cannot be undone. To keep their history, deactivate the account instead.'],
      confirmLabel: 'Delete user',
      tone: 'danger'
    })
    if (!ok) return
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
          <h1 className="page-title">Admin</h1>
          <p className="page-subtitle">People who can sign in, what they can do, and how Hopr is configured.</p>
        </div>
        <button className="btn btn-primary" onClick={() => open()}><Icon name="plus" />Add user</button>
      </div>

      <div className="stats-strip mb-6">
        <StatCard label="Users" value={list.length} />
        <StatCard label="Admins" value={list.filter(u => u.role === 'admin').length} />
        <StatCard label="Fleet managers" value={list.filter(u => u.role === 'fleet_manager').length} />
        <StatCard label="Drivers" value={list.filter(u => u.role === 'driver').length} hint={`${list.filter(u => u.isActive).length} active accounts in total`} />
      </div>

      {demo && <div className="card mb-6">
        <div className="card-body flex-between flex-wrap gap-3">
          <div>
            <p className="text-h3 font-bold">Demo data</p>
            <p className="text-small text-ink-400 mt-1 max-w-[60ch]">Adds the demo accounts and a fleet in Delhi, Mumbai, Bengaluru, Kolkata and Ranchi if they&apos;re missing, plus a fresh five-stop route with delivery windows in each city. The Ranchi route is assigned to driver@hopr.com; the others wait for auto-dispatch.</p>
          </div>
          <DemoSeedButton className="btn btn-secondary" />
        </div>
      </div>}

      <div className="card">
        <div className="card-header flex flex-wrap gap-2">
          <select className="form-input form-select w-auto" value={roleFilter} onChange={e => setRoleFilter(e.target.value)} aria-label="Filter by role">
            <option value="">All roles</option>
            {ROLES.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </select>
          <input type="search" className="form-input flex-1 min-w-[180px]" placeholder="Search name or email" value={search} onChange={e => setSearch(e.target.value)} aria-label="Search users" />
        </div>
        {!users ? <SkeletonRows label="Loading users" /> : list.length === 0 ? <EmptyState title="No users found" /> : (
          <TableRegion label="Users">
            <table className="table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Phone</th><th>Status</th><th>Last login</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {list.map(u => (
                  <tr key={u._id}>
                    <td className="font-medium">{u.name}{isSelf(u) && <span className="text-xs text-muted"> (you)</span>}</td>
                    <td>{u.email}</td>
                    <td><span className="badge badge-neutral badge-plain capitalize">{roleLabel(u.role)}</span></td>
                    <td className="whitespace-nowrap nd-tabular">{u.phone || '—'}</td>
                    <td><StatusBadge status={u.isActive ? 'enabled' : 'inactive'} /></td>
                    <td className="text-small text-ink-300 whitespace-nowrap">{u.lastLogin ? formatDate(u.lastLogin) : 'Never'}</td>
                    <td className="text-right whitespace-nowrap">
                      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => open(u)} aria-label={`Edit ${u.name}`} title="Edit"><Icon name="edit" /></button>
                      {!isSelf(u) && (
                        <>
                          <button className="btn btn-ghost btn-sm" onClick={() => toggleStatus(u)}>{u.isActive ? 'Deactivate' : 'Activate'}</button>
                          <button className="btn btn-ghost btn-sm btn-icon hover:text-signal-coral" onClick={() => remove(u)} aria-label={`Delete ${u.name}`} title="Delete"><Icon name="trash" /></button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableRegion>
        )}
      </div>

      <WebsiteInbox />

      <div className="card mt-6">
        <div className="card-header"><h3>System configuration</h3></div>
        <div className="card-body">
          <dl className="detail-list">
            <dt>Street maps</dt><dd>{MAP_PROVIDER === 'mapbox' ? 'Mapbox (light style)' : 'OpenFreeMap (OpenStreetMap data), no key needed. Set VITE_MAPBOX_TOKEN on Vercel for Mapbox'}</dd>
            <dt>Geocoding (server)</dt><dd>{config ? (config.geocoder === 'mapbox' ? 'Mapbox Geocoding API' : 'OpenStreetMap Photon (set MAPBOX_TOKEN on Render for Mapbox)') : '…'}</dd>
            <dt>Road routing (server)</dt><dd>{config ? (config.geocoder === 'mapbox' ? 'Mapbox Directions, live traffic (driving-traffic)' : 'OpenStreetMap OSRM (set MAPBOX_TOKEN on Render for Mapbox live traffic)') : '…'}</dd>
            <dt>Email notifications</dt><dd>{config ? (config.email ? 'On (Resend)' : 'Off. Set RESEND_API_KEY and EMAIL_FROM on Render to send them') : '…'}</dd>
            <dt>Hubs</dt><dd>{config ? (config.hubs?.length ? config.hubs.map(h => h.name || h.address).join(', ') : 'None yet. Set a home hub on each vehicle.') : '…'}</dd>
            <dt>Fuel prices</dt><dd>Indian retail defaults; set FUEL_PRICE_* on the server for your state</dd>
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
