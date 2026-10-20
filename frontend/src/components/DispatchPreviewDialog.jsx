import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Modal, EmptyState } from './ui'
import api, { errorMessage } from '../utils/api'
import { formatKm, initials } from '../utils/format'
import Icon from './icons'

// Auto-dispatch: preview "Route A → Driver X" pairs, then Confirm or Cancel
export default function DispatchPreviewDialog({ onClose, onApplied }) {
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.post('/dispatch/preview')
      .then(res => setPreview(res.data))
      .catch(err => {
        toast.error(errorMessage(err, 'Could not prepare dispatch'))
        onClose()
      })
  }, [onClose])

  const confirm = async () => {
    setBusy(true)
    try {
      const res = await api.post('/dispatch/confirm', {
        assignments: preview.assignments.map(a => ({ route: a.route._id, driver: a.driver._id, vehicle: a.vehicle._id }))
      })
      onApplied(res.data)
    } catch (err) {
      toast.error(errorMessage(err, 'Dispatch failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Auto-dispatch" onClose={busy ? () => {} : onClose} size="lg"
      footer={preview && (
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={confirm} disabled={busy || !preview.assignments.length}>
            {busy ? <><span className="spinner spinner-sm" /> Assigning</> : <><Icon name="check" />Assign {preview.assignments.length} route{preview.assignments.length === 1 ? '' : 's'}</>}
          </button>
        </>
      )}>
      {!preview ? <div className="page-loader"><span className="spinner" /></div> : (
        <>
          <p className="text-body text-ink-300 mb-4">
            {preview.unassignedRoutes} route{preview.unassignedRoutes === 1 ? ' is' : 's are'} waiting and {preview.availableDrivers} driver{preview.availableDrivers === 1 ? ' is' : 's are'} free.
            Hopr pairs them by how close each driver is (live GPS, or the depot) and how well their vehicle fits the load. Nothing changes until you confirm.
          </p>
          {preview.assignments.length === 0 ? (
            <EmptyState title="Nothing can be assigned right now" />
          ) : (
            <ul className="dispatch-list">
              {preview.assignments.map(a => (
                <li key={a.route._id} className="dispatch-item hop-seq" style={{ '--i': 0 }}>
                  <div className="dispatch-pair">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{a.route.name}</p>
                      <p className="text-micro text-ink-400">{a.route.stops} stops, {formatKm(a.route.totalDistance)}, {a.route.loadKg} kg</p>
                    </div>
                    <span className="dispatch-arrow" aria-label="assigned to"><Icon name="arrowRight" /></span>
                    <span className="avatar avatar-sm" aria-hidden="true">{initials(a.driver.name)}</span>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{a.driver.name}</p>
                      <p className="text-micro text-ink-400">{a.vehicle.name}</p>
                    </div>
                    <span className="dispatch-score" title="Match score out of 1">{a.score.toFixed(2)}</span>
                  </div>
                  <div className="score-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, a.score * 100)}%` }} /></div>
                  <p className="text-micro text-ink-300 mt-2">{a.reasons.map(r => r.charAt(0).toUpperCase() + r.slice(1)).join('. ')}.</p>
                </li>
              ))}
            </ul>
          )}
          {preview.unassigned.length > 0 && (
            <div className="alert alert-warning mt-4">
              <p className="font-medium mb-1">Can&apos;t be assigned yet</p>
              <ul className="text-small list-disc pl-5">
                {preview.unassigned.map(u => <li key={u.route._id}>{u.route.name} ({u.route.routeId}): {u.reason}</li>)}
              </ul>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
