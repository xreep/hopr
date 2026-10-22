import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import MapView, { SchematicMap } from '../components/MapView'
import useWhenIdle from '../hooks/useWhenIdle'
import usePolling from '../hooks/usePolling'
import usePageTitle from '../hooks/usePageTitle'
import { planMove, positionAt, remainingFrom } from '../utils/tracking'
import { formatClock } from '../utils/time'
import { speak } from '../utils/speak'
import MuteToggle from '../components/MuteToggle'
import { HopMark } from '../components/icons'
import { useT } from '../i18n/language'
import { translateKnown } from '../i18n/strings'
import { LanguageProvider, LanguageToggle } from '../components/LanguageProvider'

const API_BASE = import.meta.env.VITE_API_URL || '/api'
const POLL_MS = 5000
const MOVE_MS = 4800 // just under the poll interval: the marker keeps gliding between fixes
const FRAME_MS = 33

export default function Track() {
  return <LanguageProvider><TrackDelivery /></LanguageProvider>
}

function TrackDelivery() {
  const { token } = useParams()
  const { t, lang } = useT()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  usePageTitle(t('track.pageTitle'))
  const [display, setDisplay] = useState(null) // { position, path }
  const [now, setNow] = useState(Date.now())
  const lastOk = useRef(0)
  const streetMap = useWhenIdle()
  const shown = useRef({ position: null, path: null })
  const frame = useRef(0)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/track/${encodeURIComponent(token)}`, { headers: { Accept: 'application/json' } })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(res.status === 404 ? 'track.invalid' : res.status === 410 ? 'track.expired' : 'track.unavailable')
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
      speak(t('track.say.arriving', { driver: data.driver?.firstName || t('track.yourDriver') }), { lang })
    } else if (status === 'delivered' && lastStatus.current && lastStatus.current !== 'delivered') {
      speak(t('track.say.delivered'), { lang })
    }
    lastStatus.current = status
    // Announce on status changes only, not when the language changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <div className="card m-4"><div className="card-body text-center"><p className="font-semibold">{t(error)}</p><p className="text-sm text-muted mt-2">{t('track.checkLink')}</p></div></div>
      </div>
    )
  }
  if (!data) return <div className="track-page"><TrackHeader /><div className="page-loader"><span className="spinner" /></div></div>

  const driverName = data.driver?.firstName || t('track.yourDriver')
  const { delivery, eta, status } = data

  return (
    <div className="track-page">
      <TrackHeader deliveryId={delivery.deliveryId} />
      <main className="track-main">
        <div className="track-map">
          {streetMap
            ? <MapView lines={mapData.lines} points={mapData.points} driver={mapData.driver} fitKey={`${status}-${Boolean(display?.position)}`} height="100%" />
            : <SchematicMap lines={mapData.lines} points={mapData.points} driver={mapData.driver} fitKey={`${status}-${Boolean(display?.position)}`} height="100%" />}
          {stale && <div className="track-stale" role="status"><span className="spinner spinner-sm" /> {t('track.updating')}</div>}
        </div>

        <section className="track-sheet" aria-live="polite">
          <p className="text-sm text-muted">{t('track.hi', { name: delivery.customerFirstName })}</p>
          <h1 className="track-headline">{t(`track.${status}`, { driver: driverName })}</h1>
          {status === 'on_the_way' && eta && (
            <p className="track-eta">
              <span className="track-eta-value">{eta.minutes}<small>{t('common.min')}</small></span>
              <span>{t('track.away')} {eta.stopsBefore > 1 ? t('track.stopsBefore', { n: eta.stopsBefore }) : eta.stopsBefore === 1 ? t('track.oneStopBefore') : t('track.youreNext')}</span>
            </p>
          )}
          {status === 'arriving' && <p className="track-eta"><span><strong>{t('track.arrivingSoon', { m: data.arrivingRadiusM })}</strong>. {t('track.beReady')}</span></p>}
          {status === 'packed' && <p className="track-eta"><span>{t('track.expected')} <strong>{formatClock(delivery.estimatedArrival || delivery.plannedArrival)}</strong></span></p>}
          {status === 'delivered' && <p className="track-eta"><span>{t('track.deliveredAt')} <strong>{formatClock(delivery.completedAt)}</strong>. {t('track.thanks')}</span></p>}
          {status === 'failed' && <p className="track-eta">{t('track.reschedule', { reason: translateKnown(lang, 'fail', delivery.failureReason) })}</p>}
          {data.demo && <p className="text-micro text-ink-400 mt-2">{t('track.demo', { n: data.demo.speedup })}</p>}

          <ol className="track-timeline" aria-label={t('track.progress')}>
            {data.timeline.map((step, i) => {
              const current = step.done && !data.timeline[i + 1]?.done
              return (
                <li key={step.key} className={`${step.done ? 'done' : ''} ${current ? 'current' : ''}`} aria-current={current ? 'step' : undefined}>
                  <span className="track-step-dot" aria-hidden="true" />
                  <span className="track-step-label">{t(`track.step.${step.key}`)}</span>
                  {step.at && <span className="text-micro text-ink-400">{formatClock(step.at)}</span>}
                </li>
              )
            })}
          </ol>

          <dl className="detail-list text-sm mt-4">
            <dt>{t('track.deliveringTo')}</dt><dd>{delivery.address}</dd>
            {(delivery.windowStart || delivery.windowEnd) && <><dt>{t('track.slot')}</dt><dd>{t('track.slotRange', { from: delivery.windowStart || '…', to: delivery.windowEnd || '…' })}</dd></>}
            {data.vehicle && <><dt>{t('track.vehicle')}</dt><dd>{translateKnown(lang, 'vehicle', data.vehicle)}</dd></>}
          </dl>
        </section>
      </main>
    </div>
  )
}

function TrackHeader({ deliveryId }) {
  const { t } = useT()
  return (
    <header className="track-header">
      <span className="brand"><HopMark size={26} />Hopr</span>
      <span className="flex items-center gap-2">
        {deliveryId && <span className="text-micro text-ink-400 whitespace-nowrap hidden sm:inline">{t('track.order', { id: deliveryId })}</span>}
        <LanguageToggle />
        <MuteToggle />
      </span>
    </header>
  )
}
