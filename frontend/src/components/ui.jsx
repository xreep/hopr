import { useEffect, useRef } from 'react'
import Icon from './icons'
import HopLine from './HopLine'
import useCountUp from '../hooks/useCountUp'

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

// Accent discipline: only live work is lime. Done is neutral, at-risk amber, failed coral.
const STATUS_VARIANTS = {
  active: 'badge-live',
  in_progress: 'badge-live',
  live: 'badge-live',
  completed: 'badge-done',
  on_time: 'badge-done',
  planned: 'badge-neutral',
  in_service: 'badge-done',
  enabled: 'badge-done',
  on_route: 'badge-live',
  pending: 'badge-neutral',
  standard: 'badge-neutral',
  low: 'badge-neutral',
  early: 'badge-neutral',
  inactive: 'badge-neutral',
  urgent: 'badge-warning',
  late: 'badge-warning',
  maintenance: 'badge-warning',
  failed: 'badge-error',
  cancelled: 'badge-error'
}

const STATUS_LABELS = { in_progress: 'In progress', on_time: 'On time', ev_van: 'EV van', in_service: 'In service', enabled: 'Active', on_route: 'On a route' }

export function StatusBadge({ status, label, className = '' }) {
  if (!status) return null
  return (
    <span className={`badge ${STATUS_VARIANTS[status] || 'badge-neutral'} ${className}`}>
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
    dialogRef.current?.querySelector('input, select, textarea, button:not([data-close])')?.focus()
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
        <div className="card-header flex-between gap-3">
          <h3 id={labelledBy}>{title}</h3>
          <button type="button" data-close className="btn btn-ghost btn-sm btn-icon" onClick={onClose} aria-label="Close dialog">
            <Icon name="x" />
          </button>
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
      <p>{title}</p>
      {children && <p className="text-small mt-1 max-w-[46ch]">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

function CountValue({ value, decimals, format }) {
  const animated = useCountUp(value, { decimals })
  return format ? format(animated) : animated.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

// KPI tile. Numbers count up; null renders an em dash (no data) rather than a misleading zero.
// `isKey` lights the number in volt: use for at most one tile per row.
export function StatCard({ label, value, suffix = '', hint, trend, trendGoodWhen = 'up', trendUnit = '', decimals, format, isKey = false, spark, sparkLabel }) {
  const hasValue = value !== null && value !== undefined
  const numeric = typeof value === 'number' && Number.isFinite(value)
  const places = decimals ?? (numeric && !Number.isInteger(value) ? 1 : 0)
  let trendClass = ''
  if (trend !== null && trend !== undefined && trend !== 0) {
    const good = trendGoodWhen === 'up' ? trend > 0 : trend < 0
    trendClass = good ? 'positive' : 'negative'
  }
  return (
    <div className="card stats-card">
      <p className="stats-label">{label}</p>
      <p className={`stats-value ${isKey && hasValue ? 'is-key' : ''}`}>
        {!hasValue ? '—' : numeric ? <CountValue value={value} decimals={places} format={format} /> : value}
        {hasValue && suffix ? <span className="stats-suffix">{suffix}</span> : null}
      </p>
      {hint && <p className="stats-hint">{hint}</p>}
      {spark?.length > 1 && spark.some(v => v > 0) && (
        <div className="mt-3">
          <HopLine values={spark} height={36} label={sparkLabel || `${label} trend`} />
        </div>
      )}
      {trend !== null && trend !== undefined && (
        <span className={`stats-trend ${trendClass}`}>
          {trend > 0 ? '+' : trend < 0 ? '−' : '±'}{Math.abs(trend)}{trendUnit} vs previous period
        </span>
      )}
    </div>
  )
}

export function Field({ label, htmlFor, children, hint, error }) {
  return (
    <div className="form-group">
      {label && <label htmlFor={htmlFor} className="form-label">{label}</label>}
      {children}
      {hint && !error && <p className="text-micro text-ink-400 mt-1">{hint}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  )
}
