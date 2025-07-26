import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './utils/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import MapView from './pages/MapView'
import AdminPanel from './pages/AdminPanel'
import Setup from './pages/Setup'

// Protected Route component
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth()
  
  if (loading) {
    return <div className="loading">Loading...</div>
  }
  
  return isAuthenticated ? children : <Navigate to="/login" />
}

// Public Route component (redirect to dashboard if logged in)
const PublicRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth()
  
  if (loading) {
    return <div className="loading">Loading...</div>
  }
  
  return !isAuthenticated ? children : <Navigate to="/dashboard" />
}

function AppRoutes() {
  return (
    <div className="app">
      <Routes>
        <Route 
          path="/setup" 
          element={<Setup />} 
        />
        <Route 
          path="/login" 
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          } 
        />
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/map/:mapId?" 
          element={
            <ProtectedRoute>
              <MapView />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/admin" 
          element={
            <ProtectedRoute>
              <AdminPanel />
            </ProtectedRoute>
          } 
        />
        <Route path="/" element={<Navigate to="/dashboard" />} />
      </Routes>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  )
}

export default App