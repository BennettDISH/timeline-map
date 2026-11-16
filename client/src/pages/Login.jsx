import React, { useState, useEffect, useRef } from 'react'
import { useAuth } from '../utils/AuthContext'
import { useNavigate, useLocation, useSearchParams } from 'react-router'
import { safeNext } from '../utils/nextPath'
import { readHold, setHold, clearHold, goStraightToWaypoint, startWaypoint, signInError } from '../utils/signIn'

// Signing in is Waypoint's: a page that needs an account lands here signed out and goes
// straight on to Waypoint, whose page takes the password or offers "Continue as guest". After
// Sign out, or a sign-in that came back failed (the server's callback sends it here as
// ?error=…), the page stays with one button instead (the hold, utils/signIn.js). The Atlas's
// own forms and guest button are still here with ?local.
function Login() {
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const wantsLocal = searchParams.has('local')
  const [failure] = useState(() => signInError(searchParams.get('error')))
  const [hold] = useState(() => {
    if (failure) setHold('failed')
    return readHold()
  })
  // why the DM is back here: the dead-session bounce says so (a flag, or ?reason=expired)
  const [sessionEnded] = useState(() => {
    try { const v = sessionStorage.getItem('atlas_session_ended'); sessionStorage.removeItem('atlas_session_ended'); if (v) return true } catch (e) { /* ignore */ }
    return searchParams.get('reason') === 'expired'
  })
  // where to go after signing in: the page that bounced here, else the last map / dashboard
  const next = safeNext(location.state?.from?.pathname || searchParams.get('next') || '/')
  // whether Waypoint is set up, and where it lives: null until the server says; unknown (the
  // request failed) offers the Waypoint button without leaving for it
  const [config, setConfig] = useState(null)
  useEffect(() => { document.title = 'Sign in · Fantasy Map Timeline'; return () => { document.title = 'Fantasy Map Timeline' } }, [])

  // Ask the server whether SSO is configured — no build-time (VITE) vars needed.
  useEffect(() => {
    fetch('/api/auth/config')
      .then(res => res.json())
      .then(data => setConfig({ ssoEnabled: !!data.ssoEnabled, accountUrl: data.accountUrl || null, known: true }))
      .catch(() => setConfig({ ssoEnabled: true, accountUrl: null, known: false }))
  }, [])

  const straight = !!config && goStraightToWaypoint({ ssoEnabled: config.known && config.ssoEnabled, hold, wantsLocal })
  const started = useRef(false)
  useEffect(() => {
    if (straight && !started.current) { started.current = true; startWaypoint(next) }
  })

  if (!config || straight) {
    return (
      <div className="login-page">
        <div className="login-container">
          <h1>Fantasy Map Timeline</h1>
          <p className="login-subtitle" role="status">{straight ? 'Taking you to Waypoint…' : 'Loading…'}</p>
        </div>
      </div>
    )
  }

  if (wantsLocal || !config.ssoEnabled) return <LocalSignIn config={config} next={next} sessionEnded={sessionEnded} />

  return (
    <div className="login-page">
      <div className="login-container">
        <h1>Fantasy Map Timeline</h1>
        {hold === 'failed' ? (
          <div className="error-message" role="alert">{failure || 'Waypoint sign-in did not finish. Try again.'}</div>
        ) : hold === 'signed-out' ? (
          <p className="login-subtitle" role="status">You are signed out.</p>
        ) : sessionEnded ? (
          <p className="session-ended" role="status" style={{ color: '#c9a35f', margin: '0 0 12px' }}>Your session ended — sign in again to pick up where you left off. Unsaved edits from the workspace were kept and will be restored.</p>
        ) : (
          <p className="login-subtitle">Sign in with your Waypoint account.</p>
        )}
        <div className="login-form">
          <button type="button" className="login-button" onClick={() => startWaypoint(next)} autoFocus>Continue with Waypoint</button>
          {/* Waypoint's sign-up form, straight back here: the one way to make an account */}
          <button type="button" className="sso-button" onClick={() => startWaypoint(next, { prompt: 'create' })}>Create an account</button>
        </div>
        <p style={{ fontSize: '0.8rem', textAlign: 'center', marginTop: '0.75rem', opacity: 0.8 }}>
          Waypoint is where you sign in, make an account, or play as a guest, for every game.
        </p>
      </div>
    </div>
  )
}

// The Atlas's own form: a Waypoint password typed here and checked by Waypoint through this
// server, and a guest of its own. Only with ?local now (or where Waypoint isn't set up). Making
// an account is Waypoint's sign-up form (prompt=create, as the top bar's Create account), which
// comes straight back here: the Atlas's own sign-up and its recovery-code screen are gone.
function LocalSignIn({ config, next, sessionEnded }) {
  const [credentials, setCredentials] = useState({ username: '', password: '' })
  const { login, guestLogin, submitting, error, clearError } = useAuth()
  const navigate = useNavigate()
  const go = () => navigate(next, { replace: true })

  const handleGuest = async () => {
    clearError()
    try {
      await guestLogin()
      clearHold()
      go()
    } catch {
      // errors surfaced via context
    }
  }

  const startSso = () => startWaypoint(next)
  const startSignUp = () => startWaypoint(next, { prompt: 'create' })

  const handleLogin = async (e) => {
    e.preventDefault()
    clearError()
    try {
      await login(credentials.username, credentials.password)
      clearHold()
      go()
    } catch (error) {
      // shown by the context; the form and its values stay put
    }
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <h1>Fantasy Map Timeline</h1>
        {sessionEnded && (
          <p className="session-ended" role="status" style={{ color: '#c9a35f', margin: '0 0 12px' }}>Your session ended — sign in again to pick up where you left off. Unsaved edits from the workspace were kept and will be restored.</p>
        )}
        <p className="login-subtitle">Sign in to your account</p>

        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}

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

        {config.ssoEnabled && (
          <div className="auth-toggle">
            <p>
              Don't have an account?
              <button type="button" className="toggle-button" onClick={startSignUp}>
                Create an account
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default Login
