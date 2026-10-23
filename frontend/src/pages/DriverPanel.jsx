import { useCallback, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import api, { errorMessage } from '../utils/api'
import usePolling from '../hooks/usePolling'
import MapView from '../components/MapView'
import { Modal, StatusBadge, EmptyState, PageLoader } from '../components/ui'
import ProofOfDeliveryDialog from '../components/ProofOfDeliveryDialog'
import { formatKm, initials } from '../utils/format'
import { formatClock } from '../utils/time'
import { stopTiming } from '../utils/stopTiming'
import { stopVariant, isStale } from '../utils/routeView'
import { useAuth } from '../context/AuthContext'
import useDriverLocation from '../hooks/useDriverLocation'
import { speak } from '../utils/speak'
import Icon from '../components/icons'
import { useT } from '../i18n/language'
import { translateKnown, durationIn } from '../i18n/strings'
import { LanguageProvider, LanguageToggle } from '../components/LanguageProvider'
import useOfflineSync from '../hooks/useOfflineSync'
import { sendUpdate, queueUpdate, isNetworkError, outboxList } from '../offline/outbox'
import { saveRoutes, loadRoutes } from '../offline/store'
import { applyLocal, applyPending } from '../offline/applyLocal'

const FAILURE_REASONS = ['Customer not available', 'Address not found', 'Customer refused delivery', 'Access restricted / gate locked', 'Package damaged']

const directionsUrl = stop => `https://www.google.com/maps/dir/?api=1&destination=${stop.coordinates[1]},${stop.coordinates[0]}&travelmode=driving`

export default function DriverPanel() {
  return <LanguageProvider><DriverDeliveries /></LanguageProvider>
}

function DriverDeliveries() {
  const { user } = useAuth()
  const { t, lang } = useT()
  const say = text => speak(text, { lang })
  const [routes, setRoutes] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [dialog, setDialog] = useState(null) // { kind: 'pod' | 'fail' | 'issue', stop }
  const knownIds = useRef(null)
  const [fromCache, setFromCache] = useState(false)
  const userId = user?._id

  // Routes from the server (kept on the phone for offline use), or the copy on the phone
  // when there's no signal, with any updates still waiting to send laid over them
  const load = useCallback(async () => {
    let list
    try {
      const res = await api.get('/routes/driver/assigned')
      list = res.data.routes
      setFromCache(false)
      saveRoutes(userId, list).catch(() => {})
    } catch (err) {
      if (!isNetworkError(err)) throw err
      const saved = await loadRoutes(userId).catch(() => null)
      list = saved?.routes || []
      setFromCache(true)
    }
    const waiting = await outboxList(userId).catch(() => [])
    list = applyPending(list, waiting).filter(r => r.status === 'planned' || r.status === 'active')
    // Announce routes that appeared since the last poll
    if (knownIds.current) {
      const fresh = list.filter(r => !knownIds.current.has(r._id))
      fresh.forEach(r => toast.success(t('driver.toast.newRoute', { name: r.name, n: r.stops.length })))
      if (fresh.length) {
        speak(fresh.length === 1
          ? t('driver.say.newRoute', { name: fresh[0].name, n: fresh[0].stops.length })
          : t('driver.say.newRoutes', { n: fresh.length }), { lang })
      }
    }
    knownIds.current = new Set(list.map(r => r._id))
    setRoutes(list)
    setSelectedId(prev => (prev && list.some(r => r._id === prev) ? prev : (list.find(r => r.status === 'active') || list[0])?._id || null))
  }, [t, lang, userId])
  usePolling(load, 15000)
  const sync = useOfflineSync(userId, useCallback(result => {
    if (result.sent && !result.remaining) toast.success(t('offline.synced'))
    load()
  }, [t, load]))

  const route = routes?.find(r => r._id === selectedId) || null
  const gps = useDriverLocation(route)
  const [picking, setPicking] = useState(false)
  const currentIndex = route ? route.stops.findIndex(s => s.status === 'pending' || s.status === 'in_progress') : -1
  const currentStop = currentIndex >= 0 ? route.stops[currentIndex] : null
  const timing = currentStop ? stopTiming(currentStop, Date.now(), lang, route.plannedStart) : null

  const applyRoute = updated => {
    setRoutes(prev => {
      if (!prev) return prev
      if (updated.status === 'completed' || updated.status === 'cancelled') return prev.filter(r => r._id !== updated._id)
      return prev.map(r => (r._id === updated._id ? { ...r, ...updated, vehicle: r.vehicle } : r))
    })
  }

  // Send an update now, or keep it on the phone when there's no signal. Either way the
  // screen moves on, and success() announces what happened.
  const act = async (update, success) => {
    const item = { ...update, routeId: route._id, at: new Date().toISOString() }
    setBusy(true)
    try {
      let updated
      try {
        const res = await sendUpdate(item)
        updated = res.data.route
      } catch (err) {
        if (!isNetworkError(err)) throw err
        await queueUpdate(userId, item)
        updated = applyLocal(route, item)
      }
      if (updated) applyRoute(updated)
      if (success) toast.success(success(updated || route))
      return true
    } catch (err) {
      toast.error(errorMessage(err, t('driver.toast.updateFailed')))
      return false
    } finally {
      setBusy(false)
    }
  }

  const startRoute = () => act({ kind: 'start' }, () => t('driver.toast.started'))
  const setStatus = (stop, status, reason) => act(
    { kind: 'status', stopId: stop._id, body: { status, ...(reason && { reason }) } },
    updated => {
      say(`${t('driver.say.failed')} ${updated.status === 'completed' ? t('driver.say.allDone') : nextStopPhrase(updated, t)}`)
      return updated.status === 'completed' ? t('driver.toast.routeDone') : t('driver.toast.failed')
    }
  )

  const mapData = useMemo(() => {
    if (!route) return null
    return {
      lines: [{ id: 'r', coordinates: route.geometry?.coordinates || [], width: 4.5 }],
      points: [
        ...(route.depot?.coordinates ? [{ id: 'depot', coordinates: route.depot.coordinates, label: 'H', variant: 'depot', title: route.depot.name }] : []),
        ...route.stops.map((s, i) => ({ id: s._id, coordinates: s.coordinates, label: s.sequence, variant: stopVariant(s, i === currentIndex), title: s.address }))
      ],
      driver: gps.position
        ? { coordinates: gps.position, initials: initials(user?.name), stale: false }
        : route.driverLocation?.coordinates?.length === 2
          ? { coordinates: route.driverLocation.coordinates, initials: initials(user?.name), stale: isStale(route.driverLocation.updatedAt) }
          : null
    }
  }, [route, currentIndex, user, gps.position])

  if (!routes) return <PageLoader />

  return (
    <div className="driver-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('driver.title')}</h1>
          <p className="page-subtitle">{t('driver.subtitle')}</p>
        </div>
        <LanguageToggle />
      </div>

      {(!sync.online || sync.pending > 0 || fromCache) && (
        <div className="offline-bar" role="status">
          <p className="text-small">
            {!sync.online ? t('offline.banner') : fromCache ? t('offline.cachedRoutes') : null}
            {sync.pending > 0 && <strong className="block">{sync.pending === 1 ? t('offline.pendingOne') : t('offline.pendingMany', { n: sync.pending })}</strong>}
          </p>
          {sync.pending > 0 && sync.online && (
            <button type="button" className="btn btn-outline btn-sm" onClick={sync.flush} disabled={sync.syncing}>
              {sync.syncing ? t('offline.sending') : t('offline.sendNow')}
            </button>
          )}
        </div>
      )}

      {routes.length === 0 ? (
        <div className="card"><EmptyState title={t('driver.noRoutes')}>{t('driver.noRoutesHint')}</EmptyState></div>
      ) : (
        <div className="driver-grid">
          <aside className="card driver-routes">
            <div className="card-header"><h3 className="font-semibold">{t('driver.routes', { count: routes.length })}</h3></div>
            <ul>
              {routes.map(r => {
                const done = r.stops.filter(s => s.status === 'completed' || s.status === 'failed').length
                return (
                  <li key={r._id}>
                    <button type="button" className={`route-select ${r._id === selectedId ? 'active' : ''}`} onClick={() => setSelectedId(r._id)}>
                      <span className="flex-between gap-2"><span className="font-medium truncate">{r.name}</span><StatusBadge status={r.status} /></span>
                      <span className="text-micro text-ink-400">{t('driver.routeSummary', { done, total: r.stops.length, km: formatKm(r.totalDistance), time: durationIn(lang, r.estimatedTime) })}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </aside>

          {route && (
            <section className="space-y-4">
              <div className="card overflow-hidden">
                <MapView lines={mapData.lines} points={mapData.points} driver={mapData.driver} fitKey={route._id} height={300}
                  onMapClick={picking ? async coords => { await gps.sendManual(coords); setPicking(false); toast.success(t('driver.toast.locationUpdated')) } : undefined} />
                {route.status === 'active' && (
                  <LocationBar gps={gps} picking={picking} setPicking={setPicking} canSimulate={route.geometry?.coordinates?.length > 1} isDemo={route.isDemo} />
                )}
                <div className="card-body flex-between flex-wrap gap-3">
                  <div>
                    <p className="font-semibold">{route.name}</p>
                    <p className="flex flex-wrap items-center gap-1.5 mt-1 text-micro text-ink-400"><span className="route-plate">{route.routeId}</span>{route.vehicle ? `${route.vehicle.name} (${route.vehicle.licensePlate})` : ''}</p>
                  </div>
                  <div className="flex gap-2">
                    <Link to={`/routes/${route._id}`} className="btn btn-ghost btn-sm">{t('driver.details')}</Link>
                    {route.status === 'planned' && <button type="button" className="btn btn-primary" onClick={startRoute} disabled={busy}><Icon name="play" />{t('driver.start')}</button>}
                  </div>
                </div>
              </div>

              {currentStop ? (
                <div className="card current-stop">
                  <div className="card-header flex-between">
                    <span className="text-sm text-muted">{t('driver.stopOf', { n: currentStop.sequence, total: route.stops.length })}</span>
                    <StatusBadge status={currentStop.priority} />
                  </div>
                  <div className="card-body space-y-3">
                    <div>
                      <p className="text-lg font-semibold">{currentStop.customerName || t('common.customer')}</p>
                      <p className="text-secondary">{currentStop.address}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2">
                        <p className="text-sm">
                          {timing.late ? t('driver.plannedFor') : t('driver.eta')} <strong>{timing.eta}</strong>
                          {timing.relative && <span className={timing.late ? 'text-signal-amber' : 'text-ink-300'}>, {timing.relative}</span>}
                        </p>
                        {timing.window && <span className={`window-chip is-${timing.windowState}`}><Icon name="clock" size={14} />{timing.window}</span>}
                      </div>
                      {currentStop.notes && <p className="alert alert-info mt-2 text-sm">{currentStop.notes}</p>}
                      {currentStop.packageWeightKg > 0 && <p className="text-micro text-ink-400 mt-1">{t('driver.parcel', { id: currentStop.deliveryId, kg: currentStop.packageWeightKg, size: t(`driver.size.${currentStop.packageSize || 'small'}`) })}</p>}
                    </div>
                    <div className="driver-actions">
                      <a className="btn btn-secondary dock-duplicate" target="_blank" rel="noopener noreferrer" href={directionsUrl(currentStop)}>
                        <Icon name="navigation" />{t('driver.navigate')}
                      </a>
                      {currentStop.customerPhone && <a className="btn btn-outline" href={`tel:${currentStop.customerPhone}`}><Icon name="phone" />{t('driver.call')}</a>}
                      {currentStop.trackingToken && <ShareTrackingButton token={currentStop.trackingToken} name={currentStop.customerName} />}
                      <button type="button" className="btn btn-success dock-duplicate" disabled={busy} onClick={() => setDialog({ kind: 'pod', stop: currentStop })}><Icon name="check" />{t('driver.markDelivered')}</button>
                      <button type="button" className="btn btn-danger dock-duplicate" disabled={busy} onClick={() => setDialog({ kind: 'fail', stop: currentStop })}><Icon name="x" />{t('driver.couldNotDeliver')}</button>
                      <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setDialog({ kind: 'issue', stop: currentStop })}><Icon name="flag" />{t('driver.report')}</button>
                    </div>
                  </div>
                  {/* Phones: the three actions a driver needs at the door stay under the thumb.
                      Portalled to <body>: the glass card's backdrop-filter would otherwise trap position: fixed */}
                  {createPortal(<div className="driver-dock" role="toolbar" aria-label={t('driver.actionsFor', { n: currentStop.sequence })}>
                    <a className="btn btn-secondary btn-icon" target="_blank" rel="noopener noreferrer" href={directionsUrl(currentStop)} aria-label={t('driver.navigateLabel')}>
                      <Icon name="navigation" size={20} />
                    </a>
                    <button type="button" className="btn btn-danger" disabled={busy} onClick={() => setDialog({ kind: 'fail', stop: currentStop })}><Icon name="x" />{t('driver.couldNotDeliver')}</button>
                    <button type="button" className="btn btn-success" disabled={busy} onClick={() => setDialog({ kind: 'pod', stop: currentStop })}><Icon name="check" />{t('driver.delivered')}</button>
                  </div>, document.body)}
                </div>
              ) : (
                <div className="card"><EmptyState title={t('driver.allDone')} /></div>
              )}

              <div className="card">
                <div className="card-header"><h3 className="font-semibold">{t('driver.allStops')}</h3></div>
                <ol className="timeline card-body">
                  {route.stops.map((s, i) => (
                    <li key={s._id} className={`timeline-item status-${s.status} ${i === currentIndex ? 'current' : ''}`}>
                      <span className="timeline-dot">{s.sequence}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex-between gap-2">
                          <p className="font-medium truncate">{s.customerName || s.address.split(',')[0]}</p>
                          <span className="flex items-center gap-1.5">
                            {s.pendingSync && <span className="badge badge-warning">{t('offline.waiting')}</span>}
                            <StatusBadge status={s.status} />
                          </span>
                        </div>
                        <p className="text-xs text-muted truncate">{s.address}</p>
                        <p className="text-xs">{s.status === 'completed' ? t('driver.deliveredAt', { time: formatClock(s.completedAt) }) : s.status === 'failed' ? t('driver.failedBecause', { reason: translateKnown(lang, 'fail', s.failureReason) }) : t('driver.etaAt', { time: formatClock(s.estimatedArrival) })}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          )}
        </div>
      )}

      {dialog?.kind === 'pod' && (
        <ProofOfDeliveryDialog stop={dialog.stop} onClose={() => setDialog(null)} onSubmit={async proof => {
          const ok = await act({ kind: 'complete', stopId: dialog.stop._id, body: proof }, updated => {
            say(`${t('driver.say.delivered')} ${updated.status === 'completed' ? t('driver.say.routeDone') : nextStopPhrase(updated, t)}`)
            return updated.status === 'completed' ? t('driver.toast.routeDone') : t('driver.toast.delivered')
          })
          if (ok) setDialog(null)
          return ok
        }} />
      )}
      {dialog?.kind === 'fail' && (
        <FailDialog stop={dialog.stop} onClose={() => setDialog(null)} onSubmit={async reason => {
          const res = await setStatus(dialog.stop, 'failed', reason)
          if (res) setDialog(null)
        }} />
      )}
      {dialog?.kind === 'issue' && (
        <IssueDialog stop={dialog.stop} onClose={() => setDialog(null)} onSubmit={async body => {
          const res = await act({ kind: 'issue', stopId: dialog.stop._id, body }, () => (body.type === 'delay' ? t('driver.toast.delay') : t('driver.toast.issue')))
          if (res) setDialog(null)
        }} />
      )}
    </div>
  )
}

function FailDialog({ stop, onClose, onSubmit }) {
  const { t } = useT()
  const [reason, setReason] = useState(FAILURE_REASONS[0])
  const [other, setOther] = useState('')
  const final = reason === 'Other' ? other.trim() : reason
  return (
    <Modal title={t('fail.title', { name: stop.customerName || stop.address.split(',')[0] })} onClose={onClose}>
      <fieldset className="space-y-2">
        <legend className="form-label">{t('fail.question')}</legend>
        {[...FAILURE_REASONS, 'Other'].map(r => (
          <label key={r} className="toggle-row">
            <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} /> <span>{t(`fail.${r}`)}</span>
          </label>
        ))}
        {reason === 'Other' && <input className="form-input" aria-label={t('fail.describe')} value={other} onChange={e => setOther(e.target.value)} maxLength={300} autoFocus />}
      </fieldset>
      <div className="flex justify-end gap-2 mt-4">
        <button type="button" className="btn btn-outline" onClick={onClose}>{t('common.cancel')}</button>
        <button type="button" className="btn btn-danger" disabled={!final} onClick={() => onSubmit(final)}>{t('fail.submit')}</button>
      </div>
    </Modal>
  )
}

function IssueDialog({ stop, onClose, onSubmit }) {
  const { t } = useT()
  const [type, setType] = useState('delay')
  const [delayMinutes, setDelay] = useState(15)
  const [description, setDescription] = useState('')
  const valid = type === 'delay' ? delayMinutes >= 1 && delayMinutes <= 600 : description.trim().length > 0
  return (
    <Modal title={t('issue.title', { n: stop.sequence })} onClose={onClose}>
      <div className="tabs mb-3" role="radiogroup" aria-label={t('issue.type')}>
        <button type="button" role="radio" aria-checked={type === 'delay'} className={`tab ${type === 'delay' ? 'active' : ''}`} onClick={() => setType('delay')}>{t('issue.late')}</button>
        <button type="button" role="radio" aria-checked={type === 'issue'} className={`tab ${type === 'issue' ? 'active' : ''}`} onClick={() => setType('issue')}>{t('issue.other')}</button>
      </div>
      {type === 'delay' && (
        <div className="form-group">
          <label htmlFor="delay" className="form-label">{t('issue.delay')}</label>
          <input id="delay" type="number" min="1" max="600" className="form-input" value={delayMinutes} onChange={e => setDelay(Number(e.target.value))} />
          <p className="text-xs text-muted mt-1">{t('issue.delayHint')}</p>
        </div>
      )}
      <div className="form-group">
        <label htmlFor="desc" className="form-label">{type === 'delay' ? t('issue.cause') : t('issue.what')}</label>
        <textarea id="desc" className="form-input" rows={3} value={description} onChange={e => setDescription(e.target.value)} maxLength={500}
          placeholder={type === 'delay' ? t('issue.causeExample') : t('issue.whatExample')} />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn btn-outline" onClick={onClose}>{t('common.cancel')}</button>
        <button type="button" className="btn btn-primary" disabled={!valid}
          onClick={() => onSubmit(type === 'delay' ? { type, delayMinutes, description: description.trim() || undefined } : { type, description: description.trim() })}>
          {t('issue.send')}
        </button>
      </div>
    </Modal>
  )
}

function nextStopPhrase(route, t) {
  const next = route.stops?.find(s => s.status === 'pending' || s.status === 'in_progress')
  return next ? t('driver.say.next', { name: next.customerName || next.address.split(',')[0] }) : ''
}

function LocationBar({ gps, picking, setPicking, canSimulate, isDemo }) {
  const { t, ago } = useT()
  const problem = ['denied', 'unavailable', 'error'].includes(gps.status) && gps.mode === 'gps'
  return (
    <div className={`location-bar ${gps.status === 'live' ? 'live' : problem ? 'problem' : ''}`} role="status" aria-live="polite">
      <div className="min-w-0">
        <p className="text-sm font-medium">
          <span className="gps-dot" aria-hidden="true" />
          {gps.mode === 'simulate' ? t('gps.simulated') : gps.mode === 'manual' ? t('gps.manual') : t(`gps.${gps.status}`)}
        </p>
        <p className="text-xs text-muted">
          {gps.lastSentAt ? t('gps.lastUpdate', { ago: ago(gps.lastSentAt) }) : t('gps.customersSee')}
          {gps.error && <span className="text-error">. {gps.error}</span>}
          {problem && `. ${t('gps.problemHint')}`}
        </p>
      </div>
      <div className="flex gap-2 flex-wrap">
        <button type="button" className="btn btn-outline btn-sm" onClick={async () => {
          gps.setMode('gps')
          const ok = await gps.updateNow()
          if (ok) toast.success(t('driver.toast.locationUpdated'))
          else toast.error(t('driver.toast.noGps'))
        }}>{t('gps.update')}</button>
        <button type="button" className={`btn btn-sm ${picking ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={picking} onClick={() => setPicking(p => !p)}>
          {picking ? t('gps.tapMap') : t('gps.pick')}
        </button>
        {canSimulate && (isDemo || problem || gps.mode === 'simulate') && (
          <button type="button" className={`btn btn-sm ${gps.mode === 'simulate' ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={gps.mode === 'simulate'}
            onClick={() => gps.setMode(gps.mode === 'simulate' ? 'gps' : 'simulate')}>
            {gps.mode === 'simulate' ? t('gps.stopDemo') : t('gps.startDemo')}
          </button>
        )}
      </div>
    </div>
  )
}

function ShareTrackingButton({ token, name }) {
  const { t } = useT()
  const url = `${window.location.origin}/track/${token}`
  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: t('share.title'), text: t('share.text', { name: name || '' }).replace(' ,', ','), url })
      } else {
        await navigator.clipboard.writeText(url)
        toast.success(t('share.copied'))
      }
    } catch { /* share sheet dismissed */ }
  }
  return <button type="button" className="btn btn-outline" onClick={share}><Icon name="share" />{t('share.button')}</button>
}
