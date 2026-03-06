import React, { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import mapService from '../services/mapService'
import '../styles/mapSettings.scss'

function MapSettings() {
  const { mapId } = useParams()

  const [map, setMap] = useState(null)
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

  const loadMapData = async () => {
    try {
      setLoading(true)
      const data = await mapService.getMap(mapId)
      const mapData = data.map
      setMap(mapData)

      setMapFormData({
        title: mapData.title,
        description: mapData.description || ''
      })

      setError('')
    } catch (err) {
      setError(err.message || 'Failed to load map data')
    } finally {
      setLoading(false)
    }
  }

  const handleMapUpdate = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      await mapService.updateMap(mapId, mapFormData)
      setSuccess('Map details updated successfully!')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.message || 'Failed to update map')
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