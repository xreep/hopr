import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import MapView from '../components/MapView'
import DirectionSign from '../components/DirectionSign'
import { StatCard } from '../components/ui'
import Icon, { HopMark } from '../components/icons'
import { useAuth } from '../context/AuthContext'
import { errorMessage } from '../utils/api'
import { DEMO_USERS, DEMO_MISSING } from '../utils/demo'
import { pointAlong, slicePolyline, stopsAlongKm } from '../utils/geo'
import useMediaQuery from '../hooks/useMediaQuery'
import useDemoMode from '../hooks/useDemoMode'
import ROUTE from '../data/landingRoute.json'

// The public homepage. The hero is the product doing its job: the New Delhi demo route,
// on its real roads, driven by a van while the route sheet keeps time.

const SPEED_KMH = 24
const SERVICE_MIN = 6
const DEPART_MIN = 11 * 60 + 5 // 11:05 am
const LOOP_MS = 50000
const FRAME_MS = 120

const STOP_KM = stopsAlongKm(ROUTE.stops, ROUTE.line)
const ARRIVE_MIN = (() => {
  let t = 0
  let prev = 0
  return STOP_KM.map(km => {
    t += ((km - prev) / SPEED_KMH) * 60
    const arrive = t
    t += SERVICE_MIN
    prev = km
    return arrive
  })
})()
const DRIVE_MIN = ARRIVE_MIN[ARRIVE_MIN.length - 1] + SERVICE_MIN
const LOOP_MIN = DRIVE_MIN + 12 // a short rest at the last stop before the loop restarts

function driveAt(simMin) {
  let prevKm = 0
  for (let i = 0; i < STOP_KM.length; i++) {
    if (simMin < ARRIVE_MIN[i]) {
      const leftAt = i === 0 ? 0 : ARRIVE_MIN[i - 1] + SERVICE_MIN
      return { km: Math.min(STOP_KM[i], prevKm + ((simMin - leftAt) / 60) * SPEED_KMH), delivered: i }
    }
    if (simMin < ARRIVE_MIN[i] + SERVICE_MIN) return { km: STOP_KM[i], delivered: i, atDoor: true }
    prevKm = STOP_KM[i]
  }
  return { km: prevKm, delivered: STOP_KM.length }
}

const clock = min => {
  const total = Math.round(DEPART_MIN + min)
  const h = Math.floor(total / 60) % 24
  return `${h % 12 || 12}:${String(total % 60).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`
}

// Simulated minutes since the van left, advancing while the hero is on screen
function useDriveClock(still) {
  const [simMin, setSimMin] = useState(still ? ARRIVE_MIN[2] - 4 : 0)
  const ref = useRef(null)
  useEffect(() => {
    if (still) return undefined
    let frame = 0
    let visible = true
    let last = 0
    let elapsed = 0
    let prevT = null
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting })
    if (ref.current) observer.observe(ref.current)
    const step = t => {
      if (prevT !== null && visible) elapsed += t - prevT
      prevT = t
      if (t - last >= FRAME_MS) {
        last = t
        setSimMin(((elapsed % LOOP_MS) / LOOP_MS) * LOOP_MIN)
      }
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [still])
  return [simMin, ref]
}

function HeroDrive() {
  const still = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [simMin, ref] = useDriveClock(still)
  const drive = driveAt(simMin)
  const position = pointAlong(ROUTE.line, drive.km)
  const finished = drive.delivered === ROUTE.stops.length

  const map = useMemo(() => ({
    lines: [
      { id: 'driven', coordinates: slicePolyline(ROUTE.line, 0, drive.km), color: '#8A929B', width: 4 },
      { id: 'ahead', coordinates: slicePolyline(ROUTE.line, drive.km), width: 4.5 }
    ],
    points: [
      { id: 'hub', coordinates: ROUTE.depot.coordinates, label: 'H', variant: 'depot', title: ROUTE.depot.name },
      ...ROUTE.stops.map((s, i) => ({
        id: `s${s.sequence}`,
        coordinates: s.coordinates,
        label: s.sequence,
        variant: i < drive.delivered ? 'done' : i === drive.delivered ? 'current' : 'stop',
        title: s.place
      }))
    ]
  }), [drive.km, drive.delivered])

  return (
    <div className="landing-drive" ref={ref}>
      <div className="landing-map">
        <MapView lines={map.lines} points={map.points} driver={{ coordinates: position, initials: 'PK' }} fitKey="landing" height="100%" />
      </div>
      <aside className="landing-sheet" aria-label="Route sheet, New Delhi demo route">
        <div className="landing-sheet-head">
          <div>
            <p className="font-bold">New Delhi morning run</p>
            <p className="text-micro text-ink-400">Pooja Kumari, Tata Ace EV, {ROUTE.totalKm.toFixed(1)} km</p>
          </div>
          <span className="landing-clock" aria-hidden="true">{clock(Math.min(simMin, DRIVE_MIN))}</span>
        </div>
        <ol className="landing-stops">
          {ROUTE.stops.map((s, i) => {
            const done = i < drive.delivered
            const next = i === drive.delivered
            const minutes = Math.max(1, Math.round(ARRIVE_MIN[i] - simMin))
            return (
              <li key={s.sequence} className={done ? 'is-done' : next ? 'is-next' : ''}>
                <span className="landing-stop-no">{s.sequence}</span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{s.place}</span>
                  <span className="block text-micro text-ink-400 truncate">{s.customerName}</span>
                </span>
                <span className="landing-stop-eta">
                  {done ? `Delivered ${clock(ARRIVE_MIN[i] + 2)}` : next ? (drive.atDoor ? 'At the door' : `${minutes} min`) : clock(ARRIVE_MIN[i])}
                </span>
              </li>
            )
          })}
        </ol>
        <p className="landing-sheet-foot">{finished ? 'All five delivered, back on the road tomorrow' : 'Demo route, driven 20 times faster than real time'}</p>
      </aside>
    </div>
  )
}

const STEPS = [
  {
    title: 'Plan',
    body: 'Type addresses or upload a spreadsheet. Hopr orders up to 30 stops per vehicle around traffic, delivery windows and priority, and shows distance, fuel cost and CO₂ before you commit.'
  },
  {
    title: 'Dispatch',
    body: 'Auto-dispatch gives each route to a free driver based in that city, in a vehicle that can carry the load. You see why each pair was chosen before you confirm.'
  },
  {
    title: 'Deliver',
    body: 'Drivers get the route on their phone with navigation and close each stop with a photo or the customer’s signature. The app works in Hindi and keeps working without signal.'
  },
  {
    title: 'Track',
    body: 'Every customer gets a link with the van on a map and a live arrival time. Managers watch every route on one map and recalculate when traffic changes.'
  }
]

export default function Landing() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const demo = useDemoMode() === true

  useEffect(() => {
    document.title = 'Hopr: delivery route planning for India'
  }, [])

  const tryDemo = async () => {
    setBusy(true)
    try {
      const { email, password } = DEMO_USERS.fleet_manager
      await login(email, password)
      toast.success('Signed in as the demo fleet manager')
      navigate('/dashboard')
    } catch (error) {
      toast.error(error.response?.status === 401 ? DEMO_MISSING : errorMessage(error, 'Could not open the demo'))
    } finally {
      setBusy(false)
    }
  }

  const demoButton = (size = '') => (
    <button type="button" className={`btn btn-primary ${size}`} onClick={tryDemo} disabled={busy}>
      {busy ? <><span className="spinner" /> Opening the demo</> : 'Try the demo'}
    </button>
  )
  // The demo is offered only when the server runs as a public demo
  const actions = (size = '') => (demo
    ? <>{demoButton(size)}<Link to="/login" className={`btn btn-outline ${size}`}>Sign in</Link></>
    : <Link to="/login" className={`btn btn-primary ${size}`}>Sign in</Link>)

  return (
    <div className="landing">
      <header className="landing-header">
        <Link to="/" className="brand" aria-label="Hopr home"><HopMark size={30} />Hopr</Link>
        <nav aria-label="Sections" className="landing-nav">
          <a href="#how-it-works">How it works</a>
          <a href="#screens">For drivers and customers</a>
          <a href="#india">Coverage</a>
        </nav>
        <div className="flex items-center gap-2">
          {demo ? <><Link to="/login" className="btn btn-ghost">Sign in</Link>{demoButton()}</> : actions()}
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <h1 className="landing-title">Delivery routes that follow India&apos;s roads</h1>
            <p className="landing-lede">
              Hopr puts your stops in the best order for traffic, delivery windows and fuel, gives each route to the right driver,
              and lets customers watch their parcel arrive.
            </p>
            <div className="flex flex-wrap gap-2 mt-7">{actions('btn-lg')}</div>
            {demo && <p className="text-small text-ink-400 mt-3">The demo opens as a fleet manager with routes in five cities. Nothing to install.</p>}
          </div>
          <HeroDrive />
        </section>

        <section id="how-it-works" className="landing-section">
          <h2 className="landing-h2">From a list of addresses to a signed delivery</h2>
          <ol className="landing-steps">
            {STEPS.map((step, i) => (
              <li key={step.title}>
                <span className="landing-step-marker" aria-hidden="true">{i + 1}</span>
                <h3 className="text-h3 font-bold mt-4">{step.title}</h3>
                <p className="text-body text-ink-300 mt-1.5">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="screens" className="landing-section landing-screens">
          <h2 className="landing-h2">One route, three people</h2>
          <div className="landing-screen-row">
            <div>
              <h3 className="text-h3 font-bold">The fleet manager</h3>
              <p className="text-body text-ink-300 mt-1.5 max-w-[46ch]">
                Today&apos;s deliveries across every hub at a glance: what&apos;s done, what&apos;s at risk and which routes still need a driver.
              </p>
            </div>
            <div className="landing-screen" aria-hidden="true">
              <div className="stats-strip landing-stats">
                <StatCard label="Delivered today" value={186} isKey hint="4 failed, 23 still to go" />
                <StatCard label="On-time today" value={94.2} suffix="%" hint="Within the window" />
                <StatCard label="Routes on the road" value={12} hint="12 of 15 drivers driving" />
              </div>
            </div>
          </div>

          <div className="landing-screen-row">
            <div>
              <h3 className="text-h3 font-bold">The driver</h3>
              <p className="text-body text-ink-300 mt-1.5 max-w-[46ch]">
                The next stop, its delivery window and two big buttons. Deliveries made without signal are kept on the phone and sent when it reconnects.
              </p>
            </div>
            <div className="landing-screen landing-phone" aria-hidden="true">
              <p className="text-micro text-ink-400">Stop 2 of 5</p>
              <p className="font-bold text-lg mt-1">Ananya Gupta</p>
              <p className="text-small text-ink-300">Khan Market, New Delhi 110003</p>
              <p className="text-small mt-2">ETA <strong>11:24 am</strong>, window 11:30 to 12:30</p>
              <div className="grid grid-cols-2 gap-2 mt-4">
                <span className="btn btn-danger btn-sm"><Icon name="x" />Couldn&apos;t deliver</span>
                <span className="btn btn-success btn-sm"><Icon name="check" />Delivered</span>
              </div>
            </div>
          </div>

          <div className="landing-screen-row">
            <div>
              <h3 className="text-h3 font-bold">The customer</h3>
              <p className="text-body text-ink-300 mt-1.5 max-w-[46ch]">
                A tracking link with the van on a map and a countdown that follows the real road, without installing anything or signing in.
              </p>
            </div>
            <div className="landing-screen landing-phone" aria-hidden="true">
              <p className="text-small text-ink-400">Hi Ananya</p>
              <p className="track-headline">Pooja is on the way</p>
              <p className="track-eta"><span className="track-eta-value">12<small>min</small></span><span>away. 1 stop before yours.</span></p>
            </div>
          </div>
        </section>

        <section id="india" className="landing-section landing-india">
          <div>
            <h2 className="landing-h2">Works anywhere in India, with no map bill</h2>
            <p className="text-body-lg text-ink-300 mt-3 max-w-[52ch]">
              Street maps, address search and road routing come from OpenStreetMap, so there is no paid map key. Address search covers the whole
              country and ranks places near your hub first. Fuel costs use Indian retail prices you can set for your state.
            </p>
            <p className="text-body-lg text-ink-300 mt-3 max-w-[52ch]">
              The demo has a hub, a driver and a morning route in each of five cities. Run a demo morning from the dashboard and all five drive at once.
            </p>
          </div>
          <DirectionSign title="Five demo hubs" note={null} as="h3" />
        </section>

        <section className="landing-cta">
          <h2 className="landing-h2">See it plan, dispatch and drive</h2>
          <div className="flex flex-wrap gap-2 mt-5">{actions('btn-lg')}</div>
        </section>
      </main>

      <footer className="landing-footer">
        <span className="brand text-base"><HopMark size={22} />Hopr</span>
        <span>Route optimisation for last-mile delivery in India</span>
        <span>Map data &copy; OpenStreetMap contributors</span>
      </footer>
    </div>
  )
}
