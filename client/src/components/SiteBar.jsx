import React, { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useAuth } from '../utils/AuthContext'
import { nextFrom, startWaypoint, waypointLogoutUrl } from '../utils/signIn'
import GamesBar, { ARCADE_URL } from './GamesBar'

// Never in the Player View (/p/…, the share link the players open) nor anywhere the Atlas is
// framed: Spellforge embeds that view, and the DM's 🎭 Player posture is an iframe of it.
const framed = (() => { try { return window.self !== window.top } catch (e) { return true } })()
export const barHidden = (pathname) => framed || /^\/p(\/|$)/.test(pathname)

const GUEST_WARNING = 'You are a guest. Signing out ends this guest account — its worlds cannot be recovered. Sign out anyway?'

/** The games' top bar over the Atlas: the study pages and the workspace, which sits under it. */
export default function SiteBar() {
  const { pathname, search } = useLocation()
  if (barHidden(pathname)) return null
  return <Bar next={nextFrom(pathname, search)} />
}

let configCache // { ssoEnabled, accountUrl }, once the server has said
function Bar({ next }) {
  const { user, loading, logout } = useAuth()
  const navigate = useNavigate()
  const [config, setConfig] = useState(configCache || null)
  useEffect(() => {
    if (configCache) return
    fetch('/api/auth/config').then((r) => r.json())
      .then((d) => { configCache = { ssoEnabled: !!d.ssoEnabled, accountUrl: d.accountUrl || null }; setConfig(configCache) })
      .catch(() => { /* unknown: the chip still offers Waypoint */ })
  }, [])
  const waypoint = config?.ssoEnabled !== false

  const signIn = () => (waypoint ? startWaypoint(next) : navigate('/login'))
  const signOut = async () => {
    // a guest's only credential is this browser's session: signing out ends the account
    if (user?.isGuest && !window.confirm(GUEST_WARNING)) return false
    await logout()
    navigate('/login', { replace: true })
    return true
  }
  // Waypoint asks for an account again (prompt=login); without Waypoint, sign out and pick on the form
  const switchAccount = () => (waypoint ? startWaypoint(next, { prompt: 'login' }) : signOut())
  // Waypoint's own session ends at its /logout, which then sends you on to the arcade
  const signOutAll = async () => { if (await signOut() && config?.accountUrl) window.location.assign(waypointLogoutUrl(config.accountUrl, ARCADE_URL)) }

  const account = loading ? undefined : user ? { name: user.isGuest ? 'Guest' : (user.username || 'Account') } : null
  return <GamesBar account={account} onSignIn={signIn} onSwitch={switchAccount} onSignOut={signOut} onSignOutAll={signOutAll} />
}
