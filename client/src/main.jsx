import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/main.scss'

// The internal bug-tracker widget is injected by the server (server.js SPA fallback) on
// every page except the public Player View, so neither the reporting UI nor its key
// reaches anonymous players or this bundle.

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)