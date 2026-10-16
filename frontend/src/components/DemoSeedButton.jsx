import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api, { errorMessage } from '../utils/api'

// One click: demo accounts + Ranchi fleet + a fresh 5-stop route assigned to the demo driver
export default function DemoSeedButton({ className = 'btn btn-outline' }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try {
      const res = await api.post('/demo/seed')
      toast.success(`Demo route ${res.data.route} is ready and assigned to driver@hopr.com`)
      navigate(`/routes/${res.data.routeId}`)
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to create demo data'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <button type="button" className={className} onClick={run} disabled={busy}>
      {busy ? 'Preparing demo…' : '✨ Load Ranchi demo'}
    </button>
  )
}
