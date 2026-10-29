import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api, { errorMessage } from '../utils/api'
import { HopMark } from '../components/icons'
import DirectionSign from '../components/DirectionSign'
import usePageTitle from '../hooks/usePageTitle'
import PasswordInput from '../components/PasswordInput'

// Forgot password (/forgot-password) and choosing a new one from the emailed link
// (/reset-password?token=...). The server answers the request the same way whether or not
// the account exists.
export default function PasswordReset() {
  const [params] = useSearchParams()
  const token = params.get('token')
  usePageTitle(token ? 'Choose a new password' : 'Reset your password')

  return (
    <div className="login-page">
      <main className="login-main" aria-label={token ? 'Choose a new password' : 'Reset your password'}>
        <Link to="/" className="brand" aria-label="Hopr home">
          <HopMark size={32} />Hopr
        </Link>
        <div className="login-form">
          {token ? <NewPasswordForm token={token} /> : <RequestForm />}
          <p className="text-body text-ink-400 mt-4"><Link to="/login">Back to sign in</Link></p>
        </div>
        <p className="flex gap-4 text-micro text-ink-400"><Link to="/privacy">Privacy policy</Link><Link to="/terms">Terms of use</Link><Link to="/contact">Contact</Link></p>
      </main>
      <aside className="login-aside" aria-label="About Hopr">
        <DirectionSign title="Plan, dispatch and track deliveries across India."
          lede="Routes ordered around traffic, delivery windows, priority and fuel. Drivers deliver with photo proof. Customers follow their parcel live." />
      </aside>
    </div>
  )
}

function RequestForm() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(null)

  const submit = async e => {
    e.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email')
    setBusy(true)
    setError('')
    try {
      const res = await api.post('/auth/forgot-password', { email: email.trim() })
      setSent(res.data)
    } catch (err) {
      setError(errorMessage(err, 'Could not send the reset link'))
    } finally {
      setBusy(false)
    }
  }

  // Without email on the server no link goes out, so say only that (the same for every
  // address, so it still reveals nothing about who has an account)
  if (sent?.emailEnabled === false) {
    return (
      <>
        <h1 className="text-h1 font-extrabold">Ask your administrator</h1>
        <p className="text-body text-ink-400 mt-1" role="status">Email isn&apos;t set up on this server yet, so no reset link can be sent. Your administrator can set a new password for you from the Admin page.</p>
      </>
    )
  }
  if (sent) {
    return (
      <>
        <h1 className="text-h1 font-extrabold">Check your email</h1>
        <p className="text-body text-ink-400 mt-1" role="status">{sent.message}</p>
      </>
    )
  }

  return (
    <>
      <h1 className="text-h1 font-extrabold">Reset your password</h1>
      <p className="text-body text-ink-400 mt-1 mb-6">Enter the email you sign in with and we&apos;ll send you a link to choose a new password.</p>
      <form onSubmit={submit} noValidate>
        <div className="form-group">
          <label htmlFor="email" className="form-label">Email</label>
          <input type="email" id="email" className={`form-input ${error ? 'error' : ''}`} value={email} onChange={e => setEmail(e.target.value)}
            placeholder="you@company.com" autoComplete="email" disabled={busy} aria-invalid={!!error} aria-describedby={error ? 'reset-error' : undefined} />
          {error && <p id="reset-error" className="form-error" role="alert">{error}</p>}
        </div>
        <button type="submit" className="btn btn-primary btn-lg w-full" disabled={busy}>
          {busy ? <><span className="spinner" /> Sending</> : 'Send reset link'}
        </button>
      </form>
    </>
  )
}

function NewPasswordForm({ token }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const submit = async e => {
    e.preventDefault()
    if (password.length < 6) return setError('Use at least 6 characters')
    if (password !== confirm) return setError('The two passwords don’t match')
    setBusy(true)
    setError('')
    try {
      const res = await api.post('/auth/reset-password', { token, password })
      setDone(res.data.message)
    } catch (err) {
      setError(errorMessage(err, 'Could not reset the password'))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <>
        <h1 className="text-h1 font-extrabold">Password changed</h1>
        <p className="text-body text-ink-400 mt-1 mb-6" role="status">{done}</p>
        <Link to="/login" className="btn btn-primary btn-lg w-full">Sign in</Link>
      </>
    )
  }

  return (
    <>
      <h1 className="text-h1 font-extrabold">Choose a new password</h1>
      <p className="text-body text-ink-400 mt-1 mb-6">This signs you out on every other device.</p>
      <form onSubmit={submit} noValidate>
        <div className="form-group">
          <label htmlFor="new-password" className="form-label">New password</label>
          <PasswordInput id="new-password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" disabled={busy} />
        </div>
        <div className="form-group">
          <label htmlFor="confirm-password" className="form-label">Type it again</label>
          <PasswordInput id="confirm-password" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="new-password" disabled={busy} />
        </div>
        {error && <div className="alert alert-error mb-4" role="alert">{error}</div>}
        <button type="submit" className="btn btn-primary btn-lg w-full" disabled={busy}>
          {busy ? <><span className="spinner" /> Saving</> : 'Save new password'}
        </button>
      </form>
    </>
  )
}
