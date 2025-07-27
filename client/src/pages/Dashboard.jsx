import React, { useState } from 'react'
import { useAuth } from '../utils/AuthContext'
import { Link, useNavigate } from 'react-router-dom'
import WorldSelector from '../components/WorldSelector'
import worldService from '../services/worldService'

function Dashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [currentWorld, setCurrentWorld] = useState(worldService.getCurrentWorld())

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const handleWorldSelect = (world) => {
    setCurrentWorld(world)
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
        <div className="dashboard-grid">
          <div className="world-section">
            <WorldSelector 
              onWorldSelect={handleWorldSelect}
              currentWorldId={currentWorld?.id}
            />
          </div>

          {currentWorld ? (
            <div className="world-actions">
              <div className="current-world-info">
                <h2>📍 {currentWorld.name}</h2>
                {currentWorld.description && <p>{currentWorld.description}</p>}
              </div>

              <div className="quick-actions">
                <h3>Quick Actions</h3>
                <div className="action-grid">
                  <Link 
                    to={`/maps?world=${currentWorld.id}`} 
                    className="action-card"
                  >
                    <h4>Manage Maps</h4>
                    <p>Create and edit maps for this world</p>
                  </Link>
                  <Link 
                    to={`/images?world=${currentWorld.id}`} 
                    className="action-card"
                  >
                    <h4>Manage Images</h4>
                    <p>Upload and organize images</p>
                  </Link>
                  <button className="action-card" disabled>
                    <h4>Timeline Events</h4>
                    <p>Coming soon - manage timeline events</p>
                  </button>
                </div>
              </div>
              
              <div className="recent-maps">
                <h3>Recent Maps</h3>
                <p>No maps created yet. Create your first map to get started!</p>
              </div>
            </div>
          ) : (
            <div className="no-world-selected">
              <h2>Welcome to Fantasy Map Timeline!</h2>
              <p>Select a world to get started, or create a new one.</p>
              <div className="getting-started">
                <h3>Getting Started:</h3>
                <ol>
                  <li>Create or select a world for your campaign</li>
                  <li>Upload map images for your world</li>
                  <li>Create interactive maps with timeline events</li>
                  <li>Plot events and characters across time and space</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default Dashboard