import { useState } from 'react'
import api from '../utils/api'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'

export default function Profile() {
  const { user, updateUser } = useAuth()
  const [activeTab, setActiveTab] = useState('profile')
  const [loading, setLoading] = useState(false)
  
  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    address: user?.address || ''
  })

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })

  const [notifications, setNotifications] = useState({
    email: true,
    sms: false,
    push: true,
    routeUpdates: true,
    maintenanceAlerts: true,
    weeklyReports: false
  })

  const handleProfileSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const response = await api.put('/auth/profile', profileData)
      updateUser(response.data.user)
      toast.success('Profile updated')
    } catch (error) {
      toast.error('Failed to update profile')
    } finally {
      setLoading(false)
    }
  }

  const handlePasswordSubmit = async (e) => {
    e.preventDefault()
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('Passwords do not match')
      return
    }
    if (passwordData.newPassword.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    setLoading(true)
    try {
      await api.put('/auth/password', {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword
      })
      toast.success('Password changed')
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  const handleNotificationChange = (key, value) => {
    setNotifications(prev => ({ ...prev, [key]: value }))
  }

  const handleNotificationSave = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await api.put('/auth/notifications', notifications)
      toast.success('Notifications updated')
    } catch (error) {
      toast.error('Failed to update notifications')
    } finally {
      setLoading(false)
    }
  }

  const tabs = [
    { id: 'profile', label: 'Profile', icon: UserIcon },
    { id: 'security', label: 'Security', icon: LockIcon },
    { id: 'notifications', label: 'Notifications', icon: BellIcon }
  ]

  return (
    <div className="max-w-3xl mx-auto">
      <div className="page-header">
        <h1 className="page-title">Profile Settings</h1>
        <p className="page-subtitle">Manage your account information and preferences</p>
      </div>

      <div className="card">
        <div className="card-header border-b">
          <nav className="flex gap-1" role="tablist" aria-label="Profile sections">
            {tabs.map(tab => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                aria-controls={`${tab.id}-panel`}
                id={`${tab.id}-tab`}
                className={`btn btn-ghost flex-1 flex items-center justify-center gap-2 ${
                  activeTab === tab.id ? 'bg-primary/5 text-primary' : 'text-secondary hover:text-primary'
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                <tab.icon className="w-4 h-4" aria-hidden="true" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="card-body">
          {activeTab === 'profile' && (
            <form onSubmit={handleProfileSubmit} id="profile-panel" role="tabpanel" aria-labelledby="profile-tab" className="space-y-4">
              <div className="grid grid-2 gap-4">
                <div className="form-group">
                  <label htmlFor="name" className="form-label">Full Name</label>
                  <input
                    type="text"
                    id="name"
                    className="form-input"
                    value={profileData.name}
                    onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="email" className="form-label">Email</label>
                  <input
                    type="email"
                    id="email"
                    className="form-input"
                    value={profileData.email}
                    onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="phone" className="form-label">Phone Number</label>
                  <input
                    type="tel"
                    id="phone"
                    className="form-input"
                    value={profileData.phone}
                    onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                    placeholder="+1 (555) 000-0000"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="address" className="form-label">Address</label>
                  <input
                    type="text"
                    id="address"
                    className="form-input"
                    value={profileData.address}
                    onChange={(e) => setProfileData({ ...profileData, address: e.target.value })}
                    placeholder="Home/Base address"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t">
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? <span className="flex items-center gap-2"><span className="spinner" />Saving...</span> : 'Save Changes'}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'security' && (
            <form onSubmit={handlePasswordSubmit} id="security-panel" role="tabpanel" aria-labelledby="security-tab" className="space-y-4">
              <div className="form-group">
                <label htmlFor="currentPassword" className="form-label">Current Password</label>
                <input
                  type="password"
                  id="currentPassword"
                  className="form-input"
                  value={passwordData.currentPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                  required
                  autoComplete="current-password"
                />
              </div>
              <div className="form-group">
                <label htmlFor="newPassword" className="form-label">New Password</label>
                <input
                  type="password"
                  id="newPassword"
                  className="form-input"
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>
              <div className="form-group">
                <label htmlFor="confirmPassword" className="form-label">Confirm New Password</label>
                <input
                  type="password"
                  id="confirmPassword"
                  className="form-input"
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                  required
                  autoComplete="new-password"
                />
              </div>

              <div className="flex justify-end pt-4 border-t">
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? <span className="flex items-center gap-2"><span className="spinner" />Changing...</span> : 'Change Password'}
                </button>
              </div>
            </form>
          )}

          {activeTab === 'notifications' && (
            <form onSubmit={handleNotificationSave} id="notifications-panel" role="tabpanel" aria-labelledby="notifications-tab" className="space-y-6">
              <div>
                <h4 className="font-medium mb-3">Notification Channels</h4>
                <div className="space-y-3">
                  {[
                    { key: 'email', label: 'Email', desc: 'Receive notifications via email' },
                    { key: 'sms', label: 'SMS', desc: 'Receive notifications via text message' },
                    { key: 'push', label: 'Push Notifications', desc: 'Receive notifications in the app' }
                  ].map(item => (
                    <label key={item.key} className="flex items-center gap-3 p-3 bg-background rounded-lg cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-4 h-4 text-primary rounded border-border focus:ring-primary"
                        checked={notifications[item.key]}
                        onChange={(e) => handleNotificationChange(item.key, e.target.checked)}
                      />
                      <div>
                        <p className="font-medium">{item.label}</p>
                        <p className="text-sm text-muted">{item.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t">
                <h4 className="font-medium mb-3">Notification Types</h4>
                <div className="space-y-3">
                  {[
                    { key: 'routeUpdates', label: 'Route Updates', desc: 'Changes to assigned routes and schedules' },
                    { key: 'maintenanceAlerts', label: 'Vehicle Maintenance', desc: 'Upcoming maintenance and service reminders' },
                    { key: 'weeklyReports', label: 'Weekly Reports', desc: 'Weekly performance summary emails' }
                  ].map(item => (
                    <label key={item.key} className="flex items-center gap-3 p-3 bg-background rounded-lg cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-4 h-4 text-primary rounded border-border focus:ring-primary"
                        checked={notifications[item.key]}
                        onChange={(e) => handleNotificationChange(item.key, e.target.checked)}
                      />
                      <div>
                        <p className="font-medium">{item.label}</p>
                        <p className="text-sm text-muted">{item.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t">
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? <span className="flex items-center gap-2"><span className="spinner" />Saving...</span> : 'Save Preferences'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <div className="card mt-6">
        <div className="card-header">
          <h3 className="font-semibold">Account Info</h3>
        </div>
        <div className="card-body">
          <dl className="grid grid-2 gap-4 text-sm">
            <dt className="text-muted">User ID</dt>
            <dd className="font-mono font-medium">{user?._id}</dd>
            <dt className="text-muted">Role</dt>
            <dd className="capitalize">{user?.role?.replace('_', ' ')}</dd>
            <dt className="text-muted">Member Since</dt>
            <dd>{user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'}</dd>
            <dt className="text-muted">Last Login</dt>
            <dd>{user?.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}</dd>
          </dl>
        </div>
      </div>
    </div>
  )
}

function UserIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
}

function LockIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
}

function BellIcon({ className }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
}