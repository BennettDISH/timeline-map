import React from 'react'
import { Link } from 'react-router-dom'
import TopBar, { Compass } from '../components/TopBar'
import '../styles/shell.scss'

// A real 404 — unknown paths land here instead of silently bouncing to the dashboard.
function NotFound() {
  return (
    <div className="shell">
      <TopBar crumb="Uncharted" />
      <div className="voidstate">
        <Compass size={92} className="void-rose" />
        <h2>This page is on no map</h2>
        <p>The path you followed leads nowhere. Check the address, or head back to your worlds.</p>
        <Link to="/dashboard" className="sbtn primary">To your worlds</Link>
      </div>
    </div>
  )
}

export default NotFound
