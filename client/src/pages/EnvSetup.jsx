import React from 'react'
import { Link } from 'react-router-dom'

function EnvSetup() {
  const generateJWTSecret = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'
    let result = 'sk_'
    for (let i = 0; i < 50; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  const [jwtSecret] = React.useState(generateJWTSecret())

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    alert('Copied to clipboard!')
  }

  return (
    <div className="env-setup-page">
      <div className="env-setup-container">
        <div className="setup-header">
          <h1>🔧 Environment Setup Required</h1>
          <p>Your app needs some environment variables set up in Railway before it can run.</p>
        </div>

        <div className="setup-steps">
          <div className="step">
            <h3>Step 1: Go to Railway Dashboard</h3>
            <p>Open your Railway project dashboard and click on the "Variables" tab.</p>
          </div>

          <div className="step">
            <h3>Step 2: Add JWT_SECRET</h3>
            <p>Add a new environment variable:</p>
            <div className="env-var">
              <div className="env-line">
                <strong>Name:</strong> <code>JWT_SECRET</code>
              </div>
              <div className="env-line">
                <strong>Value:</strong> 
                <div className="secret-container">
                  <code className="secret-value">{jwtSecret}</code>
                  <button 
                    onClick={() => copyToClipboard(jwtSecret)}
                    className="copy-button"
                  >
                    📋 Copy
                  </button>
                </div>
              </div>
            </div>
            <p className="note">
              ⚠️ This secret is randomly generated for you. Keep it secure - it's used to sign user tokens.
            </p>
          </div>

          <div className="step">
            <h3>Step 3: Add Database</h3>
            <p>If you haven't already, add a PostgreSQL database:</p>
            <ul>
              <li>In Railway dashboard, click "Add Service"</li>
              <li>Select "Database" → "PostgreSQL"</li>
              <li>Railway will automatically set the <code>DATABASE_URL</code> variable</li>
            </ul>
          </div>

          <div className="step">
            <h3>Step 4: Deploy & Setup</h3>
            <p>Once the environment variables are set:</p>
            <ol>
              <li>Railway will automatically redeploy your app</li>
              <li>Come back to this page and try the setup again</li>
              <li>The setup will create your database tables and admin account</li>
            </ol>
          </div>
        </div>

        <div className="env-actions">
          <Link to="/setup" className="retry-button">
            🔄 Try Setup Again
          </Link>
          <button 
            onClick={() => window.location.reload()}
            className="refresh-button"
          >
            🔄 Refresh Page
          </button>
        </div>

        <div className="troubleshooting">
          <h3>Troubleshooting</h3>
          <ul>
            <li><strong>Still getting errors?</strong> Make sure to redeploy after setting variables</li>
            <li><strong>Database connection issues?</strong> Verify PostgreSQL addon is added</li>
            <li><strong>JWT errors?</strong> Make sure JWT_SECRET is exactly as shown above</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export default EnvSetup