import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="empty-state" style={{ minHeight: '50vh' }}>
      <p className="page-title">Page not found</p>
      <p className="text-secondary mt-2">The page you are looking for does not exist.</p>
      <Link to="/dashboard" className="btn btn-primary mt-4">Back to dashboard</Link>
    </div>
  )
}
