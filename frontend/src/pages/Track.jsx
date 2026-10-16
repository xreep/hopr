import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import MapView from '../components/MapView'
import usePolling from '../hooks/usePolling'
import { planMove, positionAt, remainingFrom } from '../utils/tracking'
import { formatClock } from '../utils/time'

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
  usePolling(load, POLL_MS)

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

  const stale = Boolean(data?.location) && (data.location.stale || now - lastOk.current > (data.staleAfterSec || 60) * 1000)

  const mapData = useMemo(() => {
    if (!data) return null
    return {
      lines: display?.path?.length > 1 ? [{ id: 'remaining', coordinates: display.path, color: '#2563eb', width: 5 }] : [],
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
          fitKey={`${status}-${Boolean(data.location)}`} height="100%" />
        {stale && <div className="track-stale" role="status">Updating location…</div>}
      </div>

      <section className="track-sheet" aria-live="polite">
        <p className="text-sm text-muted">Hi {delivery.customerFirstName}</p>
        <h1 className="track-headline">{HEADLINES[status](driverName)}</h1>
        {status === 'on_the_way' && eta && (
          <p className="track-eta"><strong>{eta.minutes} min</strong> away{eta.stopsBefore ? ` · ${eta.stopsBefore} stop${eta.stopsBefore > 1 ? 's' : ''} before yours` : ' · you\'re next'}</p>
        )}
        {status === 'arriving' && <p className="track-eta"><strong>Less than {data.arrivingRadiusM} m away</strong>. Please be ready.</p>}
        {status === 'packed' && <p className="track-eta">Expected around <strong>{formatClock(delivery.estimatedArrival || delivery.plannedArrival)}</strong></p>}
        {status === 'delivered' && <p className="track-eta">Delivered at <strong>{formatClock(delivery.completedAt)}</strong>. Thank you!</p>}
        {status === 'failed' && <p className="track-eta">{delivery.failureReason}. We&apos;ll contact you to reschedule.</p>}

        <ol className="track-timeline">
          {data.timeline.map((step, i) => {
            const current = !step.done ? false : !data.timeline[i + 1]?.done
            return (
              <li key={step.key} className={`${step.done ? 'done' : ''} ${current ? 'current' : ''}`}>
                <span className="track-step-dot" aria-hidden="true" />
                <span>{step.label}</span>
                {step.at && <span className="text-xs text-muted">{formatClock(step.at)}</span>}
              </li>
            )
          })}
        </ol>

        <dl className="detail-list text-sm mt-4">
          <dt>Delivering to</dt><dd>{delivery.address}</dd>
          {(delivery.windowStart || delivery.windowEnd) && <><dt>Your slot</dt><dd>{delivery.windowStart || '…'}–{delivery.windowEnd || '…'}</dd></>}
          {data.vehicle && <><dt>Vehicle</dt><dd>{data.vehicle}</dd></>}
        </dl>
      </section>
    </div>
  )
}

function TrackHeader({ deliveryId }) {
  return (
    <header className="track-header">
      <span className="brand">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
        Hopr
      </span>
      <span className="flex items-center gap-2">
        {deliveryId && <span className="text-xs text-muted font-mono">{deliveryId}</span>}
        <span id="track-header-extras" />
      </span>
    </header>
  )
}
