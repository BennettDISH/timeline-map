import React, { useState } from 'react'
import axios from 'axios'

function Migration() {
  const [migrating, setMigrating] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleMigration = async () => {
    setMigrating(true)
    setError('')
    setSuccess('')

    try {
      const response = await axios.post('/api/setup/migrate')
      setSuccess(response.data.message + ' - You can now create maps with timeline features!')
    } catch (error) {
      console.error('Migration error:', error)
      setError(error.response?.data?.message || 'Migration failed. Please try again.')
    } finally {
      setMigrating(false)
    }
  }

  return (
    <div className="setup-page">
      <div className="setup-container">
        <div className="setup-header">
          <h1>🔧 Database Migration</h1>
          <p>Run database migrations to add new features to existing system.</p>
        </div>
        
        <div className="setup-info">
          <h3>What this migration adds:</h3>
          <ul>
            <li>✅ Timeline functionality for worlds</li>
            <li>✅ timeline_enabled column to worlds table</li>
            <li>✅ World-level timeline settings and time scrubbing</li>
            <li>✅ Support for temporal events and node filtering</li>
          </ul>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {success && (
          <div className="success-message">
            ✅ {success}
          </div>
        )}

        <div className="migration-actions">
          <button 
            onClick={handleMigration} 
            className="setup-button" 
            disabled={migrating}
          >
            {migrating ? '🔄 Running migration...' : '🚀 Run Migration'}
          </button>
        </div>

        <div className="setup-note">
          <p><strong>Note:</strong> This is safe to run multiple times. It will only add missing columns.</p>
        </div>
      </div>
    </div>
  )
}

export default Migration