import React, { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import WorldSelector from '../components/WorldSelector'
import ImageSelector from '../components/ImageSelector'
import worldService from '../services/worldService'
import mapService from '../services/mapService'
import imageServiceBase64 from '../services/imageServiceBase64'
import '../styles/mapManager.scss'

function MapManager() {
  const [searchParams] = useSearchParams()
  const [currentWorld, setCurrentWorld] = useState(null)
  const [maps, setMaps] = useState([])
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newMapData, setNewMapData] = useState({
    title: '',
    description: '',
    image_id: ''
  })

  useEffect(() => {
    // Check for world ID in URL params or localStorage
    const worldIdFromUrl = searchParams.get('world')
    const worldFromStorage = worldService.getCurrentWorld()
    
    if (worldIdFromUrl) {
      loadWorldById(worldIdFromUrl)
    } else if (worldFromStorage) {
      setCurrentWorld(worldFromStorage)
    }
  }, [searchParams])

  useEffect(() => {
    if (currentWorld) {
      loadMaps()
      loadImages()
    }
  }, [currentWorld])

  const loadWorldById = async (worldId) => {
    try {
      const result = await worldService.getWorld(worldId)
      setCurrentWorld(result.world)
      worldService.setCurrentWorld(result.world)
    } catch (error) {
      console.error('Failed to load world:', error)
      setCurrentWorld(worldService.getCurrentWorld())
    }
  }

  const loadMaps = async () => {
    try {
      setLoading(true)
      const result = await mapService.getMaps(currentWorld.id)
      setMaps(result.maps)
      setError('')
    } catch (err) {
      console.error('Failed to load maps:', err)
      setError(err.message || 'Failed to load maps')
    } finally {
      setLoading(false)
    }
  }

  const loadImages = async () => {
    try {
      const result = await imageServiceBase64.getImages({ worldId: currentWorld.id })
      setImages(result.images)
    } catch (err) {
      console.error('Failed to load images:', err)
    }
  }

  const handleWorldSelect = (world) => {
    setCurrentWorld(world)
    setMaps([])
    setShowCreateForm(false)
  }

  const handleCreateMap = async (e) => {
    e.preventDefault()
    
    if (!newMapData.title.trim()) {
      setError('Map title is required')
      return
    }

    setCreating(true)
    setError('')

    try {
      const result = await mapService.createMap({
        ...newMapData,
        title: newMapData.title.trim(),
        description: newMapData.description.trim() || null,
        world_id: currentWorld.id,
        image_id: newMapData.image_id || null
      })

      // Add new map to list
      setMaps([result.map, ...maps])
      
      // Reset form
      setNewMapData({ title: '', description: '', image_id: '' })
      setShowCreateForm(false)
    } catch (err) {
      console.error('Failed to create map:', err)
      setError(err.message || 'Failed to create map')
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteMap = async (mapId, e) => {
    e.stopPropagation()
    
    const map = maps.find(m => m.id === mapId)
    if (!confirm(`Are you sure you want to delete "${map.title}"?`)) {
      return
    }

    try {
      await mapService.deleteMap(mapId)
      setMaps(maps.filter(m => m.id !== mapId))
    } catch (err) {
      console.error('Failed to delete map:', err)
      setError(err.message || 'Failed to delete map')
    }
  }

  return (
    <div className="map-manager">
      <div className="page-header">
        <div className="header-content">
          <h1>Map Manager</h1>
          <Link to="/dashboard" className="back-link">← Back to Dashboard</Link>
        </div>
      </div>

      <div className="manager-content">
        <div className="world-section">
          <WorldSelector 
            onWorldSelect={handleWorldSelect}
            currentWorldId={currentWorld?.id}
          />
        </div>

        {currentWorld ? (
          <div className="maps-section">
            <div className="maps-header">
              <h2>Maps in {currentWorld.name}</h2>
              <div className="header-actions">
                <Link 
                  to={`/world/${currentWorld.id}/settings`}
                  className="create-map-button"
                >
                  ⚙️ World Settings
                </Link>
                <button 
                  className="create-map-button"
                  onClick={() => setShowCreateForm(!showCreateForm)}
                >
                  {showCreateForm ? '✕ Cancel' : '+ New Map'}
                </button>
              </div>
            </div>

            {error && (
              <div className="error-message">
                ❌ {error}
              </div>
            )}

            {showCreateForm && (
              <div className="create-map-form">
                <form onSubmit={handleCreateMap}>
                  <div className="form-group">
                    <label htmlFor="map-title">Map Title</label>
                    <input
                      type="text"
                      id="map-title"
                      value={newMapData.title}
                      onChange={(e) => setNewMapData({...newMapData, title: e.target.value})}
                      placeholder="Enter map title..."
                      required
                      disabled={creating}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="map-description">Description (optional)</label>
                    <textarea
                      id="map-description"
                      value={newMapData.description}
                      onChange={(e) => setNewMapData({...newMapData, description: e.target.value})}
                      placeholder="Describe this map..."
                      rows={3}
                      disabled={creating}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="map-image">Background Image (optional)</label>
                    <ImageSelector
                      images={images}
                      selectedImageId={newMapData.image_id}
                      onImageSelect={(imageId) => setNewMapData({...newMapData, image_id: imageId})}
                      disabled={creating}
                      placeholder="No background image"
                      showPreview={false}
                    />
                  </div>
                  <div className="form-actions">
                    <button type="submit" disabled={creating}>
                      {creating ? 'Creating...' : 'Create Map'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div className="maps-grid">
              {loading ? (
                <div className="maps-loading">Loading maps...</div>
              ) : maps.length === 0 ? (
                <div className="no-maps">
                  <p>No maps created yet. Create your first map to get started!</p>
                </div>
              ) : (
                maps.map(map => (
                  <div key={map.id} className="map-card">
                    <div className="map-image">
                      {map.imageUrl ? (
                        <img src={map.imageUrl} alt={map.title} />
                      ) : (
                        <div className="no-image">🗺️</div>
                      )}
                    </div>
                    <div className="map-info">
                      <h3 className="map-title">{map.title}</h3>
                      {map.description && (
                        <p className="map-description">{map.description}</p>
                      )}
                      <div className="map-meta">
                        <span>Created: {new Date(map.createdAt).toLocaleDateString()}</span>
                        {map.createdBy && <span>By: {map.createdBy}</span>}
                      </div>
                    </div>
                    <div className="map-actions">
                      <Link 
                        to={`/map/${map.id}`}
                        className="view-map-button"
                      >
                        🗺️ View
                      </Link>
                      <button 
                        className="delete-map-button"
                        onClick={(e) => handleDeleteMap(map.id, e)}
                        title="Delete map"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="no-world-selected">
            <h2>No World Selected</h2>
            <p>Please select a world to manage maps, or create a new world to get started.</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default MapManager