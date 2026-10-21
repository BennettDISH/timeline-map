// The browser's half of signing in through Waypoint (client/src/utils/signIn.js), run in node
// with a stand-in window: a signed-out page goes straight to Waypoint unless a hold or ?local
// says not to; the state the tab makes is the only one its callback accepts, and is used once;
// a refused callback holds the sign-in page so it can't loop; Sign out holds every tab.
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

test('leaving for Waypoint keeps a fresh state and the page to come back to, lifts any hold, and sends the state along', () => {
  fresh()
  s.setHold('signed-out')
  s.setHold('failed')
  const state = s.startWaypoint('/w/3/m/9')
  assert.match(state, /^[0-9a-f-]{36}$/)
  assert.strictEqual(tab.getItem(s.STATE_KEY), state)
  assert.strictEqual(tab.getItem(s.NEXT_KEY), '/w/3/m/9')
  assert.strictEqual(s.readHold(), null)
  assert.deepStrictEqual(assigned, [`/api/auth/sso/login?state=${state}`])
  const again = s.startWaypoint('/dashboard', { prompt: 'login' })
  assert.notStrictEqual(again, state, 'a new state every time')
  assert.strictEqual(assigned[1], `/api/auth/sso/login?state=${again}&prompt=login`)
  s.startWaypoint('//elsewhere.example/x')
  assert.strictEqual(tab.getItem(s.NEXT_KEY), '/', 'never a page off this site')
})

test('the callback takes only the state this tab made, once; anything else is refused and holds the sign-in page', () => {
  fresh()
  const state = s.startWaypoint('/dashboard')
  assert.strictEqual(s.checkCallback({ code: 'c0de', state }), null)
  assert.strictEqual(tab.getItem(s.STATE_KEY), null, 'used up')
  assert.strictEqual(s.readHold(), null)
  assert.strictEqual(s.takeNext(), '/dashboard')
  assert.strictEqual(s.takeNext(), '/', 'used up too')
  // the same answer a second time (a replayed link, a second run) is refused
  assert.strictEqual(s.checkCallback({ code: 'c0de', state }), 'Invalid state parameter')
  assert.strictEqual(s.readHold(), 'failed')

  for (const [label, made, back] of [['forged', true, 'not-the-one'], ['none sent back', true, null], ['none made here', false, 'abc']]) {
    fresh()
    if (made) s.startWaypoint('/')
    assert.strictEqual(s.checkCallback({ code: 'c0de', state: back }), 'Invalid state parameter', label)
    assert.strictEqual(s.readHold(), 'failed', label)
  }
  fresh()
  const st = s.startWaypoint('/')
  assert.strictEqual(s.checkCallback({ code: null, state: st }), 'No authorization code received')
  assert.strictEqual(s.readHold(), 'failed')
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

test('"Sign out of all games" ends at Waypoint\'s /logout, which returns you to the arcade', () => {
  assert.strictEqual(s.waypointLogoutUrl('http://waypoint.test', 'https://quickplay-arcade-production.up.railway.app/'),
    'http://waypoint.test/logout?return_to=https%3A%2F%2Fquickplay-arcade-production.up.railway.app%2F')
})

test('the page to come back to: the sign-in page\'s own next, else where you are, without ?local', () => {
  assert.strictEqual(s.nextFrom('/login', '?next=%2Fw%2F4'), '/w/4')
  assert.strictEqual(s.nextFrom('/login', '?local'), '/')
  assert.strictEqual(s.nextFrom('/worlds/2/images', '?local&f=3'), '/worlds/2/images?f=3')
  assert.strictEqual(s.nextFrom('/auth/callback', '?code=x&state=y'), '/')
  assert.strictEqual(s.nextFrom('/login', '?next=%2F%2Fevil.example'), '/')
})
