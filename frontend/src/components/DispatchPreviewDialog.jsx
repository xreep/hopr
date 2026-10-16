import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Modal, EmptyState } from './ui'
import api, { errorMessage } from '../utils/api'
import { formatKm } from '../utils/format'

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
    <Modal title="Auto-dispatch preview" onClose={busy ? () => {} : onClose} size="lg"
      footer={preview && (
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={confirm} disabled={busy || !preview.assignments.length}>
            {busy ? 'Assigning…' : `Confirm ${preview.assignments.length} assignment${preview.assignments.length === 1 ? '' : 's'}`}
          </button>
        </>
      )}>
      {!preview ? <div className="page-loader"><span className="spinner" /></div> : (
        <>
          <p className="text-sm text-secondary mb-3">
            {preview.unassignedRoutes} unassigned route(s) · {preview.availableDrivers} available driver(s).
            Drivers are scored by proximity (live GPS, else the depot) and how well their vehicle&apos;s capacity fits the load.
          </p>
          {preview.assignments.length === 0 ? (
            <EmptyState title="Nothing can be assigned right now" />
          ) : (
            <ul className="dispatch-list">
              {preview.assignments.map(a => (
                <li key={a.route._id} className="dispatch-item">
                  <div className="dispatch-pair">
                    <span className="font-medium">{a.route.name}</span>
                    <span className="dispatch-arrow" aria-hidden="true">→</span>
                    <span className="font-medium">{a.driver.name}</span>
                    <span className="text-xs text-muted">({a.vehicle.name})</span>
                  </div>
                  <p className="text-xs text-secondary">
                    {a.route.routeId} · {a.route.stops} stops · {formatKm(a.route.totalDistance)} · {a.route.loadKg} kg · score {a.score.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted">{a.reasons.join(' · ')}</p>
                </li>
              ))}
            </ul>
          )}
          {preview.unassigned.length > 0 && (
            <div className="alert alert-warning mt-4">
              <p className="font-medium mb-1">Not assigned</p>
              <ul className="text-sm list-disc pl-5">
                {preview.unassigned.map(u => <li key={u.route._id}>{u.route.name} ({u.route.routeId}): {u.reason}</li>)}
              </ul>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
