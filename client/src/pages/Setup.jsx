import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../utils/AuthContext'

function Setup() {
  const [formData, setFormData] = useState({ username: '', email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [checkingStatus, setCheckingStatus] = useState(true)
  const [migrating, setMigrating] = useState(false)
  const [showMigration, setShowMigration] = useState(false)
  const [migrationSuccess, setMigrationSuccess] = useState('')
  const navigate = useNavigate()
  const { setSession } = useAuth()

  useEffect(() => {
    checkSetupStatus()
  }, [])

  const checkSetupStatus = async () => {
    try {
      const response = await axios.get('/api/setup/status')
      if (!response.data.needsSetup) {
        // System already set up, redirect to login
        navigate('/login')
      }
    } catch (error) {
      // Continue with setup if check fails
    } finally {
      setCheckingStatus(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters')
      setLoading(false)
      return
    }

    try {
      const response = await axios.post('/api/setup/init-admin', formData)
      
      // Store the session in AuthContext so route guards see the new admin as logged in
      setSession(response.data.token, response.data.user)

      // Redirect to dashboard
      navigate('/dashboard')
      
    } catch (error) {
      const errorData = error.response?.data
      
      let errorMessage = errorData?.message || 'Setup failed. Please try again.'
      
      // Check for JWT_SECRET error and redirect to setup page
      if (errorData?.message?.includes('JWT_SECRET')) {
        navigate('/env-setup')
        return
      }
      
      // Add helpful instructions for common errors
      if (errorData?.instructions) {
        errorMessage += '\n\n' + errorData.instructions
        if (errorData?.example) {
          errorMessage += '\n\nExample: ' + errorData.example
        }
      }
      
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  if (checkingStatus) {
    return (
      <div className="setup-page">
        <div className="setup-container">
          <div className="loading">
            <h2>🔄 Checking system status...</h2>
            <p>Please wait while we check if setup is needed.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="setup-page">
      <div className="setup-container">
        <div className="setup-header">
          <h1>🚀 System Setup</h1>
          <p>Welcome! Let's set up your Fantasy Map Timeline system.</p>
        </div>
        
        <div className="setup-info">
          <h3>What happens during setup:</h3>
          <ul>
            <li>✅ Create all database tables</li>
            <li>✅ Set up your admin account</li>
            <li>✅ Initialize the system for use</li>
            <li>✅ Automatically log you in as admin</li>
          </ul>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="setup-form">
          <h3>Create Admin Account</h3>
          
          <div className="form-group">
            <label htmlFor="username">Admin Username</label>
            <input
              type="text"
              id="username"
              value={formData.username}
              onChange={(e) => setFormData({...formData, username: e.target.value})}
              required
              disabled={loading}
              placeholder="Choose a username"
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="email">Admin Email</label>
            <input
              type="email"
              id="email"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              required
              disabled={loading}
              placeholder="your@email.com"
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Admin Password</label>
            <input
              type="password"
              id="password"
              value={formData.password}
              onChange={(e) => setFormData({...formData, password: e.target.value})}
              required
              disabled={loading}
              minLength={6}
              placeholder="Choose a strong password"
            />
            <small className="password-hint">At least 6 characters</small>
          </div>
          
          <button type="submit" className="setup-button" disabled={loading}>
            {loading ? '🔄 Setting up system...' : '🚀 Initialize System'}
          </button>
        </form>

        <div className="setup-note">
          <p><strong>Note:</strong> You will be automatically logged in as admin after setup completes.</p>
        </div>
      </div>
    </div>
  )
}

export default Setup