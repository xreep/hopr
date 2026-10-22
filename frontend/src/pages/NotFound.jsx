import { Link, useNavigate } from 'react-router-dom'
import Icon from '../components/icons'

// A route that runs out of road: three hops, then a dashed dead end
function DeadEnd() {
  return (
    <svg width="220" height="90" viewBox="0 0 220 90" fill="none" aria-hidden="true">
      <path d="M12 70 C 40 70, 46 24, 78 24 S 118 62, 146 50" stroke="#FFFFFF" strokeWidth="7" strokeLinecap="round" />
      <path d="M12 70 C 40 70, 46 24, 78 24 S 118 62, 146 50" stroke="#0B6B3A" strokeWidth="4" strokeLinecap="round" />
      <path d="M146 50 C 162 44, 176 40, 190 40" stroke="#8A929B" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="2 7" />
      {[[12, 70], [78, 24], [146, 50]].map(([cx, cy]) => (
        <rect key={cx} x={cx - 8} y={cy - 7} width="16" height="14" rx="2" fill="#FFFFFF" stroke="#0B6B3A" strokeWidth="2.5" />
      ))}
      <path d="M192 33 l13 13 M205 33 l-13 13" stroke="#C8102E" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export default function NotFound() {
  const navigate = useNavigate()
  return (
    <div className="crash-screen">
      <DeadEnd />
      <h1 className="text-h1 font-extrabold mt-6">This page isn&apos;t on any route</h1>
      <p className="text-small text-ink-300 mt-2 max-w-[42ch]">The link may be old or mistyped. Head back and pick up from your dashboard.</p>
      <div className="flex flex-wrap gap-2 mt-6 justify-center">
        <Link to="/dashboard" className="btn btn-primary"><Icon name="dashboard" />Back to dashboard</Link>
        <button type="button" className="btn btn-outline" onClick={() => navigate(-1)}>Go back</button>
      </div>
    </div>
  )
}
