import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { isMuted, setMuted, subscribeMuted, isSpeechSupported } from '../utils/speak'
import { StatusBadge } from './ui'
import Icon from './icons'
import { isMac } from '../utils/platform'

const MAX_ROUTES = 8

// Every word typed must appear somewhere in the item; items whose label starts with the query rank first
function matches(item, words) {
  const haystack = `${item.label} ${item.hint || ''} ${item.keywords || ''}`.toLowerCase()
  return words.every(w => haystack.includes(w))
}

export default function CommandPalette({ open, onClose, pages }) {
  const navigate = useNavigate()
  const { isManager, logout } = useAuth()
  const muted = useSyncExternalStore(subscribeMuted, isMuted, () => false)
  const [query, setQuery] = useState('')
  const [routes, setRoutes] = useState([])
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    setQuery('')
    setActive(0)
    const previous = document.activeElement
    requestAnimationFrame(() => inputRef.current?.focus())
    if (isManager) api.get('/routes', { params: { limit: 100 } }).then(res => setRoutes(res.data.routes || [])).catch(() => {})
    return () => previous?.focus?.()
  }, [open, isManager])

  const items = useMemo(() => {
    const go = to => () => navigate(to)
    const actions = [
      isManager && { id: 'plan', group: 'Actions', icon: 'plus', label: 'Plan new routes', keywords: 'create optimize batch stops', run: go('/route-planner') },
      isManager && { id: 'dispatch', group: 'Actions', icon: 'bolt', label: 'Auto-dispatch waiting routes', keywords: 'assign drivers', run: go('/routes?dispatch=1') },
      isManager && { id: 'waiting', group: 'Actions', icon: 'clock', label: 'Show routes waiting for a driver', keywords: 'unassigned', run: go('/routes?unassigned=true') },
      isSpeechSupported() && { id: 'voice', group: 'Actions', icon: muted ? 'volume' : 'volumeOff', label: muted ? 'Turn voice notifications on' : 'Turn voice notifications off', keywords: 'mute speech sound', run: () => setMuted(!muted) },
      { id: 'logout', group: 'Actions', icon: 'logout', label: 'Sign out', keywords: 'log out', run: () => { logout(); navigate('/login') } }
    ].filter(Boolean)
    const pageItems = pages.map(p => ({ id: `page-${p.href}`, group: 'Pages', icon: p.icon, label: p.name, keywords: 'go to open', run: go(p.href) }))
    const routeItems = routes.map(r => ({
      id: `route-${r._id}`,
      group: 'Routes',
      icon: 'map',
      label: r.name,
      hint: `${r.routeId}, ${r.driver?.name || 'no driver yet'}`,
      keywords: `${r.batchId || ''} ${r.status}`,
      status: r.status,
      run: go(`/routes/${r._id}`)
    }))

    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return [...actions, ...pageItems, ...routeItems.slice(0, 5)]
    const q = words.join(' ')
    const rank = item => (item.label.toLowerCase().startsWith(q) ? 0 : 1)
    const pick = list => list.filter(item => matches(item, words)).sort((a, b) => rank(a) - rank(b))
    return [...pick(actions), ...pick(pageItems), ...pick(routeItems).slice(0, MAX_ROUTES)]
  }, [query, routes, pages, isManager, muted, navigate, logout])

  useEffect(() => { setActive(0) }, [query])
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView?.({ block: 'nearest' })
  }, [active])

  if (!open) return null

  const run = item => {
    if (!item) return
    onClose()
    item.run()
  }

  const onKeyDown = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (items.length ? (i + 1) % items.length : 0)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (items.length ? (i - 1 + items.length) % items.length : 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); run(items[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  let lastGroup = null
  return (
    <div className="modal-overlay palette-overlay" onClick={onClose} role="presentation">
      <div className="palette" role="dialog" aria-modal="true" aria-label="Search and run commands" onClick={e => e.stopPropagation()}>
        <div className="palette-input">
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={isManager ? 'Search routes, pages, actions' : 'Search pages and actions'}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={items[active] ? `palette-${items[active].id}` : undefined}
            aria-autocomplete="list"
            spellCheck={false}
          />
          <kbd>Esc</kbd>
        </div>
        <ul id="palette-list" ref={listRef} className="palette-list" role="listbox" aria-label="Results">
          {items.length === 0 && <li className="palette-empty">Nothing matches &ldquo;{query}&rdquo;. Try a route ID like RT-91E27A or a driver&apos;s name.</li>}
          {items.map((item, i) => {
            const heading = item.group !== lastGroup ? item.group : null
            lastGroup = item.group
            return [
              heading && <li key={`h-${heading}`} className="palette-group" role="presentation">{heading}</li>,
              <li
                key={item.id}
                id={`palette-${item.id}`}
                data-index={i}
                role="option"
                aria-selected={i === active}
                className={`palette-item ${i === active ? 'is-active' : ''}`}
                onMouseMove={() => setActive(i)}
                onClick={() => run(item)}
              >
                <span className="palette-icon"><Icon name={item.icon} size={16} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{item.label}</span>
                  {item.hint && <span className="block truncate text-micro text-ink-400">{item.hint}</span>}
                </span>
                {item.status && <StatusBadge status={item.status} />}
                {i === active && <Icon name="arrowRight" size={14} className="palette-enter" />}
              </li>
            ]
          })}
        </ul>
        <div className="palette-footer text-micro text-ink-400">
          <span><kbd>↑</kbd><kbd>↓</kbd> to move</span>
          <span><kbd>Enter</kbd> to open</span>
          <span className="ml-auto"><kbd>{isMac() ? '⌘' : 'Ctrl'}</kbd><kbd>K</kbd> any time</span>
        </div>
      </div>
    </div>
  )
}
