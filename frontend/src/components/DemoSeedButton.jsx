import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import api, { errorMessage } from '../utils/api'
import Icon from './icons'

// One click: demo accounts, a fleet in five cities and a fresh five-stop route in each
export default function DemoSeedButton({ className = 'btn btn-outline' }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try {
      const res = await api.post('/demo/seed')
      toast.success(`Demo data ready: ${res.data.routes} routes across five cities. Ranchi is assigned to driver@hopr.com.`)
      navigate(`/routes/${res.data.routeId}`)
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to create demo data'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <button type="button" className={className} onClick={run} disabled={busy}>
      {busy ? <><span className="spinner spinner-sm" /> Preparing demo</> : <><Icon name="sparkle" />Load demo data</>}
    </button>
  )
}
