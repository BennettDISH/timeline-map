import React, { useState } from 'react'
import axios from 'axios'

function Migration() {
  const [migrating, setMigrating] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const enableFolders = async () => {
    setMigrating(true)
    setError('')
    setSuccess('')

    try {
      const response = await axios.post('/api/setup/enable-folders')
      setSuccess(response.data.message)
    } catch (error) {
      setError(error.response?.data?.message || 'Failed to enable custom folder system. Please try again.')
    } finally {
      setMigrating(false)
    }
  }

  return (
    <div className="setup-page">
      <div className="setup-container">
        <div className="setup-header">
          <h1>🗂️ Enable Custom Folder System</h1>
          <p>Create hierarchical folders for organizing your images with unlimited sub-categories.</p>
        </div>
        
        <div className="setup-info">
          <h3>What you'll get:</h3>
          <ul>
            <li>🗂️ Create custom folders for each world</li>
            <li>📁 Unlimited hierarchical sub-folders</li>
            <li>🎯 Better image organization and management</li>
            <li>🔗 Works alongside existing category tags</li>
            <li>✨ Drag-and-drop folder assignment</li>
          </ul>
          <div style={{ 
            background: '#fff3cd', 
            border: '2px solid #ffc107', 
            borderRadius: '8px', 
            padding: '15px', 
            margin: '16px 0',
            fontSize: '14px'
          }}>
            <strong>🎯 Action Required:</strong><br/>
            Click the button below to enable the custom folder system and start organizing your images better!
          </div>
        </div>

        {error && (
          <div className="error-message">
            ❌ {error}
          </div>
        )}

        {success && (
          <div className="success-message">
            ✅ {success}
          </div>
        )}

        <div className="migration-actions">
          <button 
            onClick={enableFolders} 
            className="setup-button" 
            disabled={migrating}
            style={{
              backgroundColor: '#4CAF50',
              padding: '15px 30px',
              fontSize: '16px',
              fontWeight: 'bold'
            }}
          >
            {migrating ? '🗂️ Enabling Custom Folders...' : '🗂️ Enable Custom Folder System'}
          </button>
        </div>

        <div className="setup-note">
          <p><strong>Safe to run:</strong> This migration is safe to run multiple times.</p>
          <p><strong>After enabling:</strong> You'll see custom folder options in your Image Library where you can create and organize folders.</p>
          <p><strong>Database changes:</strong> Creates <code>image_folders</code> table and adds <code>folder_id</code> column to images.</p>
        </div>
      </div>
    </div>
  )
}

export default Migration