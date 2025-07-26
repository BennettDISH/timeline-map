import React from 'react'

function Dashboard() {
  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <h1>Fantasy Map Timeline</h1>
        <p>Welcome to your interactive map timeline tool</p>
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
            <button className="action-card">
              <h3>Upload Images</h3>
              <p>Add map images</p>
            </button>
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