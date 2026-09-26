import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../utils/AuthContext'
import http, { errText } from '../services/http'
import TopBar, { Compass } from '../components/TopBar'
import '../styles/shell.scss'

// The admin's status page — database health and the account list. Admin is a Waypoint
// identity (ADMIN_CENTRAL_USER_IDS on the server); the server enforces it, this only hides.
function AdminPanel() {
  const { user } = useAuth()
  const [dbStatus, setDbStatus] = useState(null)
  const [users, setUsers] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true); setError(null)
    Promise.all([http.get('/api/admin/db-status'), http.get('/api/admin/users')])
      .then(([statusRes, usersRes]) => { setDbStatus(statusRes.data); setUsers(usersRes.data.users || []) })
      .catch((e) => setError(errText(e, "Couldn't load the admin data")))
      .finally(() => setLoading(false))
  }
  useEffect(() => { if (user?.isAdmin) load() }, [user]) // eslint-disable-line

  if (!user?.isAdmin) {
    return (
      <div className="shell">
        <TopBar crumb="Admin" />
        <div className="voidstate">
          <Compass size={92} className="void-rose" />
          <h2>This door is for the admin</h2>
          <p>Nothing here is yours to change. Your worlds are where you left them.</p>
          <Link to="/dashboard" className="sbtn primary">To your worlds</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="shell">
      <TopBar crumb="Admin" />
      <main className="dashmain admin-panel">
        <div className="admin-container">
          <h1>Admin panel</h1>
          {error && (
            <div className="voidstate" role="alert">
              <h2>Couldn't load the admin data</h2>
              <p>{error}</p>
              <button className="sbtn primary" onClick={load}>Try again</button>
            </div>
          )}
          {!error && (
            <>
              <div className="admin-section">
                <h2>Database</h2>
                {loading ? <p>Loading…</p> : dbStatus ? (
                  <div className="db-status">
                    <p><strong>Status:</strong> {dbStatus.message}</p>
                    <p><strong>Tables:</strong> {dbStatus.details?.tablesFound?.join(', ')}</p>
                    {dbStatus.details?.missingTables?.length > 0 && (
                      <p><strong>Missing:</strong> {dbStatus.details.missingTables.join(', ')}</p>
                    )}
                    <p><strong>Accounts:</strong> {dbStatus.details?.userCount}</p>
                  </div>
                ) : null}
              </div>
              <div className="admin-section">
                <h2>Accounts</h2>
                {loading ? <p>Loading…</p> : users && users.length > 0 ? (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th>Username</th>
                        <th>Email</th>
                        <th>Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id}>
                          <td>{u.username}</td>
                          <td>{u.email || '—'}</td>
                          <td>{new Date(u.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p>No accounts yet.</p>}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

export default AdminPanel
