import { useEffect, useState } from 'react'
import api from '../utils/api'

// <img> for protected uploads: fetched with the auth header, shown via an object URL
export default function AuthImage({ id, alt, className = '' }) {
  const [src, setSrc] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!id) return undefined
    let url = ''
    let cancelled = false
    api.get(`/uploads/${id}`, { responseType: 'blob' })
      .then(res => {
        if (cancelled) return
        url = URL.createObjectURL(res.data)
        setSrc(url)
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [id])
  if (failed) return <span className="text-xs text-muted">Image unavailable</span>
  if (!src) return <span className={`auth-image-placeholder ${className}`} aria-label="Loading image" />
  return (
    <a href={src} target="_blank" rel="noopener noreferrer">
      <img src={src} alt={alt} className={className} />
    </a>
  )
}
