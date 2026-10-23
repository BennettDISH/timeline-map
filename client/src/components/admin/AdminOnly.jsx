import React, { useEffect } from 'react'
import { Link } from 'react-router'
import TopBar, { Compass } from '../TopBar'

// What anyone but the site admin sees at /admin. The Atlas keeps its session in the browser (a
// bearer token), so the server cannot tell who asks for the page itself: it hands the same page
// to everyone and every admin call refuses a non-admin with a 403 (routes/admin.js). This is the
// 403 page the browser draws, with no admin code run and no admin call made.
function AdminOnly() {
  useEffect(() => {
    const was = document.title
    document.title = '403 · Admin · Fantasy Map Timeline'
    return () => { document.title = was }
  }, [])
  return (
    <div className="shell">
      <TopBar crumb="Admin" />
      <div className="voidstate">
        <Compass size={92} className="void-rose" />
        <h2>403</h2>
        <p role="alert">This page is for the site admin.</p>
        <Link to="/dashboard" className="sbtn primary">To your worlds</Link>
      </div>
    </div>
  )
}

export default AdminOnly
