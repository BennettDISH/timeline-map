import React, { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../utils/AuthContext'

// The app's mark: an eight-point compass rose. Single-color (currentColor) so it tints
// wherever it's used — gold in the top bar, faint in placeholders and empty states.
export function Compass({ size = 22, className = '' }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="3" opacity=".4" />
      <path d="M50 16 L57 43 L84 50 L57 57 L50 84 L43 57 L16 50 L43 43 Z"
        fill="currentColor" opacity=".38" transform="rotate(45 50 50)" />
      <path d="M50 2 L59 41 L98 50 L59 59 L50 98 L41 59 L2 50 L41 41 Z" fill="currentColor" />
      <circle cx="50" cy="50" r="3.5" fill="currentColor" opacity=".5" />
    </svg>
  )
}

// Shared chrome for the study pages (Dashboard, Archive) — wordmark home-link,
// an optional crumb for where you are, and the account menu.
function TopBar({ crumb }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  const signOut = async () => { await logout(); navigate('/login') }

  return (
    <header className="shellbar">
      <Link to="/dashboard" className="wordmark" title="Your worlds">
        <Compass size={26} className="rose" />
        <span className="wm-text">Fantasy Map Timeline</span>
      </Link>
      {crumb && <span className="shellcrumb"><span className="sep">▸</span>{crumb}</span>}
      <div className="spacer" />
      <div className="usermenu" ref={ref}>
        <button className="userbtn" onClick={() => setOpen((v) => !v)}>
          {user?.username || 'Account'} <span className="chev">▾</span>
        </button>
        {open && (
          <div className="menupop">
            {user?.role === 'admin' && <Link to="/admin" onClick={() => setOpen(false)}>Admin panel</Link>}
            <button onClick={signOut}>Sign out</button>
          </div>
        )}
      </div>
    </header>
  )
}

export default TopBar
