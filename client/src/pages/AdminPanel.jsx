import React, { useState, useEffect } from 'react'
import { useAuth } from '../utils/AuthContext'
import axios from 'axios'

const createAuthAPI = () => {
  const token = localStorage.getItem('auth_token')
  return axios.create({
    baseURL: '/api/admin',
    headers: { 'Authorization': `Bearer ${token}` }
  })
}

function AdminPanel() {
  const { user } = useAuth()
  const [dbStatus, setDbStatus] = useState(null)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user?.role === 'admin') {
      loadAdminData()
    }
  }, [user])

  const loadAdminData = async () => {
    try {
      setLoading(true)
      const api = createAuthAPI()
      const [statusRes, usersRes] = await Promise.all([
        api.get('/db-status'),
        api.get('/users')
      ])
      setDbStatus(statusRes.data)
      setUsers(usersRes.data.users || [])
    } catch (error) {
      console.error('Failed to load admin data:', error)
    } finally {
      setLoading(false)
    }
  }

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

  return (
    <div className="admin-panel">
      <div className="admin-container">
        <h1>Admin Panel</h1>
        <p>Welcome, {user.username}!</p>

        <div className="admin-section">
          <h2>Database Status</h2>
          {loading ? (
            <p>Loading...</p>
          ) : dbStatus ? (
            <div className="env-status">
              <p><strong>Status:</strong> {dbStatus.message}</p>
              <p><strong>Tables:</strong> {dbStatus.details?.tablesFound?.join(', ')}</p>
              {dbStatus.details?.missingTables?.length > 0 && (
                <p><strong>Missing:</strong> {dbStatus.details.missingTables.join(', ')}</p>
              )}
              <p><strong>Users:</strong> {dbStatus.details?.userCount}</p>
            </div>
          ) : (
            <p>Failed to load database status.</p>
          )}
        </div>

        <div className="admin-section">
          <h2>Users</h2>
          {users.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px', borderBottom: '2px solid #eee' }}>Username</th>
                  <th style={{ textAlign: 'left', padding: '8px', borderBottom: '2px solid #eee' }}>Email</th>
                  <th style={{ textAlign: 'left', padding: '8px', borderBottom: '2px solid #eee' }}>Role</th>
                  <th style={{ textAlign: 'left', padding: '8px', borderBottom: '2px solid #eee' }}>Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>{u.username}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>{u.email}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>{u.role}</td>
                    <td style={{ padding: '8px', borderBottom: '1px solid #eee' }}>{new Date(u.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No users found.</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default AdminPanel
