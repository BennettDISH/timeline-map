// Signing in goes through Waypoint, as in the bug tracker (src/lib/signIn.js there): a page
// that needs an account sends a signed-out visitor straight to Waypoint, whose page takes the
// password or offers "Continue as guest". These are the decisions; Login, AuthCallback and
// the games' top bar (components/SiteBar.jsx) call them.
import { safeNext } from './nextPath.js'

// sessionStorage keys. sso_state is the OAuth state the callback checks; sso_next is the page
// to come back to. sso_hold keeps the sign-in page on screen instead of leaving for Waypoint:
// 'signed-out' after Sign out (going straight back would sign you in again), 'failed' after a
// callback that didn't work (going straight back could loop). 'signed-out' is kept in
// localStorage, so every tab holds: one still open would otherwise go back through Waypoint on
// its next 401 and put a new token where every tab reads it. Starting a sign-in clears both.
export const STATE_KEY = 'sso_state'
export const NEXT_KEY = 'sso_next'
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

/** Leave for Waypoint: a fresh state kept for the callback to check, the page to come back
 *  to, and for "Switch account" prompt=login (Waypoint asks again instead of reusing its
 *  session). Returns the state. */
export function startWaypoint(next = '/', { prompt } = {}) {
  const state = crypto.randomUUID()
  try {
    tabStore()?.setItem(STATE_KEY, state)
    tabStore()?.setItem(NEXT_KEY, safeNext(next))
  } catch (e) { /* storage blocked: the callback will say the state is missing */ }
  clearHold()
  const params = new URLSearchParams({ state })
  if (prompt === 'login') params.set('prompt', 'login')
  window.location.assign(`/api/auth/sso/login?${params}`)
  return state
}

/** "Sign out of all games": Waypoint's /logout, which ends its session and sends you on to
 *  `back` (the arcade) — return_to is Waypoint's name for it. */
export const waypointLogoutUrl = (accountUrl, back) => `${accountUrl}/logout?return_to=${encodeURIComponent(back)}`

/** The callback's check before any code is spent: the state Waypoint hands back must be the
 *  one this tab made (login CSRF). A message when it isn't, else null. Either way the stored
 *  state is used up, and a refusal holds the sign-in page (no loop). */
export function checkCallback({ code, state }) {
  let saved = null
  try { saved = tabStore()?.getItem(STATE_KEY) ?? null; tabStore()?.removeItem(STATE_KEY) } catch (e) { /* storage blocked */ }
  const problem = !code ? 'No authorization code received'
    : (!state || !saved || state !== saved) ? 'Invalid state parameter'
    : null
  if (problem) setHold('failed')
  return problem
}

/** Where the callback goes once signed in: the page kept by startWaypoint, used up. */
export function takeNext() {
  let next = '/'
  try { next = tabStore()?.getItem(NEXT_KEY) || '/'; tabStore()?.removeItem(NEXT_KEY) } catch (e) { /* ignore */ }
  return safeNext(next)
}

/** The page to come back to from where you are: the sign-in pages' own `next`, else this
 *  page, without ?local. */
export function nextFrom(pathname, search = '') {
  const params = new URLSearchParams(search)
  if (pathname === '/login' || pathname === '/auth/callback') return safeNext(params.get('next') || '/')
  params.delete('local')
  const qs = params.toString()
  return safeNext(qs ? `${pathname}?${qs}` : pathname)
}
