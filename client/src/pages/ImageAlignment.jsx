import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import '../styles/imageAlignment.scss'

function ImageAlignment() {
  const { mapId, timelineImageId } = useParams()
  const navigate = useNavigate()
  
  const [map, setMap] = useState(null)
  const [timelineImage, setTimelineImage] = useState(null)
  const [baseImage, setBaseImage] = useState(null) // The reference image (current map background or previous timeline image)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  
  // Alignment state - using simple percentage positioning
  const [position, setPosition] = useState({ x: 0, y: 0 }) // Percentage coordinates
  const [scale, setScale] = useState(1.0)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  
  const containerRef = useRef(null)
  const newImageRef = useRef(null)

  useEffect(() => {
    if (mapId && timelineImageId) {
      loadAlignmentData()
    }
  }, [mapId, timelineImageId])


  const createAuthAPI = () => {
    const token = localStorage.getItem('auth_token')
    return axios.create({
      baseURL: '/api',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
  }

  const loadAlignmentData = async () => {
    try {
      setLoading(true)
      const api = createAuthAPI()
      
      // Load map and timeline image data
      const [mapResponse, timelineImagesResponse] = await Promise.all([
        api.get(`/maps/${mapId}`),
        api.get(`/maps/${mapId}/timeline-images`)
      ])
      
      const mapData = mapResponse.data.map
      const timelineImages = timelineImagesResponse.data.images
      const targetImage = timelineImages.find(img => img.id === parseInt(timelineImageId))
      
      if (!targetImage) {
        setError('Timeline image not found')
        return
      }
      
      setMap(mapData)
      setTimelineImage(targetImage)
      
      // Set initial position from existing data (if available)
      setPosition({ 
        x: targetImage.positionX || 0, 
        y: targetImage.positionY || 0 
      })
      setScale(targetImage.scale || 1.0)
      
      // Determine base image (reference for alignment)
      // Use the map's main background image as reference
      setBaseImage(mapData.imageUrl)
      
      setError('')
    } catch (err) {
      console.error('Failed to load alignment data:', err)
      setError(err.response?.data?.message || 'Failed to load alignment data')
    } finally {
      setLoading(false)
    }
  }

  const handleMouseDown = (e) => {
    if (!newImageRef.current) return
    
    setIsDragging(true)
    const rect = containerRef.current.getBoundingClientRect()
    setDragStart({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    })
    setDragOffset({
      x: position.x,
      y: position.y
    })
  }

  const handleMouseMove = (e) => {
    if (!isDragging || !containerRef.current) return
    
    const rect = containerRef.current.getBoundingClientRect()
    const currentX = e.clientX - rect.left
    const currentY = e.clientY - rect.top
    
    const deltaX = currentX - dragStart.x
    const deltaY = currentY - dragStart.y
    
    // Convert pixel movement to percentage
    const percentX = (deltaX / rect.width) * 100
    const percentY = (deltaY / rect.height) * 100
    
    setPosition({
      x: dragOffset.x + percentX,
      y: dragOffset.y + percentY
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleScaleChange = (newScale) => {
    setScale(Math.max(0.05, Math.min(5.0, newScale))) // Allow smaller zoom out (5%) and larger zoom in (500%)
  }

  const handleWheel = (e) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1 // Zoom out/in by 10% per wheel step
    const newScale = scale + delta
    handleScaleChange(newScale)
  }

  const resetPosition = () => {
    setPosition({ x: 0, y: 0 })
    setScale(1.0)
  }

  const saveAlignment = async () => {
    setSaving(true)
    setError('')
    
    try {
      const api = createAuthAPI()
      
      await api.put(`/maps/${mapId}/timeline-images/${timelineImageId}`, {
        position_x: position.x,
        position_y: position.y,
        scale: scale
      })
      
      setSuccess('Image alignment saved successfully!')
      setTimeout(() => {
        navigate(`/map/${mapId}/settings`)
      }, 1500)
    } catch (err) {
      console.error('Failed to save alignment:', err)
      const errorMessage = err.response?.data?.message || 'Failed to save alignment'
      
      // Check if it's a missing column error (needs migration)
      if (errorMessage.includes('column "position_x" does not exist') || errorMessage.includes('position_x')) {
        setError('Database migration required. Please run the migration from /migration to add positioning support.')
      } else {
        setError(errorMessage)
      }
    } finally {
      setSaving(false)
    }
  }

  const cancelAlignment = () => {
    navigate(`/map/${mapId}/settings`)
  }


  if (loading) {
    return (
      <div className="alignment-loading">
        <div className="loading-spinner"></div>
        <p>Loading alignment interface...</p>
      </div>
    )
  }

  if (error && !map) {
    return (
      <div className="alignment-error">
        <h2>Error Loading Alignment</h2>
        <p>{error}</p>
        <button onClick={() => navigate(`/map/${mapId}/settings`)} className="back-button">
          ← Back to Settings
        </button>
      </div>
    )
  }

  return (
    <div className="image-alignment">
      <div className="alignment-header">
        <div className="header-content">
          <h1>🎯 Align Timeline Image</h1>
          <p>Drag the new image to align it with the reference. The reference image is shown at 30% opacity.</p>
        </div>
        <div className="header-actions">
          <button onClick={resetPosition} className="reset-button">
            🔄 Reset Position
          </button>
          <button onClick={cancelAlignment} className="cancel-button">
            ✕ Cancel
          </button>
          <button onClick={saveAlignment} disabled={saving} className="save-button">
            {saving ? '💾 Saving...' : '💾 Save Alignment'}
          </button>
        </div>
      </div>

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

      <div className="alignment-controls">
        <div className="scale-control">
          <label>Scale: {scale ? scale.toFixed(2) : '1.00'}x</label>
          <input
            type="range"
            min="0.05"
            max="5.0"
            step="0.05"
            value={scale}
            onChange={(e) => handleScaleChange(parseFloat(e.target.value))}
          />
        </div>
        <div className="position-info">
          Position: {position.x.toFixed(1)}%, {position.y.toFixed(1)}%
        </div>
      </div>

      <div 
        className="alignment-container"
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}  
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        {/* Grid background for reference */}

        {/* Base/Reference Image */}
        {baseImage && (
          <img 
            src={baseImage} 
            alt="Reference image"
            className="base-image"
          />
        )}
        
        {/* New Image Being Aligned */}
        {timelineImage && (
          <img
            ref={newImageRef}
            src={timelineImage.imageUrl}
            alt="Image being aligned"
            className={`alignment-image ${isDragging ? 'dragging' : ''}`}
            style={{
              transform: `translate(${position.x}%, ${position.y}%) scale(${scale})`,
              cursor: isDragging ? 'grabbing' : 'grab'
            }}
            onMouseDown={handleMouseDown}
            draggable={false}
          />
        )}
      </div>
    </div>
  )
}

export default ImageAlignment