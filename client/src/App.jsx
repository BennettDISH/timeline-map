import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './utils/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import MapManager from './pages/MapManager'
import MapViewer from './pages/MapViewer'
import AdminPanel from './pages/AdminPanel'
import Setup from './pages/Setup'
import AuthCallback from './pages/AuthCallback'
import EnvSetup from './pages/EnvSetup'
import WorldSettings from './pages/WorldSettings'
import MapSettings from './pages/MapSettings'
import ImageManager from './pages/ImageManager'
import AtlasWorkspace from './pages/AtlasWorkspace'

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
        <Route path="/auth/callback" element={<AuthCallback />} />
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
          path="/worlds/:worldId/maps" 
          element={
            <ProtectedRoute>
              <MapManager />
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
          path="/map/:mapId/settings" 
          element={
            <ProtectedRoute>
              <MapSettings />
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
          path="/worlds/:worldId/images" 
          element={
            <ProtectedRoute>
              <ImageManager />
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
        <Route
          path="/w/:worldId"
          element={<ProtectedRoute><AtlasWorkspace /></ProtectedRoute>}
        />
        <Route
          path="/w/:worldId/m/:mapId"
          element={<ProtectedRoute><AtlasWorkspace /></ProtectedRoute>}
        />
        <Route path="/" element={<Navigate to="/dashboard" />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <ErrorBoundary>
          <AppRoutes />
        </ErrorBoundary>
      </Router>
    </AuthProvider>
  )
}

export default App