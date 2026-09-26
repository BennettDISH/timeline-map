import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useAuth } from '../utils/AuthContext'
import { errText } from '../services/http'

function AuthCallback() {
  const [searchParams] = useSearchParams()
  const [error, setError] = useState('')
  const { ssoLogin } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const savedState = sessionStorage.getItem('sso_state')

    if (!code) {
      setError('No authorization code received')
      return
    }

    if (!state || !savedState || state !== savedState) {
      setError('Invalid state parameter')
      return
    }

    sessionStorage.removeItem('sso_state')

    // back to where the person was going before the sign-in bounce, if anywhere
    let next = '/'
    try { next = sessionStorage.getItem('sso_next') || '/'; sessionStorage.removeItem('sso_next') } catch (e) { /* ignore */ }
    ssoLogin(code, `${window.location.origin}/auth/callback`)
      .then(() => navigate(next.startsWith('/') ? next : '/', { replace: true }))
      .catch(err => setError(errText(err, 'SSO login failed')))
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
        <h1>Signing you in...</h1>
      </div>
    </div>
  )
}

export default AuthCallback
