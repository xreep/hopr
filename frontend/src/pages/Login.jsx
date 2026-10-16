import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { errorMessage } from '../utils/api'
import toast from 'react-hot-toast'

const DEMO_USERS = {
  admin: { email: 'admin@hopr.com', password: 'admin123', label: 'Admin' },
  fleet_manager: { email: 'manager@hopr.com', password: 'manager123', label: 'Fleet Manager' },
  driver: { email: 'driver@hopr.com', password: 'driver123', label: 'Driver' }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function Login() {
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' })
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const validate = () => {
    const e = {}
    if (mode === 'register' && !form.name.trim()) e.name = 'Name is required'
    if (!form.email) e.email = 'Email is required'
    else if (!EMAIL_RE.test(form.email)) e.email = 'Invalid email format'
    if (!form.password) e.password = 'Password is required'
    else if (form.password.length < 6) e.password = 'Password must be at least 6 characters'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    try {
      if (mode === 'login') {
        const user = await login(form.email, form.password)
        toast.success(`Welcome back, ${user.name.split(' ')[0]}!`)
      } else {
        await register({ name: form.name, email: form.email, password: form.password, phone: form.phone || undefined })
        toast.success('Account created. You are registered as a driver.')
      }
      navigate('/dashboard')
    } catch (error) {
      const message = errorMessage(error, mode === 'login' ? 'Invalid credentials' : 'Registration failed')
      setErrors({ form: message })
    } finally {
      setLoading(false)
    }
  }

  const handleDemoLogin = async (role) => {
    const creds = DEMO_USERS[role]
    setMode('login')
    setForm(prev => ({ ...prev, email: creds.email, password: creds.password }))
    setLoading(true)
    try {
      await login(creds.email, creds.password)
      toast.success(`Logged in as ${creds.label}`)
      navigate('/dashboard')
    } catch (error) {
      setErrors({ form: error.response?.status === 401 ? 'Demo accounts are not set up yet. Run "npm run seed" in backend/.' : errorMessage(error) })
    } finally {
      setLoading(false)
    }
  }

  const switchMode = (next) => {
    setMode(next)
    setErrors({})
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="text-center mb-6">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mx-auto mb-3 brand-mark" aria-hidden="true">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          <h1 className="text-3xl font-bold">Hopr</h1>
          <p className="text-secondary mt-2">Smart route optimization for last-mile delivery</p>
        </div>

        <div className="card">
          <div className="card-body">
            <div className="tabs mb-5" role="tablist" aria-label="Sign in or register">
              <button type="button" role="tab" aria-selected={mode === 'login'} className={`tab ${mode === 'login' ? 'active' : ''}`} onClick={() => switchMode('login')}>Sign in</button>
              <button type="button" role="tab" aria-selected={mode === 'register'} className={`tab ${mode === 'register' ? 'active' : ''}`} onClick={() => switchMode('register')}>Register</button>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              {mode === 'register' && (
                <div className="form-group">
                  <label htmlFor="name" className="form-label">Full name</label>
                  <input id="name" className={`form-input ${errors.name ? 'error' : ''}`} value={form.name} onChange={e => set('name', e.target.value)} autoComplete="name" disabled={loading} />
                  {errors.name && <p className="form-error" role="alert">{errors.name}</p>}
                </div>
              )}
              <div className="form-group">
                <label htmlFor="email" className="form-label">Email</label>
                <input type="email" id="email" className={`form-input ${errors.email ? 'error' : ''}`} value={form.email}
                  onChange={e => set('email', e.target.value)} placeholder="you@company.com" autoComplete="email" disabled={loading}
                  aria-invalid={!!errors.email} aria-describedby={errors.email ? 'email-error' : undefined} />
                {errors.email && <p id="email-error" className="form-error" role="alert">{errors.email}</p>}
              </div>
              <div className="form-group">
                <label htmlFor="password" className="form-label">Password</label>
                <input type="password" id="password" className={`form-input ${errors.password ? 'error' : ''}`} value={form.password}
                  onChange={e => set('password', e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} disabled={loading}
                  aria-invalid={!!errors.password} aria-describedby={errors.password ? 'password-error' : undefined} />
                {errors.password && <p id="password-error" className="form-error" role="alert">{errors.password}</p>}
              </div>
              {mode === 'register' && (
                <div className="form-group">
                  <label htmlFor="phone" className="form-label">Phone (optional)</label>
                  <input type="tel" id="phone" className="form-input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+91 98xxx xxxxx" autoComplete="tel" disabled={loading} />
                  <p className="text-xs text-muted mt-1">New accounts are drivers. An admin can change your role.</p>
                </div>
              )}

              {errors.form && <div className="alert alert-error mb-4" role="alert">{errors.form}</div>}

              <button type="submit" className="btn btn-primary w-full" disabled={loading}>
                {loading ? <><span className="spinner" /> Please wait…</> : mode === 'login' ? 'Sign in' : 'Create account'}
              </button>
            </form>

            <div className="divider my-6" />
            <p className="text-center text-sm text-secondary mb-3">Quick demo access</p>
            <div className="grid grid-3 gap-2">
              {Object.entries(DEMO_USERS).map(([role, creds]) => (
                <button key={role} type="button" className="btn btn-outline btn-sm" onClick={() => handleDemoLogin(role)} disabled={loading}>
                  {creds.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
