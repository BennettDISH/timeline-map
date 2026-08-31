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

  // Logout user (stateless JWT - just clear local storage)
  logout() {
    localStorage.removeItem('auth_token')
    localStorage.removeItem('user')
  },

  // Get current user
  async getCurrentUser() {
    try {
      const response = await api.get('/api/auth/me')
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