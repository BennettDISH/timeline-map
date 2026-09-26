import React from 'react'

// Top-level boundary so an uncaught render error degrades to a message + reload instead
// of a blank white screen — and SAYS what broke, so a report carries its own diagnosis.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, info: null, copied: false }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('Unhandled render error:', error, info)
    this.setState({ info })
  }

  render() {
    if (this.state.hasError) {
      const { error, info } = this.state
      const where = String(info?.componentStack || '').trim().split('\n').slice(0, 4).join('\n')
      const path = window.location.pathname
      const player = /^\/p(\/|$)/.test(path) // a player's page: the share URL never goes into the details
      const details = `${error?.name || 'Error'}: ${error?.message || String(error)}\n${where}${player ? '' : `\n${window.location.href}`}`
      const leave = () => {
        // "/" resumes the last map, which is the page that just crashed — forget it first
        try { localStorage.removeItem('atlas_last_location') } catch (e) { /* ignore */ }
        window.location.href = player ? path.split('/').slice(0, 3).join('/') : '/dashboard'
      }
      return (
        <div className="app-error-boundary" style={{ padding: '2rem', maxWidth: 640, margin: '0 auto' }}>
          <h2>Something went wrong.</h2>
          <p>An unexpected error occurred. Try reloading the page — and if it keeps happening, copy the details below and pass them on.</p>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: '#0002', padding: 10, borderRadius: 6, overflow: 'auto' }}>{details}</pre>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={leave}>{player ? 'Back to the map' : 'Your worlds'}</button>
            <button onClick={() => window.location.reload()}>Reload</button>
            <button onClick={() => { navigator.clipboard?.writeText(details).then(() => this.setState({ copied: true })).catch(() => {}) }}>
              {this.state.copied ? 'Copied' : 'Copy details'}
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary
