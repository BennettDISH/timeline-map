import React, { useEffect, useId, useRef, useState } from 'react'
import '../styles/gamesbar.css'

// The way back to every game. It moves to the site's own address later: this is the one place
// to change it.
export const ARCADE_URL = 'https://quickplay-arcade-production.up.railway.app/'

/** The bar every game shares: "◂ All games" and the account chip. `account` is undefined
 *  while the app is still asking who this is (no chip yet), null when signed out (the chip
 *  says "Sign in"), else { name }. */
export default function GamesBar({ account, onSignIn, onSwitch, onSignOut, onSignOutAll }) {
  useEffect(() => {
    document.body.classList.add('gtb-on')
    return () => document.body.classList.remove('gtb-on')
  }, [])
  return (
    <nav className="gtb" aria-label="Games and account">
      <a className="gtb-home" href={ARCADE_URL}><span aria-hidden="true">◂</span> All games</a>
      {account === null ? (
        <div className="gtb-acct">
          <button type="button" className="gtb-chip" aria-label="Sign in with Waypoint" onClick={onSignIn}>Sign in</button>
        </div>
      ) : account ? (
        <AccountMenu name={account.name} onSwitch={onSwitch} onSignOut={onSignOut} onSignOutAll={onSignOutAll} />
      ) : null}
    </nav>
  )
}

function AccountMenu({ name, onSwitch, onSignOut, onSignOutAll }) {
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  const chip = useRef(null)
  const menuId = useId()
  const items = () => [...(box.current?.querySelectorAll('[role="menuitem"]') ?? [])]

  // open: the first choice has the focus; a press anywhere else closes it
  useEffect(() => {
    if (!open) return undefined
    items()[0]?.focus()
    const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', away)
    return () => document.removeEventListener('pointerdown', away)
  }, [open])

  const onKeyDown = (e) => {
    if (!open) {
      if (e.key === 'ArrowDown' && e.target === chip.current) { e.preventDefault(); setOpen(true) }
      return
    }
    const list = items()
    const at = list.indexOf(document.activeElement)
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); chip.current?.focus() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); list[(at + 1) % list.length]?.focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(at - 1 + list.length) % list.length]?.focus() }
    else if (e.key === 'Home') { e.preventDefault(); list[0]?.focus() }
    else if (e.key === 'End') { e.preventDefault(); list[list.length - 1]?.focus() }
    else if (e.key === 'Tab') setOpen(false)
  }
  const pick = (act) => () => { setOpen(false); act?.() }

  return (
    <div className="gtb-acct" ref={box} onKeyDown={onKeyDown}>
      <button ref={chip} type="button" className="gtb-chip" aria-label={`Account: ${name}`}
        aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}>
        <span className="gtb-name">{name}</span><span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="gtb-menu" role="menu" id={menuId} aria-label="Account menu">
          <button type="button" role="menuitem" tabIndex={-1} onClick={pick(onSwitch)}>Switch account</button>
          <button type="button" role="menuitem" tabIndex={-1} onClick={pick(onSignOut)}>Sign out</button>
          <button type="button" role="menuitem" tabIndex={-1} onClick={pick(onSignOutAll)}>Sign out of all games</button>
        </div>
      )}
    </div>
  )
}
