import { useEffect, useRef } from 'react'

// Calls `fn` immediately and then every `intervalMs` while `enabled`.
// Repeat polls are skipped while the tab is hidden (the first load always runs),
// and a refresh happens as soon as the tab becomes visible again.
export default function usePolling(fn, intervalMs, enabled = true) {
  const saved = useRef(fn)
  useEffect(() => { saved.current = fn }, [fn])

  useEffect(() => {
    if (!enabled) return undefined
    let timer = null
    let cancelled = false
    const run = async () => {
      try { await saved.current() } catch { /* surfaced by the caller */ }
    }
    const tick = async () => {
      if (cancelled) return
      if (!document.hidden) await run()
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
  }, [intervalMs, enabled])
}
