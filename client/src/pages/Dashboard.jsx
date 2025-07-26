import React from 'react'
import { useAuth } from '../utils/AuthContext'
import { Link, useNavigate } from 'react-router-dom'

function Dashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <div className="header-content">
          <div className="header-left">
            <h1>Fantasy Map Timeline</h1>
            <p>Welcome back, {user?.username}!</p>
          </div>
          <div className="header-right">
            {user?.role === 'admin' && (
              <Link to="/admin" className="admin-link">
                🔧 Admin Panel
              </Link>
            )}
            <button onClick={handleLogout} className="logout-button">
              Logout
            </button>
          </div>
        </div>
      </header>
      
      <main className="dashboard-content">
        <div className="quick-actions">
          <h2>Quick Actions</h2>
          <div className="action-grid">
            <button className="action-card">
              <h3>Create New Map</h3>
              <p>Start a new world map</p>
            </button>
            <button className="action-card">
              <h3>Browse Maps</h3>
              <p>View existing maps</p>
            </button>
            <Link to="/images" className="action-card">
              <h3>Upload Images</h3>
              <p>Add map images</p>
            </Link>
          </div>
        </div>
        
        <div className="recent-maps">
          <h2>Recent Maps</h2>
          <p>No maps created yet. Create your first map to get started!</p>
        </div>
      </main>
    </div>
  )
}

export default Dashboard