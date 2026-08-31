import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/main.scss'

// Internal bug-tracker widget. Injected here instead of index.html so the public
// Player View (/p/*) never loads it — anonymous players shouldn't get an internal
// reporting tool (or its API key) alongside the shared map. The widget reads its
// key via document.currentScript, which is set for dynamically inserted classic
// scripts, so injection is equivalent to the old inline tag.
const path = window.location.pathname
if (!(path === '/p' || path.startsWith('/p/'))) {
  const widget = document.createElement('script')
  widget.src = 'https://bug-tracker-production-4ccb.up.railway.app/widget.js'
  widget.setAttribute('data-api-key', '74c1c3da43cd9020a09f570d78ab8834b7ff73c59d9586793d9e8119f53f8c2d')
  document.body.appendChild(widget)
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)