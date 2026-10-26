import React, { useEffect, useRef } from 'react'
import 'fleet-kit/client/topbar'
import 'fleet-kit/client/topbar.css'
import '../styles/gamesbar.css'

// The way back to every game. This is the one place to change it.
export const ARCADE_URL = 'https://games.bennettdishman.com/'

/** The bar every game shares: fleet-kit's <fleet-topbar>, "◂ All games" and the account chip.
 *  `account` is undefined while the app is still asking who this is (no chip yet), null when
 *  signed out (the chip says "Sign in"), else { name }. The Atlas says who it is (`manual`) and
 *  takes over the menu (SiteBar.jsx: a guest is warned before signing out, and the sign-in page
 *  holds after it); it lays its pages out under the bar itself (`no-pad`, body.gtb-on). */
export default function GamesBar({ account, onSignIn, onSwitch, onSignOut, onSignOutAll }) {
  const bar = useRef(null)

  useEffect(() => {
    document.body.classList.add('gtb-on')
    return () => document.body.classList.remove('gtb-on')
  }, [])

  useEffect(() => {
    if (bar.current) bar.current.account = account
  }, [account])

  useEffect(() => {
    const el = bar.current
    if (!el) return undefined
    const take = (run) => (e) => {
      if (!run) return
      e.preventDefault()
      run()
    }
    const handlers = {
      'fleet-topbar-signin': take(onSignIn),
      'fleet-topbar-switch': take(onSwitch),
      'fleet-topbar-signout': take(onSignOut),
      'fleet-topbar-signout-all': take(onSignOutAll),
    }
    for (const [name, fn] of Object.entries(handlers)) el.addEventListener(name, fn)
    return () => {
      for (const [name, fn] of Object.entries(handlers)) el.removeEventListener(name, fn)
    }
  }, [onSignIn, onSwitch, onSignOut, onSignOutAll])

  return <fleet-topbar ref={bar} home={ARCADE_URL} manual="" no-pad="" />
}
