import { useEffect, useState } from 'react'
import api from '../utils/api'

// Whether the server runs as a public demo (DEMO_MODE). Demo buttons only show when it
// does; null while the answer is on its way.
let status = null
function demoStatus() {
  status ??= api.get('/demo/status').then(res => Boolean(res.data.enabled)).catch(() => {
    status = null
    return false
  })
  return status
}

export default function useDemoMode() {
  const [enabled, setEnabled] = useState(null)
  useEffect(() => {
    let live = true
    demoStatus().then(value => { if (live) setEnabled(value) })
    return () => { live = false }
  }, [])
  return enabled
}
