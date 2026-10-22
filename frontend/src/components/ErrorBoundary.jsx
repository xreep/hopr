import { Component } from 'react'
import Icon, { HopMark } from './icons'

// Catches render errors so a broken page shows a way forward instead of a blank screen.
// `resetKey` (e.g. the current path) clears the error when the user navigates away.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Page crashed:', error, info?.componentStack)
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    const fullPage = this.props.variant === 'page'
    return (
      <div className={`crash-screen ${fullPage ? 'crash-screen-full' : ''}`} role="alert">
        <HopMark size={40} />
        <h1 className="text-h2 font-extrabold mt-5">This page stopped working</h1>
        <p className="text-small text-ink-300 mt-2 max-w-[44ch]">
          Your routes and deliveries are saved on the server. Reload to pick up where you left off.
        </p>
        <div className="flex flex-wrap gap-2 mt-6 justify-center">
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            <Icon name="refresh" />Reload page
          </button>
          <a className="btn btn-outline" href="/dashboard">Go to dashboard</a>
        </div>
      </div>
    )
  }
}
