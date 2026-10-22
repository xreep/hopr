import { useEffect, useState } from 'react'

const INTERACTIONS = ['pointerdown', 'touchstart', 'keydown', 'scroll', 'wheel']

// True once the page has painted and gone idle, or, with `waitForInteraction`, once the
// visitor first touches, scrolls or types. Used to load the street map (MapLibre, about
// 1 MB) after the first paint; until then a light schematic of the same lines and markers
// shows. Waiting for interaction saves phones on mobile data from downloading a map no
// one looks at.
export default function useWhenIdle({ delayMs = 1500, waitForInteraction = false } = {}) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (ready) return undefined
    const go = () => setReady(true)
    if (waitForInteraction) {
      INTERACTIONS.forEach(e => window.addEventListener(e, go, { once: true, passive: true }))
      return () => INTERACTIONS.forEach(e => window.removeEventListener(e, go))
    }
    let idle = 0
    const timer = setTimeout(() => {
      if ('requestIdleCallback' in window) idle = window.requestIdleCallback(go, { timeout: 3000 })
      else go()
    }, delayMs)
    return () => {
      clearTimeout(timer)
      if (idle) window.cancelIdleCallback?.(idle)
    }
  }, [delayMs, waitForInteraction, ready])
  return ready
}
