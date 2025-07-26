import React, { useState } from 'react'
import { useAuth } from '../utils/AuthContext'
import { useNavigate } from 'react-router-dom'

function Login() {
  const [credentials, setCredentials] = useState({ username: '', password: '' })
  const [isRegistering, setIsRegistering] = useState(false)
  const [formData, setFormData] = useState({ username: '', email: '', password: '' })
  const { login, register, loading, error, clearError } = useAuth()
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    clearError()
    
    try {
      await login(credentials.username, credentials.password)
      navigate('/dashboard')
    } catch (error) {
      // Error is handled by context
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    clearError()
    
    if (formData.password.length < 6) {
      return // Validation will show error
    }
    
    try {
      await register(formData.username, formData.email, formData.password)
      navigate('/dashboard')
    } catch (error) {
      // Error is handled by context
    }
  }

  const toggleMode = () => {
    setIsRegistering(!isRegistering)
    clearError()
    setCredentials({ username: '', password: '' })
    setFormData({ username: '', email: '', password: '' })
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <h1>Fantasy Map Timeline</h1>
        <p className="login-subtitle">
          {isRegistering ? 'Create your account' : 'Sign in to your account'}
        </p>
        
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {!isRegistering ? (
          <form onSubmit={handleLogin} className="login-form">
            <div className="form-group">
              <label htmlFor="username">Username or Email</label>
              <input
                type="text"
                id="username"
                value={credentials.username}
                onChange={(e) => setCredentials({...credentials, username: e.target.value})}
                required
                disabled={loading}
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
                disabled={loading}
              />
            </div>
            <button type="submit" className="login-button" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
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
                disabled={loading}
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
                disabled={loading}
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
                disabled={loading}
                minLength={6}
              />
              <small className="password-hint">At least 6 characters</small>
            </div>
            <button type="submit" className="login-button" disabled={loading}>
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
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