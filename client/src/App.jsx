import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './utils/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import MapManager from './pages/MapManager'
import MapViewer from './pages/MapViewer'
import AdminPanel from './pages/AdminPanel'
import Setup from './pages/Setup'
import EnvSetup from './pages/EnvSetup'
import Migration from './pages/Migration'
import WorldSettings from './pages/WorldSettings'
import ImageManager from './pages/ImageManager'

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
          path="/env-setup" 
          element={<EnvSetup />} 
        />
        <Route 
          path="/migration" 
          element={<Migration />} 
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
          path="/maps" 
          element={
            <ProtectedRoute>
              <MapManager />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/map/:mapId" 
          element={
            <ProtectedRoute>
              <MapViewer />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/world/:worldId/settings" 
          element={
            <ProtectedRoute>
              <WorldSettings />
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
        <Route 
          path="/images" 
          element={
            <ProtectedRoute>
              <ImageManager />
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