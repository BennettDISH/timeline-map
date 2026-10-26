// Signing in goes through Waypoint: a page that needs an account sends a signed-out visitor
// straight to Waypoint, whose page takes the password or offers "Continue as guest". The server
// builds the trip there and takes the code back (fleet-kit): it keeps the OAuth state in a cookie
// of its own, finishes the sign-in at /auth/callback, sets the session and sends the browser on
// to the page that needed an account. These are the page's decisions; Login and the games' top
// bar (components/SiteBar.jsx) call them.
import { safeNext } from './nextPath.js'

// The hold keeps the sign-in page on screen instead of leaving for Waypoint: 'signed-out' after
// Sign out (going straight back would sign you in again), 'failed' after a sign-in that came
// back with an error (going straight back could loop). 'signed-out' is kept in localStorage, so
// every tab holds: one still open would otherwise go back through Waypoint on its next 401.
// Starting a sign-in clears both.
export const HOLD_KEY = 'sso_hold'
const HOLDS = ['signed-out', 'failed']

export const holdReason = (value) => (HOLDS.includes(value) ? value : null)

const tabStore = () => { try { return window.sessionStorage } catch (e) { return null } }
const browserStore = () => { try { return window.localStorage } catch (e) { return null } }

export function readHold() {
  try { const tab = holdReason(tabStore()?.getItem(HOLD_KEY)); if (tab) return tab } catch (e) { /* storage blocked */ }
  try { return holdReason(browserStore()?.getItem(HOLD_KEY)) } catch (e) { return null }
}
export function setHold(reason) {
  if (!holdReason(reason)) return
  try { (reason === 'signed-out' ? browserStore() : tabStore())?.setItem(HOLD_KEY, reason) } catch (e) { /* storage blocked */ }
}
export function clearHold() {
  try { tabStore()?.removeItem(HOLD_KEY) } catch (e) { /* storage blocked */ }
  try { browserStore()?.removeItem(HOLD_KEY) } catch (e) { /* storage blocked */ }
}

// Straight to Waypoint only when it is set up, nothing holds the page, and the Atlas's own
// form wasn't asked for with ?local.
export function goStraightToWaypoint({ ssoEnabled, hold, wantsLocal }) {
  return ssoEnabled === true && !holdReason(hold) && !wantsLocal
}

/** The server's route to Waypoint, with the page to come back to (the server follows it only
 *  to a path on this site), and for "Switch account" prompt=login (Waypoint asks again instead
 *  of reusing its session). */
export function signInPath(next = '/', { prompt } = {}) {
  const params = new URLSearchParams()
  const back = safeNext(next)
  if (back !== '/') params.set('next', back)
  if (prompt === 'login') params.set('prompt', 'login')
  const qs = params.toString()
  return `/api/auth/sso/login${qs ? `?${qs}` : ''}`
}

/** Leave for Waypoint, lifting any hold: asking is always allowed. */
export function startWaypoint(next = '/', { prompt } = {}) {
  clearHold()
  window.location.assign(signInPath(next, { prompt }))
}

/** "Sign out of all games": after this browser's own sign-out, the server's route to Waypoint's
 *  /logout, which ends its session and sends you on to `back` (the arcade). */
export const logoutAllPath = (back) => `/api/auth/logout-all?return_to=${encodeURIComponent(back)}`

/** What the sign-in page says when the server sent it back with ?error= (fleet-kit's codes);
 *  null without one. */
export function signInError(code) {
  if (!code) return null
  if (code === 'sso_busy') return 'Too many sign-in attempts from here. Wait a few minutes and try again.'
  return 'Waypoint sign-in did not finish. Try again.'
}

/** The page to come back to from where you are: the sign-in page's own `next`, else this
 *  page, without ?local. */
export function nextFrom(pathname, search = '') {
  const params = new URLSearchParams(search)
  if (pathname === '/login' || pathname === '/auth/callback') return safeNext(params.get('next') || '/')
  params.delete('local')
  const qs = params.toString()
  return safeNext(qs ? `${pathname}?${qs}` : pathname)
}
