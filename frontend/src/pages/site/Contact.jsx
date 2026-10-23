import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import SitePage from '../../components/SiteLayout'
import api, { errorMessage } from '../../utils/api'
import { SITE_LINKS } from '../../data/site'

const TOPICS = [
  ['demo', 'Book a demo'],
  ['question', 'A question about Hopr'],
  ['support', 'Help with my account'],
  ['data_request', 'My data (a copy, a correction or deletion)']
]
const FLEET_SIZES = [['', 'Choose one (optional)'], ['1-5', '1 to 5 vehicles'], ['6-20', '6 to 20 vehicles'], ['21-100', '21 to 100 vehicles'], ['100+', 'More than 100 vehicles']]

export default function Contact() {
  const [params] = useSearchParams()
  const initialTopic = TOPICS.some(([key]) => key === params.get('topic')) ? params.get('topic') : 'demo'
  const [form, setForm] = useState({ name: '', email: '', company: '', fleetSize: '', topic: initialTopic, message: '', website: '' })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState('')
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const submit = async e => {
    e.preventDefault()
    const next = {}
    if (!form.name.trim()) next.name = 'Enter your name'
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = 'Enter a valid email'
    if (!form.message.trim()) next.message = 'Write a message'
    setErrors(next)
    if (Object.keys(next).length) return
    setBusy(true)
    try {
      const res = await api.post('/contact', { ...form, name: form.name.trim(), email: form.email.trim() })
      setSent(res.data.message)
    } catch (err) {
      setErrors({ form: errorMessage(err, 'Could not send your message. Please try again.') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <SitePage title="Contact" lede="Book a demo, ask a question or get help. A person reads every message.">
      <div className="site-two">
        {sent ? (
          <div className="site-prose" role="status">
            <h2>Message sent</h2>
            <p>{sent}</p>
            <p><Link to="/product">Look around the product</Link> while you wait.</p>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="max-w-[560px]">
            <div className="form-group">
              <label htmlFor="c-topic" className="form-label">What it’s about</label>
              <select id="c-topic" className="form-input form-select" value={form.topic} onChange={e => set('topic', e.target.value)} disabled={busy}>
                {TOPICS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </div>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <div className="form-group">
                <label htmlFor="c-name" className="form-label">Your name</label>
                <input id="c-name" className={`form-input ${errors.name ? 'error' : ''}`} value={form.name} onChange={e => set('name', e.target.value)} autoComplete="name" disabled={busy}
                  aria-invalid={!!errors.name} aria-describedby={errors.name ? 'c-name-error' : undefined} />
                {errors.name && <p id="c-name-error" className="form-error" role="alert">{errors.name}</p>}
              </div>
              <div className="form-group">
                <label htmlFor="c-email" className="form-label">Work email</label>
                <input id="c-email" type="email" className={`form-input ${errors.email ? 'error' : ''}`} value={form.email} onChange={e => set('email', e.target.value)} autoComplete="email" disabled={busy}
                  aria-invalid={!!errors.email} aria-describedby={errors.email ? 'c-email-error' : undefined} />
                {errors.email && <p id="c-email-error" className="form-error" role="alert">{errors.email}</p>}
              </div>
              <div className="form-group">
                <label htmlFor="c-company" className="form-label">Company (optional)</label>
                <input id="c-company" className="form-input" value={form.company} onChange={e => set('company', e.target.value)} autoComplete="organization" disabled={busy} />
              </div>
              <div className="form-group">
                <label htmlFor="c-fleet" className="form-label">Fleet size</label>
                <select id="c-fleet" className="form-input form-select" value={form.fleetSize} onChange={e => set('fleetSize', e.target.value)} disabled={busy}>
                  {FLEET_SIZES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="c-message" className="form-label">Message</label>
              <textarea id="c-message" rows={6} maxLength={4000} className={`form-input ${errors.message ? 'error' : ''}`} value={form.message} onChange={e => set('message', e.target.value)} disabled={busy}
                placeholder={form.topic === 'demo' ? 'How many vehicles and hubs you run, and how you plan routes today' : ''}
                aria-invalid={!!errors.message} aria-describedby={errors.message ? 'c-message-error' : undefined} />
              {errors.message && <p id="c-message-error" className="form-error" role="alert">{errors.message}</p>}
            </div>
            {/* Left empty by people; bots fill it in */}
            <div className="site-honeypot" aria-hidden="true">
              <label htmlFor="c-website">Website</label>
              <input id="c-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={e => set('website', e.target.value)} />
            </div>
            {errors.form && <div className="alert alert-error mb-4" role="alert">{errors.form}</div>}
            <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
              {busy ? <><span className="spinner" /> Sending</> : 'Send message'}
            </button>
            <p className="text-micro text-ink-400 mt-3">We use your details only to reply. See the <Link to="/privacy" className="underline">privacy policy</Link>.</p>
          </form>
        )}
        <aside className="site-aside">
          <h2>Try it now</h2>
          <p>The live preview opens as a fleet manager with routes in five cities. Nothing to install.</p>
          <p><Link to="/" className="font-semibold">Open the live preview from the homepage</Link></p>
          <h2 className="mt-6">Is it working?</h2>
          <p>Check the <a href={SITE_LINKS.status} target="_blank" rel="noopener noreferrer">status page</a> before writing in about an outage.</p>
        </aside>
      </div>
    </SitePage>
  )
}
