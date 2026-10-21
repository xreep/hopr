import { useEffect, useRef, useState } from 'react'

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Animates a number from its previous value to `target` (ease-out cubic).
// Jumps straight to the value when the user prefers reduced motion.
export default function useCountUp(target, { duration = 900, decimals = 0 } = {}) {
  const [value, setValue] = useState(() => (reducedMotion() ? target : 0))
  const from = useRef(reducedMotion() ? target : 0)

  useEffect(() => {
    if (target === null || target === undefined || Number.isNaN(Number(target))) return undefined
    const end = Number(target)
    if (reducedMotion()) {
      setValue(end)
      from.current = end
      return undefined
    }
    const start = from.current
    const t0 = performance.now()
    let frame = 0
    const step = now => {
      const k = Math.min(1, (now - t0) / duration)
      const eased = 1 - (1 - k) ** 3
      setValue(start + (end - start) * eased)
      if (k < 1) frame = requestAnimationFrame(step)
      else from.current = end
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target, duration])

  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}
