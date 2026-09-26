import React, { Suspense, lazy } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './utils/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import PlayerView, { DeadLink } from './pages/PlayerView'
import NotFound from './pages/NotFound'
import worldService from './services/worldService'

// The Player View and the 404 load with the entry bundle; the DM's pages arrive only when a
// DM opens them — a player's phone never downloads the Forge, the Dashboard or the editor.
const Login = lazy(() => import('./pages/Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const AdminPanel = lazy(() => import('./pages/AdminPanel'))
const AuthCallback = lazy(() => import('./pages/AuthCallback'))
const ImageManager = lazy(() => import('./pages/ImageManager'))
const AtlasWorkspace = lazy(() => import('./pages/AtlasWorkspace'))

// Protected Route component — a bounce to /login REPLACES the entry (Back never traps you on
// the login page) and carries where you were going, so sign-in returns you there
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading, offline, retry } = useAuth()
  const location = useLocation()

  if (loading) {
    return <div className="route-loading">Loading...</div>
  }
  if (!isAuthenticated && offline) {
    // the token was kept; the server just could not be reached to check it
    return (
      <div className="route-loading">
        <div>Can't reach the server to check your session.</div>
        <button type="button" style={{ marginTop: 12 }} onClick={retry}>Try again</button>
      </div>
    )
  }
  return isAuthenticated ? children : <Navigate to="/login" replace state={{ from: location }} />
}

// Public Route component (redirect to dashboard if logged in)
const PublicRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth()
  
  if (loading) {
    return <div className="route-loading">Loading...</div>
  }
  
  return !isAuthenticated ? children : <Navigate to="/" replace />
}

// "/" resumes where you left off — the last map you had open — else the dashboard.
const Home = () => {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return <div className="route-loading">Loading...</div>
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />
  const last = worldService.getLastLocation()
  return <Navigate to={last ? `/w/${last.worldId}/m/${last.mapId}` : '/dashboard'} replace />
}

function AppRoutes() {
  return (
    <div className="app">
      <Suspense fallback={<div className="route-loading">Loading...</div>}>
      <Routes>
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
          path="/w/:worldId"
          element={<ProtectedRoute><AtlasWorkspace /></ProtectedRoute>}
        />
        <Route
          path="/w/:worldId/m/:mapId"
          element={<ProtectedRoute><AtlasWorkspace /></ProtectedRoute>}
        />
        {/* Public Player View — the share link. No auth on purpose. */}
        <Route path="/p/:token" element={<PlayerView />} />
        <Route path="/p/:token/m/:mapId" element={<PlayerView />} />
        <Route path="/p/*" element={<DeadLink />} />
        <Route path="/p" element={<DeadLink />} />
        <Route path="/" element={<Home />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
    </div>
  )
}

// the boundary is keyed on the path, so leaving a broken page really leaves it
// the boundary forgets a crash when the URL changes (Back, or a link out of the error page)
// WITHOUT remounting the page tree on every navigation — the workspace and the Player View
// keep their state and caches across map hops
function RoutedBoundary({ children }) {
  const location = useLocation()
  return <ErrorBoundary resetKey={location.pathname}>{children}</ErrorBoundary>
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <RoutedBoundary>
          <AppRoutes />
        </RoutedBoundary>
      </Router>
    </AuthProvider>
  )
}

export default App