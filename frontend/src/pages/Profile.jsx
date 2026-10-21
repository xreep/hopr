import { useState } from 'react'
import toast from 'react-hot-toast'
import api, { errorMessage } from '../utils/api'
import { useAuth } from '../context/AuthContext'
import Icon from '../components/icons'
import { initials } from '../utils/format'
import { formatDate, formatDateTime } from '../utils/time'
import PasswordInput from '../components/PasswordInput'

const ROLE_LABELS = { admin: 'Admin', fleet_manager: 'Fleet manager', driver: 'Driver' }

const CHANNELS = [
  { key: 'push', label: 'In-app notifications', desc: 'Toasts and voice announcements while Hopr is open' },
  { key: 'email', label: 'Email', desc: 'Summaries and alerts sent to your inbox' },
  { key: 'sms', label: 'SMS', desc: 'Text messages for urgent changes' }
]
const TOPICS = [
  { key: 'routeUpdates', label: 'Route changes', desc: 'New assignments, recalculations and delays' },
  { key: 'maintenanceAlerts', label: 'Vehicle maintenance', desc: 'Upcoming service dates for your vehicles' },
  { key: 'weeklyReports', label: 'Weekly report', desc: 'A Monday summary of last week’s deliveries' }
]

export default function Profile() {
  const { user, updateUser, logout } = useAuth()
  const [saving, setSaving] = useState('')
  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    address: user?.address || ''
  })
  const [passwordData, setPasswordData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  // Start from the preferences saved on the account
  const [notifications, setNotifications] = useState({
    email: true, sms: false, push: true, routeUpdates: true, maintenanceAlerts: true, weeklyReports: false,
    ...(user?.notifications || {})
  })

  const saveProfile = async e => {
    e.preventDefault()
    setSaving('profile')
    try {
      const res = await api.put('/auth/profile', profileData)
      updateUser(res.data.user)
      toast.success('Profile saved')
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save your profile'))
    } finally {
      setSaving('')
    }
  }

  const changePassword = async e => {
    e.preventDefault()
    if (passwordData.newPassword !== passwordData.confirmPassword) return toast.error('The new passwords don’t match')
    if (passwordData.newPassword.length < 6) return toast.error('Use at least 6 characters')
    setSaving('password')
    try {
      await api.put('/auth/password', { currentPassword: passwordData.currentPassword, newPassword: passwordData.newPassword })
      toast.success('Password changed. Sign in again with the new one.')
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' })
      // Existing tokens are revoked server-side (tokenVersion), so sign out locally too
      setTimeout(() => { logout() }, 1200)
    } catch (err) {
      toast.error(errorMessage(err, 'Could not change the password'))
    } finally {
      setSaving('')
    }
  }

  const saveNotifications = async () => {
    setSaving('notifications')
    try {
      const res = await api.put('/auth/notifications', notifications)
      updateUser({ notifications: res.data.notifications })
      toast.success('Notification preferences saved')
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save preferences'))
    } finally {
      setSaving('')
    }
  }

  const setP = (key, value) => setProfileData(prev => ({ ...prev, [key]: value }))
  const setPw = (key, value) => setPasswordData(prev => ({ ...prev, [key]: value }))

  return (
    <div className="max-w-[880px]">
      <div className="page-header">
        <div>
          <h1 className="page-title">Profile</h1>
          <p className="page-subtitle">Your details, password and how Hopr keeps you informed.</p>
        </div>
      </div>

      <section className="card p-5 mb-5 flex flex-wrap items-center gap-5" aria-label="Account">
        <span className="avatar !w-16 !h-16 !text-xl" aria-hidden="true">{initials(user?.name)}</span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-h2 font-semibold truncate">{user?.name}</p>
          <p className="text-body text-ink-300">{ROLE_LABELS[user?.role]}, member since {formatDate(user?.createdAt)}</p>
        </div>
        <dl className="text-small">
          <dt className="text-ink-400">Last signed in</dt>
          <dd className="text-ink-50">{user?.lastLogin ? formatDateTime(user.lastLogin) : 'Never'}</dd>
        </dl>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <form className="card" onSubmit={saveProfile} aria-labelledby="details-title">
          <div className="card-header flex items-center gap-2"><Icon name="user" /><h3 id="details-title">Personal details</h3></div>
          <div className="card-body">
            <div className="form-group">
              <label htmlFor="name" className="form-label">Full name</label>
              <input id="name" className="form-input" value={profileData.name} onChange={e => setP('name', e.target.value)} required maxLength={100} autoComplete="name" />
            </div>
            <div className="form-group">
              <label htmlFor="email" className="form-label">Email</label>
              <input id="email" type="email" className="form-input" value={profileData.email} onChange={e => setP('email', e.target.value)} required autoComplete="email" />
            </div>
            <div className="form-group">
              <label htmlFor="phone" className="form-label">Phone</label>
              <input id="phone" type="tel" className="form-input" value={profileData.phone} onChange={e => setP('phone', e.target.value)} placeholder="+91 98xxx xxxxx" maxLength={20} autoComplete="tel" />
            </div>
            <div className="form-group">
              <label htmlFor="address" className="form-label">Home or base address</label>
              <input id="address" className="form-input" value={profileData.address} onChange={e => setP('address', e.target.value)} placeholder="Where you start your day" maxLength={300} autoComplete="street-address" />
            </div>
            <button type="submit" className="btn btn-primary" disabled={saving === 'profile'}>
              {saving === 'profile' ? <><span className="spinner spinner-sm" /> Saving</> : 'Save details'}
            </button>
          </div>
        </form>

        <form className="card" onSubmit={changePassword} aria-labelledby="password-title">
          <div className="card-header flex items-center gap-2"><Icon name="lock" /><h3 id="password-title">Password</h3></div>
          <div className="card-body">
            <div className="form-group">
              <label htmlFor="currentPassword" className="form-label">Current password</label>
              <PasswordInput id="currentPassword" value={passwordData.currentPassword} onChange={e => setPw('currentPassword', e.target.value)} required autoComplete="current-password" />
            </div>
            <div className="form-group">
              <label htmlFor="newPassword" className="form-label">New password</label>
              <PasswordInput id="newPassword" value={passwordData.newPassword} onChange={e => setPw('newPassword', e.target.value)} required minLength={6} maxLength={128} autoComplete="new-password" />
            </div>
            <div className="form-group">
              <label htmlFor="confirmPassword" className="form-label">Confirm new password</label>
              <PasswordInput id="confirmPassword" value={passwordData.confirmPassword} onChange={e => setPw('confirmPassword', e.target.value)} required autoComplete="new-password" />
            </div>
            <p className="text-micro text-ink-400 mb-4">Changing it signs you out everywhere, including other devices.</p>
            <button type="submit" className="btn btn-secondary" disabled={saving === 'password'}>
              {saving === 'password' ? <><span className="spinner spinner-sm" /> Changing</> : 'Change password'}
            </button>
          </div>
        </form>
      </div>

      <section className="card mt-5" aria-labelledby="notify-title">
        <div className="card-header flex items-center gap-2"><Icon name="bell" /><h3 id="notify-title">Notifications</h3></div>
        <div className="card-body grid gap-x-10 md:grid-cols-2">
          {[['How to reach you', CHANNELS], ['What to tell you about', TOPICS]].map(([heading, items]) => (
            <div key={heading}>
              <p className="text-small font-medium text-ink-300 mb-1">{heading}</p>
              {items.map(item => (
                <div key={item.key} className="setting-row">
                  <label htmlFor={`n-${item.key}`} className="min-w-0 cursor-pointer">
                    <span className="block text-body font-medium">{item.label}</span>
                    <span className="block text-micro text-ink-400">{item.desc}</span>
                  </label>
                  <span className="switch">
                    <input id={`n-${item.key}`} type="checkbox" role="switch" checked={Boolean(notifications[item.key])}
                      onChange={e => setNotifications(prev => ({ ...prev, [item.key]: e.target.checked }))} />
                    <span className="switch-track" aria-hidden="true" />
                    <span className="switch-thumb" aria-hidden="true" />
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="px-5 pb-5">
          <button type="button" className="btn btn-secondary" onClick={saveNotifications} disabled={saving === 'notifications'}>
            {saving === 'notifications' ? <><span className="spinner spinner-sm" /> Saving</> : 'Save preferences'}
          </button>
        </div>
      </section>
    </div>
  )
}
