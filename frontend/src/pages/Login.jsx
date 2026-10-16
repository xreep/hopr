import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})

  const validate = () => {
    const newErrors = {}
    if (!email) newErrors.email = 'Email is required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) newErrors.email = 'Invalid email format'
    if (!password) newErrors.password = 'Password is required'
    else if (password.length < 6) newErrors.password = 'Password must be at least 6 characters'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return

    setLoading(true)
    try {
      await login(email, password)
      toast.success('Welcome back!')
      navigate('/dashboard')
    } catch (error) {
      const message = error.response?.data?.message || 'Invalid credentials'
      toast.error(message)
      setErrors({ form: message })
    } finally {
      setLoading(false)
    }
  }

  const handleDemoLogin = async (role) => {
    const demoUsers = {
      admin: { email: 'admin@hopr.com', password: 'admin123' },
      fleet_manager: { email: 'manager@hopr.com', password: 'manager123' },
      driver: { email: 'driver@hopr.com', password: 'driver123' }
    }
    const creds = demoUsers[role]
    setEmail(creds.email)
    setPassword(creds.password)
    try {
      await login(creds.email, creds.password)
      toast.success(`Logged in as ${role.replace('_', ' ')}`)
      navigate('/dashboard')
    } catch (error) {
      toast.error('Demo account not found. Please register first.')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mx-auto mb-4 text-primary" aria-hidden="true">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          <h1 className="text-3xl font-bold text-primary">Hopr</h1>
          <p className="text-secondary mt-2">Smart Route Optimization for Last-Mile Delivery</p>
        </div>

        <div className="card">
          <div className="card-body">
            <h2 className="text-xl font-semibold mb-6 text-center">Sign in to your account</h2>

            <form onSubmit={handleSubmit} noValidate>
              <div className="form-group">
                <label htmlFor="email" className="form-label">Email</label>
                <input
                  type="email"
                  id="email"
                  className={`form-input ${errors.email ? 'error' : ''}`}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  autoComplete="email"
                  disabled={loading}
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                />
                {errors.email && <p id="email-error" className="form-error" role="alert">{errors.email}</p>}
              </div>

              <div className="form-group">
                <label htmlFor="password" className="form-label">Password</label>
                <input
                  type="password"
                  id="password"
                  className={`form-input ${errors.password ? 'error' : ''}`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  disabled={loading}
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                />
                {errors.password && <p id="password-error" className="form-error" role="alert">{errors.password}</p>}
              </div>

              {errors.form && (
                <div className="alert alert-error mb-4" role="alert">
                  {errors.form}
                </div>
              )}

              <button type="submit" className="btn btn-primary w-full mt-2" disabled={loading}>
                {loading ? <span className="flex items-center gap-2"><span className="spinner" />Signing in...</span> : 'Sign in'}
              </button>
            </form>

            <div className="divider my-6" />

            <p className="text-center text-sm text-secondary mb-4">Quick demo access</p>
            <div className="grid grid-3 gap-2">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => handleDemoLogin('admin')}
                disabled={loading}
              >
                Admin
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => handleDemoLogin('fleet_manager')}
                disabled={loading}
              >
                Fleet Manager
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => handleDemoLogin('driver')}
                disabled={loading}
              >
                Driver
              </button>
            </div>
          </div>
        </div>

        <p className="text-center text-sm text-muted mt-6">
          Demo credentials: admin@hopr.com / admin123
        </p>
      </div>
    </div>
  )
}