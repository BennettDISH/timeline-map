import React from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import MapView from './pages/MapView'

function App() {
  return (
    <Router>
      <div className="app">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/map/:mapId?" element={<MapView />} />
          <Route path="/" element={<Dashboard />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App