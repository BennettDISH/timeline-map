import React, { createContext, useContext, useReducer, useEffect } from 'react'
import authService from '../services/authService'

const AuthContext = createContext()

const authReducer = (state, action) => {
  switch (action.type) {
    case 'LOGIN_START':
      return { ...state, loading: true, error: null }
    case 'LOGIN_SUCCESS':
      return { 
        ...state, 
        loading: false, 
        isAuthenticated: true, 
        user: action.payload.user,
        error: null 
      }
    case 'LOGIN_ERROR':
      return { 
        ...state, 
        loading: false, 
        isAuthenticated: false, 
        user: null,
        error: action.payload 
      }
    case 'LOGOUT':
      return { 
        ...state, 
        isAuthenticated: false, 
        user: null,
        loading: false,
        error: null 
      }
    case 'CLEAR_ERROR':
      return { ...state, error: null }
    default:
      return state
  }
}

const initialState = {
  isAuthenticated: false,
  user: null,
  loading: false,
  error: null
}

export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState)

  // Check for existing authentication on app load
  useEffect(() => {
    const checkAuth = async () => {
      if (authService.isAuthenticated()) {
        try {
          const user = await authService.getCurrentUser()
          dispatch({ 
            type: 'LOGIN_SUCCESS', 
            payload: { user } 
          })
        } catch (error) {
          // Token might be expired
          authService.logout()
          dispatch({ type: 'LOGOUT' })
        }
      }
    }
    
    checkAuth()
  }, [])

  const login = async (username, password) => {
    dispatch({ type: 'LOGIN_START' })
    try {
      const response = await authService.login(username, password)
      dispatch({ 
        type: 'LOGIN_SUCCESS', 
        payload: { user: response.user } 
      })
      return response
    } catch (error) {
      dispatch({ 
        type: 'LOGIN_ERROR', 
        payload: error.message || 'Login failed' 
      })
      throw error
    }
  }

  const register = async (username, email, password) => {
    dispatch({ type: 'LOGIN_START' })
    try {
      const response = await authService.register(username, email, password)
      dispatch({ 
        type: 'LOGIN_SUCCESS', 
        payload: { user: response.user } 
      })
      return response
    } catch (error) {
      dispatch({ 
        type: 'LOGIN_ERROR', 
        payload: error.message || 'Registration failed' 
      })
      throw error
    }
  }

  const logout = async () => {
    await authService.logout()
    dispatch({ type: 'LOGOUT' })
  }

  const clearError = () => {
    dispatch({ type: 'CLEAR_ERROR' })
  }

  const value = {
    ...state,
    login,
    register,
    logout,
    clearError
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