import { useEffect, useRef } from 'react'

// Calls `fn` immediately and then every `intervalMs` while `enabled`.
// While the tab is hidden, polls are skipped (default) or slowed to
// `backgroundIntervalMs`; a refresh happens as soon as the tab is visible again.
export default function usePolling(fn, intervalMs, enabled = true, { backgroundIntervalMs = null } = {}) {
  const saved = useRef(fn)
  useEffect(() => { saved.current = fn }, [fn])

  useEffect(() => {
    if (!enabled) return undefined
    let timer = null
    let cancelled = false
    let lastRun = Date.now()
    const run = async () => {
      lastRun = Date.now()
      try { await saved.current() } catch { /* surfaced by the caller */ }
    }
    const tick = async () => {
      if (cancelled) return
      const due = !document.hidden || (backgroundIntervalMs && Date.now() - lastRun >= backgroundIntervalMs)
      if (due) await run()
      if (!cancelled) timer = setTimeout(tick, intervalMs)
    }
    const onVisible = () => { if (!document.hidden) run() }

    run().finally(() => {
      if (!cancelled) timer = setTimeout(tick, intervalMs)
    })
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [intervalMs, enabled, backgroundIntervalMs])
}
