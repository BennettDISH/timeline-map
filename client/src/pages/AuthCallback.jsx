import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router'
import { useAuth } from '../utils/AuthContext'
import { errText } from '../services/http'
import { checkCallback, takeNext, setHold } from '../utils/signIn'

function AuthCallback() {
  const [searchParams] = useSearchParams()
  const [error, setError] = useState('')
  const { ssoLogin } = useAuth()
  const navigate = useNavigate()

  const ran = useRef(false)
  useEffect(() => {
    // once: the state is used up by the first look, and a second run would call it forged
    if (ran.current) return
    ran.current = true
    // the state must be the one this tab sent (utils/signIn.js); a refusal or a failed
    // exchange holds the sign-in page, so a broken sign-in can't loop through Waypoint
    const problem = checkCallback({ code: searchParams.get('code'), state: searchParams.get('state') })
    if (problem) {
      setError(problem)
      return
    }

    // back to where the person was going before the sign-in bounce, if anywhere
    const next = takeNext()
    ssoLogin(searchParams.get('code'), `${window.location.origin}/auth/callback`)
      .then(() => navigate(next, { replace: true }))
      .catch(err => { setHold('failed'); setError(errText(err, 'SSO login failed')) })
  }, [])

  if (error) {
    return (
      <div className="login-page">
        <div className="login-container">
          <h1>Login Failed</h1>
          <div className="error-message" role="alert">{error}</div>
          <Link to="/login">Back to login</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <h1>Signing you in…</h1>
      </div>
    </div>
  )
}

export default AuthCallback
