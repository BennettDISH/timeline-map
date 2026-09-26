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

let accountUrlCache // fetched once per page load
// Shared chrome for the study pages (Dashboard, Archive, Admin) — wordmark home-link,
// an optional crumb for where you are, and the account menu (nothing for nobody).
function TopBar({ crumb }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [accountUrl, setAccountUrl] = useState(accountUrlCache || null)
  const ref = useRef(null)

  useEffect(() => {
    if (accountUrlCache !== undefined) return
    fetch('/api/auth/config').then((r) => r.json())
      .then((d) => { accountUrlCache = d.accountUrl || null; setAccountUrl(accountUrlCache) })
      .catch(() => { accountUrlCache = null })
  }, [])
  useEffect(() => {
    if (!open) return
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  const signOut = async () => {
    // a guest's only credential is this browser's session: signing out ends the account
    if (user?.isGuest && !window.confirm('You are a guest. Signing out ends this guest account — its worlds cannot be recovered. Sign out anyway?')) return
    setOpen(false)
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="shellbar">
      <Link to="/dashboard" className="wordmark" title="Your worlds">
        <Compass size={26} className="rose" />
        <span className="wm-text">Fantasy Map Timeline</span>
      </Link>
      {crumb && <span className="shellcrumb"><span className="sep">▸</span>{crumb}</span>}
      <div className="spacer" />
      {user ? (
        <div className="usermenu" ref={ref}>
          <button className="userbtn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {user.isGuest ? 'Guest' : (user.username || 'Account')} <span className="chev">▾</span>
          </button>
          {open && (
            <div className="menupop" role="menu">
              {user.isGuest && <div className="menunote" role="presentation" style={{ padding: '6px 10px', fontSize: 12, opacity: .8 }}>{user.username} — a guest in this browser</div>}
              {accountUrl && !user.isGuest && <a role="menuitem" href={accountUrl} target="_blank" rel="noreferrer" onClick={() => setOpen(false)}>Account settings ↗</a>}
              {user.isAdmin && <Link role="menuitem" to="/admin" onClick={() => setOpen(false)}>Admin panel</Link>}
              <button role="menuitem" onClick={signOut}>Sign out</button>
            </div>
          )}
        </div>
      ) : (
        <Link to="/login" className="userbtn">Sign in</Link>
      )}
    </header>
  )
}

export default TopBar
