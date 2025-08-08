import React, { useState } from 'react'
import axios from 'axios'

function Migration() {
  const [migrating, setMigrating] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleLockedFieldMigration = async () => {
    setMigrating(true)
    setError('')
    setSuccess('')

    try {
      const response = await axios.post('/api/setup/add-locked-field')
      setSuccess(response.data.message + ' You can now use the Lock Position feature!')
    } catch (error) {
      setError(error.response?.data?.message || 'Migration failed. Please try again.')
    } finally {
      setMigrating(false)
    }
  }

  return (
    <div className="setup-page">
      <div className="setup-container">
        <div className="setup-header">
          <h1>🔒 Node Lock Position Migration</h1>
          <p>Add lock position functionality to prevent accidental node dragging.</p>
        </div>
        
        <div className="setup-info">
          <h3>What this migration adds:</h3>
          <ul>
            <li>🔒 Adds "locked" column to events table</li>
            <li>✨ Enables Lock Position toggle in node editor</li>
            <li>🛡️ Prevents accidental dragging of locked nodes in edit mode</li>
            <li>💾 Persists lock state across sessions</li>
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
            onClick={handleLockedFieldMigration} 
            className="setup-button" 
            disabled={migrating}
            style={{
              backgroundColor: '#3498db',
              padding: '15px 30px',
              fontSize: '16px',
              fontWeight: 'bold'
            }}
          >
            {migrating ? '🔄 Adding lock position feature...' : '🔒 Add Lock Position Feature'}
          </button>
        </div>

        <div className="setup-note">
          <p><strong>Note:</strong> This migration is safe to run multiple times. It will only add the column if it doesn't exist.</p>
          <p><strong>After migration:</strong> You'll see a "Lock Position" toggle in the node editor under Position Settings.</p>
        </div>
      </div>
    </div>
  )
}

export default Migration