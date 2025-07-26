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

  const runMigration = async () => {
    setLoading(true)
    setMigrationStatus('🔄 Running database migration...')
    
    try {
      const response = await axios.post('/api/admin/migrate', {}, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })
      
      setMigrationStatus('✅ ' + response.data.message)
    } catch (error) {
      console.error('Migration error:', error)
      setMigrationStatus('❌ Migration failed: ' + (error.response?.data?.message || error.message))
    } finally {
      setLoading(false)
    }
  }

  const testDatabase = async () => {
    setLoading(true)
    setMigrationStatus('🔄 Testing database connection...')
    
    try {
      const response = await axios.get('/api/admin/db-status', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })
      
      setMigrationStatus('✅ Database Status: ' + response.data.message)
    } catch (error) {
      setMigrationStatus('❌ Database test failed: ' + (error.response?.data?.message || error.message))
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
          <h2>Database Management</h2>
          
          <div className="admin-actions">
            <button 
              onClick={runMigration} 
              disabled={loading}
              className="admin-button migration-button"
            >
              {loading ? 'Running Migration...' : '🗄️ Run Database Migration'}
            </button>
            
            <button 
              onClick={testDatabase} 
              disabled={loading}
              className="admin-button test-button"
            >
              {loading ? 'Testing...' : '🔍 Test Database Connection'}
            </button>
          </div>
          
          {migrationStatus && (
            <div className="migration-status">
              <h3>Status:</h3>
              <pre>{migrationStatus}</pre>
            </div>
          )}
          
          <div className="migration-info">
            <h3>Migration Info:</h3>
            <ul>
              <li>Creates all required database tables</li>
              <li>Sets up user authentication tables</li>
              <li>Creates image and map management tables</li>
              <li>Adds default admin user (admin/admin123)</li>
              <li>Safe to run multiple times</li>
            </ul>
          </div>
        </div>

        <div className="admin-section">
          <h2>Environment Check</h2>
          <div className="env-status">
            <p><strong>Database URL:</strong> {process.env.NODE_ENV === 'development' ? 'Check server logs' : 'Set via Railway'}</p>
            <p><strong>JWT Secret:</strong> {localStorage.getItem('auth_token') ? '✅ Token present' : '❌ Not authenticated'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AdminPanel