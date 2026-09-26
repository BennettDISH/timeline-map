import React, { createContext, useContext, useReducer, useEffect } from 'react'
import authService from '../services/authService'
import { errText } from '../services/http'

const AuthContext = createContext()

// Two different clocks: `initializing` is the one-time check of the stored token that the
// route guards wait for; `submitting` is a sign-in / sign-up / guest call in flight, which
// only the login card cares about (it keeps its form up and its button busy).
const authReducer = (state, action) => {
  switch (action.type) {
    case 'LOGIN_START':
      return { ...state, submitting: true, error: null }
    case 'LOGIN_SUCCESS':
      return { ...state, initializing: false, submitting: false, offline: false, isAuthenticated: true, user: action.payload.user, error: null }
    case 'LOGIN_ERROR':
      return { ...state, initializing: false, submitting: false, isAuthenticated: false, user: null, error: action.payload }
    case 'LOGOUT':
      return { ...state, initializing: false, submitting: false, offline: false, isAuthenticated: false, user: null, error: null }
    case 'OFFLINE':
      return { ...state, initializing: false, submitting: false, offline: true }
    case 'CLEAR_ERROR':
      return { ...state, error: null }
    default:
      return state
  }
}

const initialState = {
  isAuthenticated: false,
  user: null,
  initializing: true, // route guards wait for the initial token check instead of bouncing to /login
  submitting: false,
  offline: false, // the server could not be reached to check the token; nothing was thrown away
  error: null,
}

const TOKEN_DEAD = /token|access token|user not found/i
// only the server saying the TOKEN is bad ends a session — a 5xx, a 429 or no network is a blip
const tokenDead = (e) => { const s = e?.response?.status; return s === 401 || (s === 403 && TOKEN_DEAD.test(e?.response?.data?.message || '')) }

export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState)

  const checkAuth = async () => {
    // the Player View is public: it never asks who the visitor is, so a stale DM token in
    // this browser can neither bounce a player to the login page nor spend a request
    if (/^\/p(\/|$)/.test(window.location.pathname)) { dispatch({ type: 'LOGOUT' }); return }
    if (!authService.isAuthenticated()) { dispatch({ type: 'LOGOUT' }); return }
    try {
      const user = await authService.getCurrentUser()
      dispatch({ type: 'LOGIN_SUCCESS', payload: { user } })
    } catch (error) {
      if (tokenDead(error)) {
        // the stored token did not work: drop it locally only (never revoke other devices
        // over what this browser holds)
        authService.clearSession()
        dispatch({ type: 'LOGOUT' })
        return
      }
      // a server blip or a dead network: keep the token. With a remembered user the app
      // simply carries on (each call reports its own failure); without one, wait and retry.
      const cached = authService.getUser()
      if (cached) dispatch({ type: 'LOGIN_SUCCESS', payload: { user: cached } })
      else dispatch({ type: 'OFFLINE' })
    }
  }

  // Check for existing authentication on app load
  useEffect(() => { checkAuth() }, [])

  const login = async (username, password) => {
    dispatch({ type: 'LOGIN_START' })
    try {
      const response = await authService.login(username, password)
      dispatch({ type: 'LOGIN_SUCCESS', payload: { user: response.user } })
      return response
    } catch (error) {
      dispatch({ type: 'LOGIN_ERROR', payload: errText(error, 'Login failed') })
      throw error
    }
  }

  const register = async (username, email, password) => {
    dispatch({ type: 'LOGIN_START' })
    try {
      const response = await authService.register(username, email, password)
      dispatch({ type: 'LOGIN_SUCCESS', payload: { user: response.user } })
      return response
    } catch (error) {
      dispatch({ type: 'LOGIN_ERROR', payload: errText(error, 'Registration failed') })
      throw error
    }
  }

  const ssoLogin = async (code, redirectUri) => {
    dispatch({ type: 'LOGIN_START' })
    try {
      const response = await authService.ssoLogin(code, redirectUri)
      dispatch({ type: 'LOGIN_SUCCESS', payload: { user: response.user } })
      return response
    } catch (error) {
      dispatch({ type: 'LOGIN_ERROR', payload: errText(error, 'SSO login failed') })
      throw error
    }
  }

  const guestLogin = async () => {
    dispatch({ type: 'LOGIN_START' })
    try {
      const response = await authService.guest()
      dispatch({ type: 'LOGIN_SUCCESS', payload: { user: response.user } })
      return response
    } catch (error) {
      dispatch({ type: 'LOGIN_ERROR', payload: errText(error, 'Could not start a guest session') })
      throw error
    }
  }

  // Adopt a session minted outside the login/register flow
  const setSession = (token, user) => {
    authService.setSession(token, user)
    dispatch({ type: 'LOGIN_SUCCESS', payload: { user } })
  }

  const logout = async () => {
    await authService.logout()
    dispatch({ type: 'LOGOUT' })
  }

  const clearError = () => dispatch({ type: 'CLEAR_ERROR' })

  const value = {
    ...state,
    loading: state.initializing, // the guards' name for it
    login,
    register,
    ssoLogin,
    guestLogin,
    setSession,
    logout,
    clearError,
    retry: checkAuth,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
