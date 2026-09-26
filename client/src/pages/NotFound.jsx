import React from 'react'
import { Link } from 'react-router-dom'
import TopBar, { Compass } from '../components/TopBar'
import '../styles/shell.scss'

// A real 404 — unknown paths land here instead of silently bouncing to the dashboard.
function NotFound() {
  React.useEffect(() => { document.title = 'Page not found · Fantasy Map Timeline'; return () => { document.title = 'Fantasy Map Timeline' } }, [])
  return (
    <div className="shell">
      <TopBar crumb="Not found" />
      <div className="voidstate">
        <Compass size={92} className="void-rose" />
        <h1 className="vh">Page not found</h1>
        <p>Check the address, or go back to your worlds.</p>
        <Link to="/dashboard" className="sbtn primary">To your worlds</Link>
      </div>
    </div>
  )
}

export default NotFound
