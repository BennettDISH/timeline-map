import React, { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import axios from 'axios'

function MapSettings() {
  const { mapId } = useParams()
  const navigate = useNavigate()
  
  const [map, setMap] = useState(null)
  const [world, setWorld] = useState(null)
  const [availableImages, setAvailableImages] = useState([])
  const [timelineImages, setTimelineImages] = useState([])
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
      
      // Load timeline images for this map
      const timelineImagesResponse = await api.get(`/maps/${mapId}/timeline-images`)
      setTimelineImages(timelineImagesResponse.data.images || [])
      
      setMapFormData({
        title: mapData.title,
        description: mapData.description || ''
      })
      
      setError('')
    } catch (err) {
      console.error('Failed to load map data:', err)
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
      console.error('Failed to update map:', err)
      setError(err.response?.data?.message || 'Failed to update map')
    } finally {
      setSaving(false)
    }
  }

  const addTimelineImage = async (imageId, startTime, endTime, isDefault = false) => {
    try {
      const api = createAuthAPI()
      await api.post(`/maps/${mapId}/timeline-images`, {
        image_id: imageId,
        start_time: startTime,
        end_time: endTime,
        is_default: isDefault
      })
      setSuccess('Timeline image added successfully!')
      setTimeout(() => setSuccess(''), 3000)
      loadMapData() // Reload to get updated timeline images
    } catch (err) {
      console.error('Failed to add timeline image:', err)
      setError(err.response?.data?.message || 'Failed to add timeline image')
    }
  }

  const removeTimelineImage = async (timelineImageId) => {
    if (!confirm('Are you sure you want to remove this timeline image?')) {
      return
    }
    
    try {
      const api = createAuthAPI()
      await api.delete(`/maps/${mapId}/timeline-images/${timelineImageId}`)
      setSuccess('Timeline image removed successfully!')
      setTimeout(() => setSuccess(''), 3000)
      loadMapData() // Reload to get updated timeline images
    } catch (err) {
      console.error('Failed to remove timeline image:', err)
      setError(err.response?.data?.message || 'Failed to remove timeline image')
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
            <p>Configure map details and timeline-based background images</p>
          </div>
          <div className="header-actions">
            <Link to={`/worlds/${map.worldId}/maps`} className="back-button">
              ← Back to Maps
            </Link>
            <Link to={`/maps/${mapId}`} className="view-button">
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

        {/* Timeline Images Section */}
        {world?.timelineEnabled && (
          <div className="settings-section">
            <h2>🖼️ Timeline Background Images</h2>
            <p>Configure different background images for different time periods</p>
            
            <div className="timeline-images-container">
              {timelineImages.length === 0 ? (
                <div className="empty-state">
                  <p>No timeline images configured yet.</p>
                  <p>Add images below to change the map background based on timeline position.</p>
                </div>
              ) : (
                <div className="timeline-images-list">
                  {timelineImages.map((img) => (
                    <div key={img.id} className="timeline-image-item">
                      <img src={img.imageUrl} alt={img.imageName} />
                      <div className="image-info">
                        <h4>{img.imageName}</h4>
                        <p>Time: {img.startTime} - {img.endTime} {world.timelineSettings.timeUnit}</p>
                        {img.isDefault && <span className="default-badge">Default</span>}
                      </div>
                      <div className="image-actions">
                        <button
                          onClick={() => removeTimelineImage(img.id)}
                          className="remove-button"
                          title="Remove this timeline image"
                        >
                          🗑️ Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Add Timeline Image Form */}
              <div className="add-timeline-image">
                <h3>Add Timeline Image</h3>
                <div className="available-images">
                  {availableImages.map((image) => (
                    <div key={image.id} className="image-option">
                      <img src={image.url} alt={image.filename} />
                      <div className="image-details">
                        <p>{image.filename}</p>
                        <button
                          onClick={() => {
                            const startTime = prompt(`Start time (${world.timelineSettings.timeUnit}):`, '0')
                            const endTime = prompt(`End time (${world.timelineSettings.timeUnit}):`, '100')
                            if (startTime !== null && endTime !== null) {
                              addTimelineImage(image.id, parseInt(startTime), parseInt(endTime))
                            }
                          }}
                          className="add-image-button"
                        >
                          + Add to Timeline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                
                {availableImages.length === 0 && (
                  <div className="empty-state">
                    <p>No images available. Upload images first in the Image Manager.</p>
                    <Link to={`/worlds/${map.worldId}/images`} className="button">
                      📁 Manage Images
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {!world?.timelineEnabled && (
          <div className="settings-section disabled-section">
            <h2>🖼️ Timeline Background Images</h2>
            <div className="disabled-message">
              <p>Timeline is disabled for this world.</p>
              <p>Enable timeline in World Settings to configure timeline-based background images.</p>
              <Link to={`/worlds/${map.worldId}/settings`} className="button">
                ⚙️ World Settings
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default MapSettings