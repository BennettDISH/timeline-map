import React from 'react'
import { Link } from 'react-router-dom'

function NotFound() {
  return (
    <div className="not-found-page">
      <div className="not-found-container">
        <h1>404</h1>
        <h2>Page Not Found</h2>
        <p>The page you're looking for doesn't exist or may have been moved.</p>
        <Link to="/dashboard" className="not-found-link">Go to Dashboard</Link>
      </div>
    </div>
  )
}

export default NotFound
