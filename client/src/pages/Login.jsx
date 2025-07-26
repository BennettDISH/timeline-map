import React, { useState } from 'react'

function Login() {
  const [credentials, setCredentials] = useState({ username: '', password: '' })

  const handleSubmit = (e) => {
    e.preventDefault()
    // TODO: Implement login logic
    console.log('Login attempt:', credentials)
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <h1>Fantasy Map Timeline</h1>
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              value={credentials.username}
              onChange={(e) => setCredentials({...credentials, username: e.target.value})}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={credentials.password}
              onChange={(e) => setCredentials({...credentials, password: e.target.value})}
              required
            />
          </div>
          <button type="submit" className="login-button">Login</button>
        </form>
      </div>
    </div>
  )
}

export default Login