import React, { useState } from 'react'
import { useAuth } from '../utils/AuthContext'
import axios from 'axios'

function AdminPanel() {
  const { user } = useAuth()
  const [migrationStatus, setMigrationStatus] = useState('')
  const [loading, setLoading] = useState(false)

  // Only show to admin users
  if (!user || user.role !== 'admin') {
    return (
      <div className="admin-panel">
        <div className="access-denied">
          <h2>Access Denied</h2>
          <p>You need admin privileges to access this panel.</p>
        </div>
      </div>
    )
  }

  const enableFolders = async () => {
    setLoading(true)
    setMigrationStatus('🔄 Enabling custom folder system...')
    
    try {
      const response = await axios.post('/api/admin/enable-folders', {}, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })
      
      setMigrationStatus('✅ ' + response.data.message)
    } catch (error) {
      setMigrationStatus('❌ Failed to enable folders: ' + (error.response?.data?.message || error.message))
    } finally {
      setLoading(false)
    }
  }


  return (
    <div className="admin-panel">
      <div className="admin-container">
        <h1>Admin Panel</h1>
        <p>Welcome, {user.username}! Manage your database and system settings here.</p>
        
        <div className="admin-section">
          <h2>🗂️ Custom Folder System Setup</h2>
          
          <div className="admin-actions">
            <button 
              onClick={enableFolders} 
              disabled={loading}
              className="admin-button migration-button"
            >
              {loading ? 'Enabling Folders...' : '🗂️ Enable Custom Folder System'}
            </button>
          </div>
          
          {migrationStatus && (
            <div className="migration-status">
              <h3>Status:</h3>
              <pre>{migrationStatus}</pre>
            </div>
          )}
          
          <div className="migration-info">
            <h3>🗂️ Custom Folder System</h3>
            <p>Click the button above to enable the new hierarchical folder system for organizing your images with unlimited sub-categories and custom organization.</p>
            
            <div className="migration-note">
              <p><strong>✨ What you'll get:</strong> Create custom folders, organize with unlimited sub-folders, and better image management across all your worlds!</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

export default AdminPanel