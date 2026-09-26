import React, { useState, useEffect } from 'react'
import { useAuth } from '../utils/AuthContext'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'

function Login() {
  const [credentials, setCredentials] = useState({ username: '', password: '' })
  const [searchParams] = useSearchParams()
  const location = useLocation()
  // why the DM is back here: the dead-session bounce says so (a flag, or ?reason=expired)
  const [sessionEnded] = useState(() => {
    try { const v = sessionStorage.getItem('atlas_session_ended'); sessionStorage.removeItem('atlas_session_ended'); if (v) return true } catch (e) { /* ignore */ }
    return searchParams.get('reason') === 'expired'
  })
  // where to go after signing in: the page that bounced here, else the last map / dashboard
  const next = location.state?.from?.pathname || searchParams.get('next') || '/'
  const [isRegistering, setIsRegistering] = useState(false)
  const [formData, setFormData] = useState({ username: '', email: '', password: '' })
  const [config, setConfig] = useState({ ssoEnabled: false, accountUrl: null })
  const [recovery, setRecovery] = useState(null) // the one-time recovery code a new account gets
  const { login, register, guestLogin, submitting, error, clearError } = useAuth()
  const navigate = useNavigate()
  const go = () => navigate(next.startsWith('/') ? next : '/', { replace: true })
  useEffect(() => { document.title = 'Sign in · Fantasy Map Timeline'; return () => { document.title = 'Fantasy Map Timeline' } }, [])

  const handleGuest = async () => {
    clearError()
    try {
      await guestLogin()
      go()
    } catch {
      // errors surfaced via context
    }
  }

  // Ask the server whether SSO is configured — no build-time (VITE) vars needed.
  useEffect(() => {
    fetch('/api/auth/config')
      .then(res => res.json())
      .then(data => setConfig({ ssoEnabled: !!data.ssoEnabled, accountUrl: data.accountUrl || null }))
      .catch(() => setConfig({ ssoEnabled: false, accountUrl: null }))
  }, [])

  // Start SSO: generate a random state, stash it for the callback to validate, then hand off to
  // the server route that builds the authorize URL from server-held client_id / auth-service URL.
  const startSso = () => {
    const state = crypto.randomUUID()
    sessionStorage.setItem('sso_state', state)
    sessionStorage.setItem('sso_next', next)
    window.location.href = `/api/auth/sso/login?state=${encodeURIComponent(state)}`
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    clearError()
    try {
      await login(credentials.username, credentials.password)
      go()
    } catch (error) {
      // shown by the context; the form and its values stay put
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    clearError()
    try {
      const r = await register(formData.username, formData.email, formData.password)
      if (r?.recoveryCode) setRecovery(r.recoveryCode) // shown once, before moving on
      else go()
    } catch (error) {
      // shown by the context; the sign-up form stays up with what was typed
    }
  }

  const toggleMode = () => {
    setIsRegistering(!isRegistering)
    clearError()
    setCredentials({ username: '', password: '' })
    setFormData({ username: '', email: '', password: '' })
  }

  if (recovery) {
    return (
      <div className="login-page">
        <div className="login-container">
          <h1>Your account is made</h1>
          <p className="login-subtitle">Write this recovery code down — it is shown exactly once.</p>
          <div className="recovery-code" style={{ fontFamily: 'monospace', fontSize: '1.3rem', letterSpacing: '.08em', padding: '12px', border: '1px dashed currentColor', borderRadius: 8, margin: '12px 0', textAlign: 'center', userSelect: 'all' }}>{recovery}</div>
          <p style={{ fontSize: '0.85rem', opacity: 0.8 }}>It is the only way back in if you forget your password.{config.accountUrl ? ' Passwords and account details are managed on Waypoint.' : ''}</p>
          <button type="button" className="login-button" onClick={go}>I have it — open my worlds</button>
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <h1>Fantasy Map Timeline</h1>
        {sessionEnded && (
          <p className="session-ended" role="status" style={{ color: '#c9a35f', margin: '0 0 12px' }}>Your session ended — sign in again to pick up where you left off. Unsaved edits from the workspace were kept and will be restored.</p>
        )}
        <p className="login-subtitle">
          {isRegistering ? 'Create your account' : 'Sign in to your account'}
        </p>
        
        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}

        {!isRegistering ? (
          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <label htmlFor="username">{config.ssoEnabled ? 'Waypoint username or email' : 'Username or Email'}</label>
              <input
                type="text"
                id="username"
                value={credentials.username}
                onChange={(e) => setCredentials({...credentials, username: e.target.value})}
                required
                disabled={submitting}
              />
            </div>
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                value={credentials.password}
                onChange={(e) => setCredentials({...credentials, password: e.target.value})}
                required
                disabled={submitting}
              />
            </div>
            <button type="submit" className="login-button" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
            {config.accountUrl && (
              <p style={{ fontSize: '0.8rem', textAlign: 'center', marginTop: '0.5rem' }}>
                <a href={config.accountUrl} target="_blank" rel="noreferrer">Forgot your password?</a> — accounts live on Waypoint.
              </p>
            )}
          </form>
        ) : (
          <form onSubmit={handleRegister} className="login-form">
            <div className="form-group">
              <label htmlFor="reg-username">Username</label>
              <input
                type="text"
                id="reg-username"
                value={formData.username}
                onChange={(e) => setFormData({...formData, username: e.target.value})}
                required
                disabled={submitting}
              />
            </div>
            <div className="form-group">
              <label htmlFor="reg-email">Email</label>
              <input
                type="email"
                id="reg-email"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                required
                disabled={submitting}
              />
            </div>
            <div className="form-group">
              <label htmlFor="reg-password">Password</label>
              <input
                type="password"
                id="reg-password"
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
                required
                disabled={submitting}
                minLength={6}
              />
              <small className="password-hint">At least 6 characters</small>
            </div>
            <button type="submit" className="login-button" disabled={submitting}>
              {submitting ? 'Creating account…' : 'Create account'}
            </button>
            {config.ssoEnabled && (
              <p style={{ fontSize: '0.8rem', textAlign: 'center', marginTop: '0.5rem', opacity: 0.8 }}>
                This makes a Waypoint account, which also signs you into Bennett's other apps.
              </p>
            )}
          </form>
        )}

        {config.ssoEnabled && (
          <div className="sso-divider">
            <span>or</span>
          </div>
        )}

        {config.ssoEnabled && (
          <button
            type="button"
            className="sso-button"
            onClick={startSso}
          >
            Sign in with Waypoint
          </button>
        )}

        {config.ssoEnabled && (
          <>
            <button
              type="button"
              className="guest-button"
              onClick={handleGuest}
              disabled={submitting}
            >
              {submitting ? 'Starting…' : 'Try it as a guest'}
            </button>
            <p style={{ fontSize: '0.8rem', textAlign: 'center', marginTop: '0.5rem', opacity: 0.7 }}>
              A guest lives in this browser only: sign out, a day of quiet, or cleared site data and its worlds are gone for good. Make an account to keep things.
            </p>
          </>
        )}

        <div className="auth-toggle">
          {!isRegistering ? (
            <p>
              Don't have an account?
              <button type="button" className="toggle-button" onClick={toggleMode}>
                Sign up
              </button>
            </p>
          ) : (
            <p>
              Already have an account?
              <button type="button" className="toggle-button" onClick={toggleMode}>
                Sign in
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default Login
