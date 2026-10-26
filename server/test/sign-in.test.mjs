// The browser's half of signing in through Waypoint (client/src/utils/signIn.js), run in node
// with a stand-in window: a signed-out page goes straight to Waypoint unless a hold or ?local
// says not to; the trip there is the server's route with the page to come back to (the server
// keeps the state and checks it, server/test/sso.test.js); a failed sign-in holds this tab and
// Sign out holds every tab.
//
//   node --test server/test/sign-in.test.mjs
import test from 'node:test'
import assert from 'node:assert'

const store = () => {
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() }
}
const assigned = []
globalThis.window = { sessionStorage: store(), localStorage: store(), location: { assign: (u) => assigned.push(u) } }
const s = await import('../../client/src/utils/signIn.js')
const tab = window.sessionStorage
const browser = window.localStorage
const fresh = () => { tab.clear(); browser.clear(); assigned.length = 0 }

test('straight to Waypoint only when it is set up, nothing holds, and ?local was not asked for', () => {
  assert.strictEqual(s.goStraightToWaypoint({ ssoEnabled: true, hold: null, wantsLocal: false }), true)
  assert.strictEqual(s.goStraightToWaypoint({ ssoEnabled: true, hold: 'signed-out', wantsLocal: false }), false)
  assert.strictEqual(s.goStraightToWaypoint({ ssoEnabled: true, hold: 'failed', wantsLocal: false }), false)
  assert.strictEqual(s.goStraightToWaypoint({ ssoEnabled: true, hold: null, wantsLocal: true }), false)
  assert.strictEqual(s.goStraightToWaypoint({ ssoEnabled: false, hold: null, wantsLocal: false }), false)
  assert.strictEqual(s.goStraightToWaypoint({ ssoEnabled: undefined, hold: null, wantsLocal: false }), false, 'not before the server says')
  assert.strictEqual(s.goStraightToWaypoint({ ssoEnabled: true, hold: 'whatever', wantsLocal: false }), true, 'only the two holds hold')
})

test('leaving for Waypoint goes through the server with the page to come back to, and lifts any hold', () => {
  fresh()
  s.setHold('signed-out')
  s.setHold('failed')
  s.startWaypoint('/w/3/m/9')
  assert.strictEqual(s.readHold(), null)
  assert.deepStrictEqual(assigned, ['/api/auth/sso/login?next=%2Fw%2F3%2Fm%2F9'])
  s.startWaypoint('/dashboard', { prompt: 'login' })
  assert.strictEqual(assigned[1], '/api/auth/sso/login?next=%2Fdashboard&prompt=login')
  s.startWaypoint('/')
  assert.strictEqual(assigned[2], '/api/auth/sso/login', 'the usual landing needs no next')
  s.startWaypoint('//elsewhere.example/x', { prompt: 'none' })
  assert.strictEqual(assigned[3], '/api/auth/sso/login', 'never a page off this site, and no other prompt')
})

test('a sign-in that came back with an error says why', () => {
  assert.strictEqual(s.signInError(null), null)
  assert.match(s.signInError('sso_busy'), /Too many sign-in attempts/)
  for (const code of ['sso_state', 'sso_exchange', 'sso_save', 'anything']) assert.match(s.signInError(code), /did not finish/, code)
})

test('a failed sign-in holds this tab; Sign out holds every tab of the browser; starting a sign-in lifts both', () => {
  fresh()
  s.setHold('failed')
  assert.deepStrictEqual([tab.getItem(s.HOLD_KEY), browser.getItem(s.HOLD_KEY)], ['failed', null])
  s.setHold('signed-out')
  assert.strictEqual(browser.getItem(s.HOLD_KEY), 'signed-out')
  tab.clear()
  assert.strictEqual(s.readHold(), 'signed-out', 'another tab, the same browser')
  s.setHold('something')
  assert.strictEqual(tab.getItem(s.HOLD_KEY), null)
  s.clearHold()
  assert.strictEqual(s.readHold(), null)
})

test('"Sign out of all games" goes through the server to Waypoint\'s /logout, which returns you to the arcade', () => {
  assert.strictEqual(s.logoutAllPath('https://games.bennettdishman.com/'),
    '/api/auth/logout-all?return_to=https%3A%2F%2Fgames.bennettdishman.com%2F')
})

test('the page to come back to: the sign-in page\'s own next, else where you are, without ?local', () => {
  assert.strictEqual(s.nextFrom('/login', '?next=%2Fw%2F4'), '/w/4')
  assert.strictEqual(s.nextFrom('/login', '?local'), '/')
  assert.strictEqual(s.nextFrom('/worlds/2/images', '?local&f=3'), '/worlds/2/images?f=3')
  assert.strictEqual(s.nextFrom('/auth/callback', '?code=x&state=y'), '/')
  assert.strictEqual(s.nextFrom('/login', '?next=%2F%2Fevil.example'), '/')
})
