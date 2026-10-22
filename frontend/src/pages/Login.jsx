import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { errorMessage } from '../utils/api'
import { HopMark } from '../components/icons'
import DirectionSign from '../components/DirectionSign'
import { DEMO_USERS, DEMO_MISSING } from '../utils/demo'
import usePageTitle from '../hooks/usePageTitle'
import useDemoMode from '../hooks/useDemoMode'
import PasswordInput from '../components/PasswordInput'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function Login() {
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('login')
  const demo = useDemoMode() === true
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '' })
  usePageTitle(mode === 'login' ? 'Sign in' : 'Create account')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const validate = () => {
    const e = {}
    if (mode === 'register' && !form.name.trim()) e.name = 'Enter your name'
    if (!form.email) e.email = 'Enter your email'
    else if (!EMAIL_RE.test(form.email)) e.email = 'That email address doesn\'t look right'
    if (!form.password) e.password = 'Enter your password'
    else if (form.password.length < 6) e.password = 'Use at least 6 characters'
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
        toast.success(`Welcome back, ${user.name.split(' ')[0]}`)
      } else {
        await register({ name: form.name, email: form.email, password: form.password, phone: form.phone || undefined })
        toast.success('Account created. You\'re registered as a driver.')
      }
      navigate('/dashboard')
    } catch (error) {
      setErrors({ form: errorMessage(error, mode === 'login' ? 'Email or password is incorrect' : 'Could not create the account') })
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
      toast.success(`Signed in as the demo ${creds.label.toLowerCase()}`)
      navigate('/dashboard')
    } catch (error) {
      setErrors({ form: error.response?.status === 401 ? DEMO_MISSING : errorMessage(error) })
    } finally {
      setLoading(false)
    }
  }

  const switchMode = (next) => {
    setMode(next)
    setErrors({})
  }

  return (
    <div className="login-page">
      <section className="login-main" aria-label="Sign in">
        <Link to="/" className="brand" aria-label="Hopr home">
          <HopMark size={32} />Hopr
        </Link>

        <div className="login-form">
          <h1 className="text-h1 font-extrabold">{mode === 'login' ? 'Sign in' : 'Create a driver account'}</h1>
          <p className="text-body text-ink-400 mt-1 mb-6">
            {mode === 'login' ? 'Plan routes, dispatch drivers or start your deliveries.' : 'New accounts start as drivers. An admin can change your role.'}
          </p>

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
              <PasswordInput id="password" className={errors.password ? 'error' : ''} value={form.password}
                onChange={e => set('password', e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} disabled={loading}
                aria-invalid={!!errors.password} aria-describedby={errors.password ? 'password-error' : undefined} />
              {errors.password && <p id="password-error" className="form-error" role="alert">{errors.password}</p>}
            </div>
            {mode === 'register' && (
              <div className="form-group">
                <label htmlFor="phone" className="form-label">Phone (optional)</label>
                <input type="tel" id="phone" className="form-input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+91 98xxx xxxxx" autoComplete="tel" disabled={loading} />
              </div>
            )}

            {errors.form && <div className="alert alert-error mb-4" role="alert">{errors.form}</div>}

            <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading}>
              {loading ? <><span className="spinner" /> {mode === 'login' ? 'Signing in' : 'Creating account'}</> : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <p className="text-body text-ink-400 mt-4">
            {mode === 'login'
              ? <>New driver? <button type="button" className="link-button" onClick={() => switchMode('register')}>Create an account</button></>
              : <>Already have an account? <button type="button" className="link-button" onClick={() => switchMode('login')}>Sign in</button></>}
          </p>

          {demo && <div className="login-demo">
            <p className="text-small font-semibold text-ink-300 mb-2">Explore with a demo account</p>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(DEMO_USERS).map(([role, creds]) => (
                <button key={role} type="button" className="btn btn-secondary btn-sm" onClick={() => handleDemoLogin(role)} disabled={loading}>
                  {creds.label}
                </button>
              ))}
            </div>
          </div>}
        </div>

        <p className="text-micro text-ink-400">Route optimisation for last-mile delivery in India</p>
      </section>

      <aside className="login-aside" aria-label="About Hopr">
        <DirectionSign title="Plan, dispatch and track deliveries across India."
          lede="Routes ordered around traffic, delivery windows, priority and fuel. Drivers deliver with photo proof. Customers follow their parcel live." />
      </aside>
    </div>
  )
}
