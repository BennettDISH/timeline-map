import React, { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import '../styles/mapSettings.scss'

function MapSettings() {
  const { mapId } = useParams()
  const navigate = useNavigate()
  
  const [map, setMap] = useState(null)
  const [world, setWorld] = useState(null)
  const [availableImages, setAvailableImages] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  
  const [mapFormData, setMapFormData] = useState({
    title: '',
    description: ''
  })
  

  useEffect(() => {
    if (mapId) {
      loadMapData()
    }
  }, [mapId])

  const createAuthAPI = () => {
    const token = localStorage.getItem('auth_token')
    return axios.create({
      baseURL: '/api',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
  }

  const loadMapData = async () => {
    try {
      setLoading(true)
      const api = createAuthAPI()
      
      // Load map data
      const mapResponse = await api.get(`/maps/${mapId}`)
      const mapData = mapResponse.data.map
      setMap(mapData)
      
      // Load world data for timeline settings
      const worldResponse = await api.get(`/worlds/${mapData.worldId}`)
      setWorld(worldResponse.data.world)
      
      // Load available images for this world
      const imagesResponse = await api.get(`/images?world_id=${mapData.worldId}`)
      setAvailableImages(imagesResponse.data.images || [])
      
      
      setMapFormData({
        title: mapData.title,
        description: mapData.description || ''
      })
      
      setError('')
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load map data')
    } finally {
      setLoading(false)
    }
  }

  const handleMapUpdate = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    
    try {
      const api = createAuthAPI()
      await api.put(`/maps/${mapId}`, mapFormData)
      setSuccess('Map details updated successfully!')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update map')
    } finally {
      setSaving(false)
    }
  }

  





  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <p>Loading map settings...</p>
      </div>
    )
  }

  if (!map) {
    return (
      <div className="error-container">
        <h2>Map Not Found</h2>
        <p>The requested map could not be found.</p>
        <Link to="/worlds" className="back-link">← Back to Worlds</Link>
      </div>
    )
  }

  return (
    <div className="settings-page">
      <div className="settings-header">
        <div className="header-content">
          <div className="header-text">
            <h1>⚙️ Map Settings</h1>
            <p>Configure map details</p>
          </div>
          <div className="header-actions">
            <Link to={`/worlds/${map.worldId}/maps`} className="back-button">
              ← Back to Maps
            </Link>
            <Link to={`/map/${mapId}`} className="view-button">
              👁️ View Map
            </Link>
          </div>
        </div>
      </div>

      <div className="settings-container">
        {error && (
          <div className="error-message">
            ❌ {error}
          </div>
        )}

        {success && (
          <div className="success-message">
            ✅ {success}
          </div>
        )}

        {/* Map Details Section */}
        <div className="settings-section">
          <h2>📍 Map Details</h2>
          <form onSubmit={handleMapUpdate} className="settings-form">
            <div className="form-group">
              <label htmlFor="title">Map Title:</label>
              <input
                id="title"
                type="text"
                value={mapFormData.title}
                onChange={(e) => setMapFormData({ ...mapFormData, title: e.target.value })}
                required
                disabled={saving}
              />
            </div>

            <div className="form-group">
              <label htmlFor="description">Description:</label>
              <textarea
                id="description"
                value={mapFormData.description}
                onChange={(e) => setMapFormData({ ...mapFormData, description: e.target.value })}
                rows={3}
                disabled={saving}
                placeholder="Optional description for this map..."
              />
            </div>

            <button type="submit" disabled={saving} className="save-button">
              {saving ? '⏳ Updating...' : '💾 Update Map Details'}
            </button>
          </form>
        </div>

      </div>
    </div>
  )
}

export default MapSettings