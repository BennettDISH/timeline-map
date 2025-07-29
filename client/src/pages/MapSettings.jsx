import React, { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import ImageSelector from '../components/ImageSelector'
import '../styles/mapSettings.scss'

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
  
  // Timeline image form state
  const [selectedImageId, setSelectedImageId] = useState('')
  const [timelineFormData, setTimelineFormData] = useState({
    startTime: 0,
    endTime: 100,
    isDefault: false
  })
  const [showTimelineForm, setShowTimelineForm] = useState(false)

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

  const addTimelineImage = async (e) => {
    e.preventDefault()
    
    if (!selectedImageId) {
      setError('Please select an image')
      return
    }
    
    setSaving(true)
    setError('')
    
    try {
      const api = createAuthAPI()
      await api.post(`/maps/${mapId}/timeline-images`, {
        image_id: selectedImageId,
        start_time: timelineFormData.startTime,
        end_time: timelineFormData.endTime,
        is_default: timelineFormData.isDefault
      })
      setSuccess('Timeline image added successfully!')
      setTimeout(() => setSuccess(''), 3000)
      
      // Reset form
      setSelectedImageId('')
      setTimelineFormData({
        startTime: 0,
        endTime: 100,
        isDefault: false
      })
      setShowTimelineForm(false)
      
      loadMapData() // Reload to get updated timeline images
    } catch (err) {
      console.error('Failed to add timeline image:', err)
      setError(err.response?.data?.message || 'Failed to add timeline image')
    } finally {
      setSaving(false)
    }
  }
  
  const handleTimelineRangeChange = (e) => {
    const value = parseInt(e.target.value)
    const isStart = e.target.name === 'startTime'
    
    setTimelineFormData(prev => {
      if (isStart) {
        return {
          ...prev,
          startTime: Math.min(value, prev.endTime - 1)
        }
      } else {
        return {
          ...prev,
          endTime: Math.max(value, prev.startTime + 1)
        }
      }
    })
  }

  const removeTimelineImage = async (timelineImageId, imageName) => {
    setSaving(true)
    setError('')
    
    try {
      const api = createAuthAPI()
      await api.delete(`/maps/${mapId}/timeline-images/${timelineImageId}`)
      setSuccess(`Timeline image "${imageName}" removed successfully!`)
      setTimeout(() => setSuccess(''), 3000)
      loadMapData() // Reload to get updated timeline images
    } catch (err) {
      console.error('Failed to remove timeline image:', err)
      setError(err.response?.data?.message || 'Failed to remove timeline image')
    } finally {
      setSaving(false)
    }
  }

  const toggleDefaultImage = async (timelineImageId, currentDefault) => {
    setSaving(true)
    setError('')
    
    try {
      const api = createAuthAPI()
      await api.put(`/maps/${mapId}/timeline-images/${timelineImageId}`, {
        is_default: !currentDefault
      })
      setSuccess(`Timeline image ${!currentDefault ? 'set as' : 'removed from'} default!`)
      setTimeout(() => setSuccess(''), 3000)
      loadMapData() // Reload to get updated timeline images
    } catch (err) {
      console.error('Failed to update timeline image:', err)
      setError(err.response?.data?.message || 'Failed to update timeline image')
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
                          onClick={() => toggleDefaultImage(img.id, img.isDefault)}
                          className={`default-button ${img.isDefault ? 'is-default' : ''}`}
                          title={img.isDefault ? 'Remove as default image' : 'Set as default image'}
                          disabled={saving}
                        >
                          ⭐ {img.isDefault ? 'Default' : 'Set Default'}
                        </button>
                        <button
                          onClick={() => removeTimelineImage(img.id, img.imageName)}
                          className="remove-button"
                          title="Remove this timeline image"
                          disabled={saving}
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
                <div className="add-timeline-header">
                  <h3>Add Timeline Image</h3>
                  <button
                    onClick={() => setShowTimelineForm(!showTimelineForm)}
                    className="toggle-form-button"
                    disabled={availableImages.length === 0}
                  >
                    {showTimelineForm ? '✕ Cancel' : '+ Add Timeline Image'}
                  </button>
                </div>
                
                {showTimelineForm && (
                  <form onSubmit={addTimelineImage} className="timeline-image-form">
                    <div className="form-group">
                      <label htmlFor="image-select">Select Image:</label>
                      <ImageSelector
                        images={availableImages}
                        selectedImageId={selectedImageId}
                        onImageSelect={setSelectedImageId}
                        disabled={saving}
                        placeholder="Choose an image..."
                        showPreview={true}
                      />
                    </div>
                    
                    <div className="timeline-controls">
                      <label>Timeline Range ({world.timelineSettings.timeUnit}):</label>
                      
                      <div className="timeline-visual">
                        <div className="timeline-bar">
                          <div 
                            className="timeline-range-indicator"
                            style={{
                              left: `${((timelineFormData.startTime - world.timelineSettings.minTime) / (world.timelineSettings.maxTime - world.timelineSettings.minTime)) * 100}%`,
                              width: `${((timelineFormData.endTime - timelineFormData.startTime) / (world.timelineSettings.maxTime - world.timelineSettings.minTime)) * 100}%`
                            }}
                          >
                            <span className="range-label">
                              {timelineFormData.startTime} - {timelineFormData.endTime}
                            </span>
                          </div>
                        </div>
                        
                        <div className="timeline-labels">
                          <span>{world.timelineSettings.minTime}</span>
                          <span>{world.timelineSettings.maxTime}</span>
                        </div>
                      </div>
                      
                      <div className="time-inputs">
                        <div className="input-group">
                          <label>Start Time:</label>
                          <input
                            type="number"
                            min={world.timelineSettings.minTime}
                            max={world.timelineSettings.maxTime}
                            value={timelineFormData.startTime}
                            onChange={(e) => setTimelineFormData(prev => ({
                              ...prev,
                              startTime: Math.min(parseInt(e.target.value) || 0, prev.endTime - 1)
                            }))}
                            disabled={saving}
                          />
                        </div>
                        
                        <div className="input-group">
                          <label>End Time:</label>
                          <input
                            type="number"
                            min={world.timelineSettings.minTime}
                            max={world.timelineSettings.maxTime}
                            value={timelineFormData.endTime}
                            onChange={(e) => setTimelineFormData(prev => ({
                              ...prev,
                              endTime: Math.max(parseInt(e.target.value) || 100, prev.startTime + 1)
                            }))}
                            disabled={saving}
                          />
                        </div>
                      </div>
                    </div>
                    
                    <div className="form-group checkbox-group">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={timelineFormData.isDefault}
                          onChange={(e) => setTimelineFormData(prev => ({
                            ...prev,
                            isDefault: e.target.checked
                          }))}
                          disabled={saving}
                        />
                        <span className="checkmark"></span>
                        Set as default image (shown when no other image matches the current time)
                      </label>
                    </div>
                    
                    <div className="form-actions">
                      <button type="submit" disabled={saving || !selectedImageId} className="add-button">
                        {saving ? '⏳ Adding...' : '+ Add to Timeline'}
                      </button>
                      <button 
                        type="button" 
                        onClick={() => {
                          setShowTimelineForm(false)
                          setSelectedImageId('')
                          setTimelineFormData({
                            startTime: 0,
                            endTime: 100,
                            isDefault: false
                          })
                        }}
                        className="cancel-button"
                        disabled={saving}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
                
                {!showTimelineForm && availableImages.length === 0 && (
                  <div className="empty-state">
                    <p>No images available. Upload images first in the Image Manager.</p>
                    <Link to={`/worlds/${map.worldId}/images`} className="button">
                      📁 Manage Images
                    </Link>
                  </div>
                )}
                
                {!showTimelineForm && availableImages.length > 0 && (
                  <div className="available-images-hint">
                    <p>📸 {availableImages.length} images available</p>
                    <p>Click "Add Timeline Image" above to configure timeline-based backgrounds.</p>
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