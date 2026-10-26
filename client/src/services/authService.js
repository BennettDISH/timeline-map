// The session is an httpOnly cookie the server sets with every sign-in (fleet-kit); the dead-
// session redirect lives in the shared http instance. This browser remembers only the account
// it last saw ('user'), so a server blip on load can carry on as that account.
import api, { clearLocalSession } from './http'

const remember = (user) => {
  try { if (user) localStorage.setItem('user', JSON.stringify(user)) } catch (e) { /* a convenience */ }
}

// Until 2026-10 the session was a token kept in localStorage. A page that still holds one hands
// it to the server once, with its first /me, and the server swaps it for the session cookie;
// then it is deleted here, so nobody is signed out by the move.
const OLD_TOKEN = 'auth_token'

const authService = {
  // Register new user
  async register(username, email, password) {
    const response = await api.post('/api/auth/register', { username, email, password })
    remember(response.data.user)
    return response.data
  },

  // Login user
  async login(username, password) {
    const response = await api.post('/api/auth/login', { username, password })
    remember(response.data.user)
    return response.data
  },

  // Forget what this browser remembers without touching the server. For "the session we had
  // did not work" — never revoke the account's OTHER devices over what may be a passing error.
  clearSession() {
    clearLocalSession()
  },

  // Logout user: the server ends the session on every device (token_version), which is the
  // intended meaning of a deliberate sign-out, and clears the cookie. Throws when it could not:
  // the cookie is still there, so this browser stays signed in and can try again.
  async logout() {
    // an empty object, never null: a JSON body of `null` is rejected by the parser before
    // the route runs
    await api.post('/api/auth/logout', {})
    authService.clearSession()
  },

  // The signed-in account, or null when nobody is
  async getCurrentUser() {
    let old = null
    try { old = localStorage.getItem(OLD_TOKEN) } catch (e) { /* storage blocked */ }
    try {
      const response = await api.get('/api/auth/me', old ? { headers: { Authorization: `Bearer ${old}` } } : undefined)
      const user = response.data.user || null
      if (user) remember(user)
      return user
    } finally {
      if (old) { try { localStorage.removeItem(OLD_TOKEN) } catch (e) { /* ignore */ } }
    }
  },

  // Get stored user data
  getUser() {
    try {
      const user = localStorage.getItem('user')
      return user ? JSON.parse(user) : null
    } catch (e) {
      return null
    }
  },

  // One-click guest sign-in — the server mints a central guest account and sets the session.
  async guest() {
    const response = await api.post('/api/auth/guest')
    remember(response.data.user)
    return response.data
  },
}

export default authService
