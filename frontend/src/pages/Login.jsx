import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'
import { errorMessage } from '../utils/api'
import { HopMark } from '../components/icons'
import usePageTitle from '../hooks/usePageTitle'
import PasswordInput from '../components/PasswordInput'

const DEMO_USERS = {
  admin: { email: 'admin@hopr.com', password: 'admin123', label: 'Admin' },
  fleet_manager: { email: 'manager@hopr.com', password: 'manager123', label: 'Fleet manager' },
  driver: { email: 'driver@hopr.com', password: 'driver123', label: 'Driver' }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// The Ranchi demo route: Kokar hub, then the five stops in their optimized order
const ROUTE = [
  { name: 'Kokar hub', at: [85.3521, 23.3756], hub: true, side: 'right' },
  { name: 'Morabadi', at: [85.3278, 23.3909], side: 'right' },
  { name: 'Firayalal', at: [85.3249, 23.3702], side: 'left' },
  { name: 'Lalpur', at: [85.3383, 23.3722], side: 'right' },
  { name: 'Ranchi Jn', at: [85.3356, 23.3493], side: 'right' },
  { name: 'Harmu', at: [85.303, 23.3583], side: 'above' }
]

function RouteGraphic() {
  const pathRef = useRef(null)
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const { points, d } = useMemo(() => {
    const W = 520
    const H = 340
    const pad = 46
    const xs = ROUTE.map(s => s.at[0] * Math.cos((23.37 * Math.PI) / 180))
    const ys = ROUTE.map(s => s.at[1])
    const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    const scale = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxY - minY))
    const pts = ROUTE.map((s, i) => ({
      ...s,
      x: pad + (xs[i] - minX) * scale + ((W - pad * 2) - (maxX - minX) * scale) / 2,
      y: pad + (maxY - ys[i]) * scale + ((H - pad * 2) - (maxY - minY) * scale) / 2
    }))
    // Gentle curves between stops so it reads as roads rather than a chart
    let path = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]
      const b = pts[i]
      const mx = (a.x + b.x) / 2
      path += ` C${mx.toFixed(1)} ${a.y.toFixed(1)}, ${mx.toFixed(1)} ${b.y.toFixed(1)}, ${b.x.toFixed(1)} ${b.y.toFixed(1)}`
    }
    return { points: pts, d: path }
  }, [])

  useLayoutEffect(() => {
    pathRef.current?.style.setProperty('--route-length', String(Math.ceil(pathRef.current.getTotalLength())))
  }, [])

  return (
    <svg viewBox="0 0 520 340" className="w-full h-auto" role="img" aria-label="Animated delivery route from the Kokar hub through five stops in Ranchi">
      <defs>
        <pattern id="login-grid" width="26" height="26" patternUnits="userSpaceOnUse">
          <path d="M26 0H0V26" fill="none" stroke="#A9B4C8" strokeOpacity="0.07" />
        </pattern>
      </defs>
      <rect width="520" height="340" fill="url(#login-grid)" rx="18" />
      <path d={d} fill="none" stroke="#1C2842" strokeWidth="7" strokeLinecap="round" />
      <path ref={pathRef} d={d} className="nd-route-path" style={{ strokeWidth: 3, animationDelay: '250ms', animationDuration: '1.6s' }} />
      {points.map((p, i) => (
        <g key={p.name} className="nd-hop-dot" style={{ animationDelay: `${300 + i * 260}ms` }}>
          {p.hub
            ? <rect x={p.x - 9} y={p.y - 9} width="18" height="18" rx="5" fill="#F4F7FB" />
            : <circle cx={p.x} cy={p.y} r={i === points.length - 1 ? 8 : 6.5} fill={i === points.length - 1 ? '#D4FF3F' : '#070B14'} stroke="#D4FF3F" strokeWidth="2.5" />}
          <text
            x={p.side === 'left' ? p.x - 14 : p.side === 'above' ? p.x : p.x + (p.hub ? 16 : 14)}
            y={p.side === 'above' ? p.y - 16 : p.y + 4.5}
            textAnchor={p.side === 'left' ? 'end' : p.side === 'above' ? 'middle' : 'start'}
            fontSize="13" fill="#A9B4C8" fontFamily="Inter, sans-serif">{p.name}</text>
        </g>
      ))}
      {!reduced && (
        <g>
          <circle r="11" fill="#D4FF3F" opacity="0.22">
            <animateMotion dur="9s" begin="2.2s" repeatCount="indefinite" path={d} />
          </circle>
          <circle r="5" fill="#F4F7FB" stroke="#D4FF3F" strokeWidth="2">
            <animateMotion dur="9s" begin="2.2s" repeatCount="indefinite" path={d} />
          </circle>
        </g>
      )}
    </svg>
  )
}

export default function Login() {
  const { login, register } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState('login')
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
      setErrors({ form: error.response?.status === 401 ? 'Demo accounts aren\'t set up yet. Run "npm run seed" in backend/.' : errorMessage(error) })
    } finally {
      setLoading(false)
    }
  }

  const switchMode = (next) => {
    setMode(next)
    setErrors({})
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.15fr_1fr]">
      <section className="relative flex flex-col justify-between gap-8 px-6 pt-8 pb-6 sm:px-10 lg:px-14 lg:py-12 lg:border-r lg:border-white/5" aria-label="About Hopr">
        <div className="flex items-center gap-2.5">
          <HopMark size={34} animated />
          <span className="font-display text-h3 font-bold tracking-tight">Hopr</span>
        </div>
        <div className="max-w-[560px]">
          <h1 className="font-display font-semibold text-ink-50 text-h1 sm:text-[2.6rem] sm:leading-[2.9rem] lg:text-hero tracking-tight">
            Hop through every stop.
          </h1>
          <p className="text-body-lg text-ink-300 mt-4 max-w-[46ch]">
            Plan, dispatch and track last-mile deliveries across Ranchi, with routes that account for traffic, delivery windows and fuel.
          </p>
        </div>
        <div className="hidden sm:block w-full max-w-[600px]">
          <RouteGraphic />
          <p className="text-micro text-ink-400 mt-2">Today&apos;s demo route: Kokar hub to Harmu, five stops.</p>
        </div>
      </section>

      <section className="flex items-start lg:items-center justify-center px-4 pb-10 sm:px-10 lg:py-12" aria-label="Sign in">
        <div className="w-full max-w-[420px]">
          <div className="card p-6 sm:p-7">
            <div className="tabs w-full mb-6" role="tablist" aria-label="Sign in or register">
              <button type="button" role="tab" aria-selected={mode === 'login'} className={`tab flex-1 ${mode === 'login' ? 'active' : ''}`} onClick={() => switchMode('login')}>Sign in</button>
              <button type="button" role="tab" aria-selected={mode === 'register'} className={`tab flex-1 ${mode === 'register' ? 'active' : ''}`} onClick={() => switchMode('register')}>Create account</button>
            </div>

            <h2 className="font-display text-h2 font-semibold mb-1">{mode === 'login' ? 'Welcome back' : 'Join as a driver'}</h2>
            <p className="text-body text-ink-400 mb-5">{mode === 'login' ? 'Sign in to plan, dispatch or drive.' : 'An admin can change your role later.'}</p>

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
          </div>

          <div className="mt-5">
            <p className="text-small text-ink-400 mb-2">Try the demo as</p>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(DEMO_USERS).map(([role, creds]) => (
                <button key={role} type="button" className="btn btn-secondary btn-sm" onClick={() => handleDemoLogin(role)} disabled={loading}>
                  {creds.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
