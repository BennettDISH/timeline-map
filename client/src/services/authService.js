// Session handling (token header + dead-token redirect) lives in the shared http instance.
import api from './http'

const authService = {
  // Register new user
  async register(username, email, password) {
    try {
      const response = await api.post('/api/auth/register', {
        username,
        email,
        password
      })
      
      if (response.data.token) {
        localStorage.setItem('auth_token', response.data.token)
        localStorage.setItem('user', JSON.stringify(response.data.user))
      }
      
      return response.data
    } catch (error) {
      throw error.response?.data || { message: 'Registration failed' }
    }
  },

  // Login user
  async login(username, password) {
    try {
      const response = await api.post('/api/auth/login', {
        username,
        password
      })
      
      if (response.data.token) {
        localStorage.setItem('auth_token', response.data.token)
        localStorage.setItem('user', JSON.stringify(response.data.user))
      }
      
      return response.data
    } catch (error) {
      throw error.response?.data || { message: 'Login failed' }
    }
  },

  // Drop this browser's session without touching the server. For "the token we hold did
  // not work" — a failed /me, an expired token — where revoking the user's OTHER devices
  // over what may be a passing server error would be wrong.
  clearSession() {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('user')
  },

  // Logout user. Forgetting the token locally does not stop it working — it stays valid
  // until it expires — so tell the server to bump this user's token_version, which makes
  // every copy of it (including one already stolen) fail auth. That does end the session
  // on their other devices too, which is the intended meaning of a deliberate sign-out.
  // Local state goes first regardless, so a slow or down server can never leave this
  // browser signed in.
  async logout() {
    const token = localStorage.getItem('auth_token')
    authService.clearSession()
    if (!token) return
    try {
      await api.post('/api/auth/logout', null, { headers: { Authorization: `Bearer ${token}` } })
    } catch (error) {
      // Already signed out here; a dead or unreachable token just expires on its own.
    }
  },

  // Get current user
  async getCurrentUser() {
    try {
      const response = await api.get('/api/auth/me')
      // Sliding session: the server returns a fresh token once the current one is past
      // halfway through its life, so an app that is actually being used never runs into
      // the short expiry. Absent on every other call — only store one when it is there.
      if (response.data.token) {
        localStorage.setItem('auth_token', response.data.token)
      }
      return response.data.user
    } catch (error) {
      throw error.response?.data || { message: 'Failed to get user' }
    }
  },

  // Store a session minted outside the normal login flow (e.g. first-run setup)
  setSession(token, user) {
    localStorage.setItem('auth_token', token)
    localStorage.setItem('user', JSON.stringify(user))
  },

  // Check if user is logged in
  isAuthenticated() {
    return !!localStorage.getItem('auth_token')
  },

  // Get stored user data
  getUser() {
    const user = localStorage.getItem('user')
    return user ? JSON.parse(user) : null
  },

  // One-click guest sign-in — the server mints a central guest account and returns a token.
  async guest() {
    try {
      const response = await api.post('/api/auth/guest')
      if (response.data.token) {
        localStorage.setItem('auth_token', response.data.token)
        localStorage.setItem('user', JSON.stringify(response.data.user))
      }
      return response.data
    } catch (error) {
      throw error.response?.data || { message: 'Could not start a guest session' }
    }
  },

  // SSO login — exchange authorization code
  async ssoLogin(code, redirectUri) {
    try {
      const response = await api.post('/api/auth/sso-callback', { code, redirect_uri: redirectUri })

      if (response.data.token) {
        localStorage.setItem('auth_token', response.data.token)
        localStorage.setItem('user', JSON.stringify(response.data.user))
      }

      return response.data
    } catch (error) {
      throw error.response?.data || { message: 'SSO login failed' }
    }
  },

  // Get stored token
  getToken() {
    return localStorage.getItem('auth_token')
  }
}

export default authService