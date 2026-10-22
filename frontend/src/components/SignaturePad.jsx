import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'

// Finger / mouse / stylus signature on a canvas. Exposes toBlob() and clear().
const SignaturePad = forwardRef(function SignaturePad({ height = 180, onChange, label = 'Customer signature' }, ref) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const last = useRef(null)
  const [empty, setEmpty] = useState(true)

  const setup = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = window.devicePixelRatio || 1
    const { width } = canvas.getBoundingClientRect()
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    const ctx = canvas.getContext('2d')
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#15191D'
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, width, height)
    // Signing line
    ctx.save()
    ctx.strokeStyle = '#C3C9CE'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(16, height - 34)
    ctx.lineTo(width - 16, height - 34)
    ctx.stroke()
    ctx.restore()
    ctx.lineWidth = 2.4
  }, [height])

  useEffect(() => { setup() }, [setup])

  const point = e => {
    const rect = canvasRef.current.getBoundingClientRect()
    return [e.clientX - rect.left, e.clientY - rect.top]
  }

  const down = e => {
    e.preventDefault()
    canvasRef.current.setPointerCapture?.(e.pointerId)
    drawing.current = true
    last.current = point(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.beginPath()
    ctx.arc(last.current[0], last.current[1], 1.2, 0, Math.PI * 2)
    ctx.fillStyle = '#15191D'
    ctx.fill()
  }
  const move = e => {
    if (!drawing.current) return
    e.preventDefault()
    const p = point(e)
    const ctx = canvasRef.current.getContext('2d')
    ctx.beginPath()
    ctx.moveTo(...last.current)
    ctx.lineTo(...p)
    ctx.stroke()
    last.current = p
    if (empty) {
      setEmpty(false)
      onChange?.(false)
    }
  }
  const up = () => { drawing.current = false }

  const clear = () => {
    setup()
    setEmpty(true)
    onChange?.(true)
  }

  useImperativeHandle(ref, () => ({
    isEmpty: () => empty,
    clear,
    toBlob: () => new Promise(resolve => canvasRef.current.toBlob(resolve, 'image/png'))
  }))

  return (
    <div className="signature-pad">
      <div className="flex-between mb-1">
        <span className="form-label mb-0">{label}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={clear} disabled={empty}>Clear</button>
      </div>
      <canvas
        ref={canvasRef}
        style={{ height, width: '100%', touchAction: 'none' }}
        className="signature-canvas"
        role="img"
        aria-label={`${label} drawing area${empty ? ' (empty)' : ' (signed)'}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
      />
      {empty && <p className="text-micro text-ink-400 mt-1">Ask the customer to sign above the line</p>}
    </div>
  )
})

export default SignaturePad
