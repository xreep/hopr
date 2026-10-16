import { useEffect, useId, useRef, useState } from 'react'
import { fetchSuggestions } from '../utils/geocoding'

const MIN_CHARS = 3
const DEBOUNCE_MS = 300

// Search-as-you-type address input (geocoding lives in utils/geocoding.js).
export default function AddressAutocomplete({
  id,
  value,
  coordinates,
  onChange,
  onSelect,
  placeholder = 'Search an address in Ranchi',
  ariaLabel,
  disabled = false,
  className = ''
}) {
  const autoId = useId()
  const inputId = id || `addr-${autoId}`
  const listId = `${inputId}-list`
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const typedRef = useRef(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!typedRef.current) return undefined
    const q = (value || '').trim()
    if (q.length < MIN_CHARS) {
      setSuggestions([])
      setOpen(false)
      return undefined
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      setError('')
      try {
        const results = await fetchSuggestions(q, { signal: controller.signal })
        setSuggestions(results)
        setOpen(true)
        setActive(results.length ? 0 : -1)
      } catch (err) {
        if (err.name !== 'AbortError' && err.name !== 'CanceledError') {
          setError('Address search is unavailable right now')
          setSuggestions([])
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [value])

  useEffect(() => {
    const onDocClick = e => { if (!wrapRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const choose = s => {
    typedRef.current = false
    setOpen(false)
    setSuggestions([])
    onSelect?.({ address: s.label, coordinates: s.coordinates })
  }

  const onKeyDown = e => {
    if (!open || !suggestions.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(i => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(i => (i - 1 + suggestions.length) % suggestions.length)
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault()
      choose(suggestions[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const located = Array.isArray(coordinates) && coordinates.length === 2

  return (
    <div className={`autocomplete ${className}`} ref={wrapRef}>
      <div className="autocomplete-input-wrap">
        <input
          id={inputId}
          type="text"
          className={`form-input ${located ? 'is-located' : ''}`}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          aria-label={ariaLabel}
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          autoComplete="off"
          onChange={e => {
            typedRef.current = true
            onChange?.(e.target.value)
          }}
          onFocus={() => suggestions.length && setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <span className="autocomplete-status" aria-hidden="true">
          {loading ? <span className="spinner spinner-sm" /> : located ? '📍' : ''}
        </span>
      </div>
      {open && (
        <ul id={listId} role="listbox" className="autocomplete-list">
          {suggestions.length === 0 && <li className="autocomplete-empty">No matches. Try adding the area or landmark.</li>}
          {suggestions.map((s, i) => (
            <li
              key={s.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`autocomplete-option ${i === active ? 'active' : ''}`}
              onMouseDown={e => {
                e.preventDefault()
                choose(s)
              }}
              onMouseEnter={() => setActive(i)}
            >
              {s.label}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="form-error">{error}</p>}
      {!located && value && value.trim().length >= MIN_CHARS && !open && !loading && !error && (
        <p className="text-xs text-warning mt-1">Pick a suggestion to pin this address on the map</p>
      )}
    </div>
  )
}
