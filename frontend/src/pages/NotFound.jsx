import { Link, useNavigate } from 'react-router-dom'
import Icon from '../components/icons'

// A route that runs out of road: three hops, then a dashed dead end
function DeadEnd() {
  return (
    <svg width="220" height="90" viewBox="0 0 220 90" fill="none" aria-hidden="true" className="dead-end">
      <path d="M12 70 C 40 70, 46 24, 78 24 S 118 62, 146 50" stroke="#D4FF3F" strokeWidth="3" strokeLinecap="round"
        className="nd-route-path" style={{ '--route-length': 170, filter: 'drop-shadow(0 0 6px rgb(212 255 63 / 0.45))' }} />
      <path d="M146 50 C 162 44, 176 40, 196 40" stroke="#7D8AA3" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="2 8" />
      {[[12, 70], [78, 24], [146, 50]].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="6" fill="#070B14" stroke="#D4FF3F" strokeWidth="2.5" className="nd-hop-dot" style={{ animationDelay: `${200 + i * 260}ms` }} />
      ))}
      <path d="M190 34 l12 12 M202 34 l-12 12" stroke="#FF6B78" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

export default function NotFound() {
  const navigate = useNavigate()
  return (
    <div className="crash-screen">
      <DeadEnd />
      <h1 className="font-display text-h1 mt-6">This page isn&apos;t on any route</h1>
      <p className="text-small text-ink-300 mt-2 max-w-[42ch]">The link may be old or mistyped. Head back and pick up from your dashboard.</p>
      <div className="flex flex-wrap gap-2 mt-6 justify-center">
        <Link to="/dashboard" className="btn btn-primary"><Icon name="dashboard" />Back to dashboard</Link>
        <button type="button" className="btn btn-outline" onClick={() => navigate(-1)}>Go back</button>
      </div>
    </div>
  )
}
