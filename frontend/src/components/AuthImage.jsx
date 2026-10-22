import { useEffect, useState } from 'react'
import { loadImage } from '../utils/imageCache'

// <img> for protected uploads: fetched with the auth header, shown via an object URL
export default function AuthImage({ id, alt, className = '' }) {
  const [src, setSrc] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!id) return undefined
    let cancelled = false
    setFailed(false)
    loadImage(id)
      .then(url => !cancelled && setSrc(url))
      .catch(() => !cancelled && setFailed(true))
    return () => { cancelled = true }
  }, [id])
  if (failed) return <span className="text-xs text-muted">Image no longer stored. Proof images are deleted after a set number of days; the delivery record stays.</span>
  if (!src) return <span className={`auth-image-placeholder ${className}`} aria-label="Loading image" />
  return (
    <a href={src} target="_blank" rel="noopener noreferrer">
      <img src={src} alt={alt} className={className} />
    </a>
  )
}
