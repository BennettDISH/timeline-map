import React, { useState } from 'react'
import axios from 'axios'

function Migration() {
  const [migrating, setMigrating] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleTooltipFieldMigration = async () => {
    setMigrating(true)
    setError('')
    setSuccess('')

    try {
      const response = await axios.post('/api/setup/expand-tooltip-field')
      setSuccess(response.data.message + ' Node connections and metadata can now be saved!')
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
          <h1>📝 Connection Data Storage Migration</h1>
          <p>Expand database field to support node connections and metadata.</p>
        </div>
        
        <div className="setup-info">
          <h3>What this migration fixes:</h3>
          <ul>
            <li>📝 Expands tooltip_text field from VARCHAR(255) to TEXT</li>
            <li>🔗 Enables unlimited connection data storage</li>
            <li>✨ Supports complex node metadata and relationships</li>
            <li>💾 Fixes "value too long" errors when saving nodes</li>
            <li>🛡️ Includes automatic backup before changes</li>
          </ul>
          <div style={{ 
            background: '#f8f9fa', 
            border: '1px solid #dee2e6', 
            borderRadius: '6px', 
            padding: '12px', 
            margin: '16px 0',
            fontSize: '14px'
          }}>
            <strong>Error this fixes:</strong><br/>
            <code style={{ color: '#dc3545' }}>Server error: value too long for type character varying(255)</code>
          </div>
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
            onClick={handleTooltipFieldMigration} 
            className="setup-button" 
            disabled={migrating}
            style={{
              backgroundColor: '#28a745',
              padding: '15px 30px',
              fontSize: '16px',
              fontWeight: 'bold'
            }}
          >
            {migrating ? '📝 Expanding tooltip field...' : '📝 Fix Connection Data Storage'}
          </button>
        </div>

        <div className="setup-note">
          <p><strong>Note:</strong> This migration is safe to run multiple times and includes automatic backup.</p>
          <p><strong>After migration:</strong> You'll be able to create nodes with connections and complex metadata without field length errors.</p>
          <p><strong>Backup:</strong> Creates <code>events_backup_tooltip_migration</code> table for rollback if needed.</p>
        </div>
      </div>
    </div>
  )
}

export default Migration