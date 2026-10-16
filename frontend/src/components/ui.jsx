import { useEffect, useRef } from 'react'

export function Spinner({ label = 'Loading' }) {
  return <span className="spinner" role="status" aria-label={label} />
}

export function PageLoader() {
  return (
    <div className="page-loader">
      <Spinner />
    </div>
  )
}

const STATUS_VARIANTS = {
  // stops
  pending: 'badge-warning',
  in_progress: 'badge-primary',
  completed: 'badge-success',
  failed: 'badge-error',
  // routes
  planned: 'badge-info',
  active: 'badge-primary',
  cancelled: 'badge-error',
  // vehicles / users
  maintenance: 'badge-warning',
  inactive: 'badge-error',
  // priority
  urgent: 'badge-error',
  standard: 'badge-primary',
  low: 'badge-success',
  // windows
  on_time: 'badge-success',
  early: 'badge-info',
  late: 'badge-error'
}

const STATUS_LABELS = { in_progress: 'In progress', on_time: 'On time', ev_van: 'EV van' }

export function StatusBadge({ status, label, className = '' }) {
  if (!status) return null
  return (
    <span className={`badge ${STATUS_VARIANTS[status] || 'badge-info'} ${className}`}>
      {label || STATUS_LABELS[status] || status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')}
    </span>
  )
}

export function Modal({ title, onClose, children, footer, size = 'md', labelledBy = 'modal-title' }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    const previous = document.activeElement
    dialogRef.current?.querySelector('input, select, textarea, button')?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className={`modal modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={e => e.stopPropagation()}
      >
        <div className="card-header flex-between">
          <h3 id={labelledBy} className="font-semibold">{title}</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close dialog">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="empty-state">
      <p className="font-medium">{title}</p>
      {children && <p className="text-sm text-muted mt-1">{children}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

// KPI tile. `value` null renders an em dash (no data) rather than a misleading zero.
export function StatCard({ label, value, suffix = '', hint, trend, trendGoodWhen = 'up', tone }) {
  const hasValue = value !== null && value !== undefined
  let trendClass = ''
  if (trend !== null && trend !== undefined && trend !== 0) {
    const good = trendGoodWhen === 'up' ? trend > 0 : trend < 0
    trendClass = good ? 'positive' : 'negative'
  }
  return (
    <div className="card stats-card">
      <p className="stats-label">{label}</p>
      <p className={`stats-value ${tone ? `text-${tone}` : ''}`}>
        {hasValue ? value : '—'}{hasValue && suffix ? <span className="stats-suffix">{suffix}</span> : null}
      </p>
      {trend !== null && trend !== undefined && (
        <span className={`stats-trend ${trendClass}`}>
          {trend > 0 ? '▲' : trend < 0 ? '▼' : '■'} {Math.abs(trend)} vs previous period
        </span>
      )}
      {hint && <p className="text-xs text-muted mt-1">{hint}</p>}
    </div>
  )
}

export function Field({ label, htmlFor, children, hint, error }) {
  return (
    <div className="form-group">
      {label && <label htmlFor={htmlFor} className="form-label">{label}</label>}
      {children}
      {hint && !error && <p className="text-xs text-muted mt-1">{hint}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  )
}
