import { useMemo } from 'react'

// Small trend line for a KPI: a plain line through the values, with the latest
// value marked in route green.
export default function HopLine({ values, width = 240, height = 56, padding = 5, label }) {
  const points = useMemo(() => {
    const vals = values?.length ? values : [0]
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const span = max - min || 1
    const stepX = vals.length > 1 ? (width - padding * 2) / (vals.length - 1) : 0
    return vals.map((v, i) => [padding + i * stepX, height - padding - ((v - min) / span) * (height - padding * 2)])
  }, [values, width, height, padding])

  const d = points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const [lastX, lastY] = points[points.length - 1]
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label={label} className="overflow-visible" preserveAspectRatio="none">
      <path d={d} fill="none" stroke="#8A929B" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lastX} cy={lastY} r="3.5" fill="#0B6B3A" />
    </svg>
  )
}
