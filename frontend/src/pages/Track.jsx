import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import MapView from '../components/MapView'
import usePolling from '../hooks/usePolling'
import { planMove, positionAt, remainingFrom } from '../utils/tracking'
import { formatClock } from '../utils/time'
import { speak } from '../utils/speak'
import MuteToggle from '../components/MuteToggle'
import { HopMark } from '../components/icons'

const API_BASE = import.meta.env.VITE_API_URL || '/api'
const POLL_MS = 5000
const MOVE_MS = 4800 // just under the poll interval: the marker keeps gliding between fixes
const FRAME_MS = 33

const HEADLINES = {
  packed: () => 'Your order is packed',
  on_the_way: d => `${d} is on the way`,
  arriving: d => `${d} is arriving`,
  delivered: () => 'Delivered',
  failed: () => 'Delivery attempt unsuccessful',
  cancelled: () => 'Delivery cancelled'
}

export default function Track() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [display, setDisplay] = useState(null) // { position, path }
  const [now, setNow] = useState(Date.now())
  const lastOk = useRef(0)
  const shown = useRef({ position: null, path: null })
  const frame = useRef(0)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/track/${encodeURIComponent(token)}`, { headers: { Accept: 'application/json' } })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(res.status === 404 ? 'This tracking link is not valid.' : body.message || 'Tracking is temporarily unavailable')
        return
      }
      lastOk.current = Date.now()
      setError('')
      setData(body)
    } catch {
      setError('')
    }
  }, [token])
  // Keep polling (slower) in a background tab so the "arriving" announcement still plays
  usePolling(load, POLL_MS, true, { backgroundIntervalMs: 15000 })

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Animate the marker from where it is drawn to each new fix
  const fixKey = data?.location ? `${data.location.coordinates.join()}|${data.location.updatedAt}` : 'none'
  useEffect(() => {
    cancelAnimationFrame(frame.current)
    if (!data?.location || !data.remainingPath?.length) {
      shown.current = { position: null, path: null }
      setDisplay(null)
      return undefined
    }
    const target = data.location.coordinates
    const newPath = data.remainingPath
    const from = shown.current.position
    if (!from) {
      shown.current = { position: target, path: newPath }
      setDisplay({ position: target, path: newPath })
      return undefined
    }
    const oldPath = shown.current.path
    const plan = planMove(oldPath, from, target)
    const start = performance.now()
    let lastPaint = 0
    const step = t => {
      const k = Math.min(1, (t - start) / MOVE_MS)
      if (k < 1 && t - lastPaint < FRAME_MS) {
        frame.current = requestAnimationFrame(step)
        return
      }
      lastPaint = t
      const position = positionAt(plan, k, { ease: false })
      const path = k < 1 ? remainingFrom(position, oldPath) : newPath
      shown.current = { position, path }
      setDisplay({ position, path })
      if (k < 1) frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixKey])

  // Speak once each time the delivery enters the "arriving" state
  const lastStatus = useRef(null)
  useEffect(() => {
    const status = data?.status
    if (!status) return
    if (status === 'arriving' && lastStatus.current !== 'arriving') {
      speak(`${data.driver?.firstName || 'Your driver'} is arriving with your delivery. Please be ready.`)
    } else if (status === 'delivered' && lastStatus.current && lastStatus.current !== 'delivered') {
      speak('Your order has been delivered.')
    }
    lastStatus.current = status
  }, [data?.status, data?.driver?.firstName])

  const stale = Boolean(data?.location) && (data.location.stale || now - lastOk.current > (data.staleAfterSec || 60) * 1000)

  const mapData = useMemo(() => {
    if (!data) return null
    return {
      lines: display?.path?.length > 1 ? [{ id: 'remaining', coordinates: display.path, width: 4.5 }] : [],
      points: [{ id: 'home', coordinates: data.delivery.coordinates, label: '★', variant: 'current', title: 'Delivery address' }],
      driver: display?.position ? { coordinates: display.position, initials: data.driver?.initials, stale } : null
    }
  }, [data, display, stale])

  if (error && !data) {
    return (
      <div className="track-page">
        <TrackHeader />
        <div className="card m-4"><div className="card-body text-center"><p className="font-semibold">{error}</p><p className="text-sm text-muted mt-2">Check the link in your message, or contact the sender.</p></div></div>
      </div>
    )
  }
  if (!data) return <div className="track-page"><TrackHeader /><div className="page-loader"><span className="spinner" /></div></div>

  const driverName = data.driver?.firstName || 'Your driver'
  const { delivery, eta, status } = data

  return (
    <div className="track-page">
      <TrackHeader deliveryId={delivery.deliveryId} />
      <div className="track-map">
        <MapView lines={mapData.lines} points={mapData.points} driver={mapData.driver}
          fitKey={`${status}-${Boolean(display?.position)}`} height="100%" />
        {stale && <div className="track-stale" role="status"><span className="spinner spinner-sm" /> Updating location…</div>}
      </div>

      <section className="track-sheet" aria-live="polite">
        <p className="text-sm text-muted">Hi {delivery.customerFirstName}</p>
        <h1 className="track-headline">{HEADLINES[status](driverName)}</h1>
        {status === 'on_the_way' && eta && (
          <p className="track-eta">
            <span className="track-eta-value">{eta.minutes}<small>min</small></span>
            <span>away. {eta.stopsBefore ? `${eta.stopsBefore} stop${eta.stopsBefore > 1 ? 's' : ''} before yours.` : 'You\'re next.'}</span>
          </p>
        )}
        {status === 'arriving' && <p className="track-eta"><span><strong>Less than {data.arrivingRadiusM} m away</strong>. Please be ready.</span></p>}
        {status === 'packed' && <p className="track-eta"><span>Expected around <strong>{formatClock(delivery.estimatedArrival || delivery.plannedArrival)}</strong></span></p>}
        {status === 'delivered' && <p className="track-eta"><span>Delivered at <strong>{formatClock(delivery.completedAt)}</strong>. Thank you!</span></p>}
        {status === 'failed' && <p className="track-eta">{delivery.failureReason}. We&apos;ll contact you to reschedule.</p>}

        <ol className="track-timeline" aria-label="Delivery progress">
          {data.timeline.map((step, i) => {
            const current = step.done && !data.timeline[i + 1]?.done
            return (
              <li key={step.key} className={`${step.done ? 'done' : ''} ${current ? 'current' : ''}`} aria-current={current ? 'step' : undefined}>
                <span className="track-step-dot" aria-hidden="true" />
                <span className="track-step-label">{step.label}</span>
                {step.at && <span className="text-micro text-ink-400">{formatClock(step.at)}</span>}
              </li>
            )
          })}
        </ol>

        <dl className="detail-list text-sm mt-4">
          <dt>Delivering to</dt><dd>{delivery.address}</dd>
          {(delivery.windowStart || delivery.windowEnd) && <><dt>Your slot</dt><dd>{delivery.windowStart || '…'} to {delivery.windowEnd || '…'}</dd></>}
          {data.vehicle && <><dt>Vehicle</dt><dd>{data.vehicle}</dd></>}
        </dl>
      </section>
    </div>
  )
}

function TrackHeader({ deliveryId }) {
  return (
    <header className="track-header">
      <span className="brand"><HopMark size={26} />Hopr</span>
      <span className="flex items-center gap-2">
        {deliveryId && <span className="text-micro text-ink-400 whitespace-nowrap">Order {deliveryId}</span>}
        <MuteToggle />
      </span>
    </header>
  )
}
