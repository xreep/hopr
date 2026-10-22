import { useCallback, useEffect, useRef, useState } from 'react'
import { flushOutbox, outboxList, subscribeOutbox } from '../offline/outbox'

const RETRY_MS = 20000

// Connection state and the driver's outbox: sends queued updates when the phone comes
// back online, every 20 s while any are waiting, and on demand ("Send now").
export default function useOfflineSync(userId, onSent) {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const sentRef = useRef(onSent)
  useEffect(() => { sentRef.current = onSent }, [onSent])

  const count = useCallback(async () => {
    if (!userId) return
    try { setPending((await outboxList(userId)).length) } catch { setPending(0) }
  }, [userId])

  const flush = useCallback(async () => {
    if (!userId) return
    setSyncing(true)
    try {
      const result = await flushOutbox(userId)
      if (result.sent || result.dropped) sentRef.current?.(result)
    } catch { /* storage unavailable: nothing was queued */ } finally {
      setSyncing(false)
      count()
    }
  }, [userId, count])

  useEffect(() => {
    const up = () => { setOnline(true); flush() }
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [flush])

  useEffect(() => {
    const stop = subscribeOutbox(count)
    flush()
    return stop
  }, [count, flush])

  useEffect(() => {
    if (!pending) return undefined
    const id = setInterval(flush, RETRY_MS)
    return () => clearInterval(id)
  }, [pending, flush])

  return { online, pending, syncing, flush }
}
