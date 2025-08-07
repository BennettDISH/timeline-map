import React, { useState } from 'react'
import axios from 'axios'

function Migration() {
  const [migrating, setMigrating] = useState(false)
  const [fixingConstraint, setFixingConstraint] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [constraintSuccess, setConstraintSuccess] = useState('')

  const handleMigration = async () => {
    setMigrating(true)
    setError('')
    setSuccess('')

    try {
      const response = await axios.post('/api/setup/migrate')
      setSuccess(response.data.message + ' - You can now create maps with timeline features and use image alignment!')
    } catch (error) {
      setError(error.response?.data?.message || 'Migration failed. Please try again.')
    } finally {
      setMigrating(false)
    }
  }

  const handleConstraintFix = async () => {
    setFixingConstraint(true)
    setError('')
    setConstraintSuccess('')

    try {
      const response = await axios.post('/api/setup/fix-constraint')
      setConstraintSuccess(response.data.message)
    } catch (error) {
      setError(error.response?.data?.message || 'Constraint fix failed. Please try again.')
    } finally {
      setFixingConstraint(false)
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
            <li>✅ Image positioning columns for timeline image alignment</li>
            <li>✅ Visual alignment tools for background images</li>
            <li>🆕 Background map node support (fixes constraint error)</li>
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

        {constraintSuccess && (
          <div className="success-message">
            ✅ {constraintSuccess}
          </div>
        )}

        <div className="migration-actions">
          <button 
            onClick={handleMigration} 
            className="setup-button" 
            disabled={migrating || fixingConstraint}
          >
            {migrating ? '🔄 Running migration...' : '🚀 Run Migration'}
          </button>
          
          <button 
            onClick={handleConstraintFix} 
            className="setup-button constraint-fix-button" 
            disabled={migrating || fixingConstraint}
            style={{ 
              backgroundColor: '#e74c3c', 
              marginTop: '10px',
              borderColor: '#c0392b'
            }}
          >
            {fixingConstraint ? '🔄 Fixing constraint...' : '🔧 Fix Background Map Constraint'}
          </button>
        </div>

        <div className="setup-note">
          <p><strong>Note:</strong> This is safe to run multiple times. It will only add missing columns.</p>
          <p><strong>Constraint Fix:</strong> Use the red button if you're getting "violates check constraint" errors when saving background map nodes. This specifically fixes the database constraint to allow background_map node types.</p>
        </div>
      </div>
    </div>
  )
}

export default Migration