import { useLayoutEffect, useMemo, useRef } from 'react'

// Signature motif: a polyline "route" through data points that draws itself,
// then pops a stop marker at each point in sequence.
export default function HopLine({ values, width = 240, height = 56, padding = 6, label, delayMs = 0 }) {
  const pathRef = useRef(null)
  const points = useMemo(() => {
    const vals = values?.length ? values : [0]
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const span = max - min || 1
    const stepX = vals.length > 1 ? (width - padding * 2) / (vals.length - 1) : 0
    return vals.map((v, i) => [padding + i * stepX, height - padding - ((v - min) / span) * (height - padding * 2)])
  }, [values, width, height, padding])

  useLayoutEffect(() => {
    const path = pathRef.current
    if (path) path.style.setProperty('--route-length', String(Math.ceil(path.getTotalLength?.() || 1000)))
  }, [points])

  const d = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const drawMs = 1100
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label={label} className="overflow-visible">
      <path ref={pathRef} d={d} className="nd-route-path" style={{ animationDelay: `${delayMs}ms` }} />
      {points.map(([x, y], i) => {
        const last = i === points.length - 1
        return (
          <circle key={i} cx={x} cy={y} r={last ? 4 : 2.5}
            className="nd-hop-dot"
            fill={last ? '#D4FF3F' : '#070B14'} stroke="#D4FF3F" strokeWidth={last ? 0 : 1.5}
            style={{ animationDelay: `${delayMs + (drawMs * i) / Math.max(1, points.length - 1)}ms` }} />
        )
      })}
    </svg>
  )
}
