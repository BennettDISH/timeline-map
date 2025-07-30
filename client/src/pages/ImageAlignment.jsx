import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { 
  pixelsToGrid, 
  gridToPixels, 
  gridToCoordinate, 
  generateGridLabels,
  percentToGrid,
  gridToPercent 
} from '../utils/gridCoordinates'
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
  
  // Alignment state - now using grid coordinates
  const [gridPosition, setGridPosition] = useState({ x: 0, y: 0 }) // Grid units (can be decimal)
  const [scale, setScale] = useState(1.0)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 }) // Pixel coordinates for drag calculation
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 }) // Grid coordinates at drag start
  const [containerDimensions, setContainerDimensions] = useState({ width: 0, height: 0 })
  
  const containerRef = useRef(null)
  const newImageRef = useRef(null)

  useEffect(() => {
    if (mapId && timelineImageId) {
      loadAlignmentData()
    }
  }, [mapId, timelineImageId])

  // Update container dimensions for grid labels
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setContainerDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        })
      }
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [loading])

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
      
      // Convert existing percentage-based position to grid coordinates
      // For now, assume a standard container size for conversion
      const containerWidth = 1200 // Standard container width
      const containerHeight = 800 // Standard container height
      
      // Check if positioning data exists (requires database migration)
      if (targetImage.positionX !== undefined && targetImage.positionY !== undefined) {
        try {
          const existingGridPos = percentToGrid(
            targetImage.positionX || 0,
            targetImage.positionY || 0,
            containerWidth,
            containerHeight
          )
          
          setGridPosition(existingGridPos)
        } catch (err) {
          console.error('Error converting position to grid:', err)
          setGridPosition({ x: 0, y: 0 })
        }
      } else {
        // No positioning data - start at origin
        console.log('No positioning data found - using default position')
        setGridPosition({ x: 0, y: 0 })
      }
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
      x: gridPosition?.x || 0,
      y: gridPosition?.y || 0
    })
  }

  const handleMouseMove = (e) => {
    if (!isDragging || !containerRef.current) return
    
    const rect = containerRef.current.getBoundingClientRect()
    const currentX = e.clientX - rect.left
    const currentY = e.clientY - rect.top
    
    const deltaX = currentX - dragStart.x
    const deltaY = currentY - dragStart.y
    
    // Convert pixel movement to grid units
    const gridDeltaX = deltaX / 50 // 50px per grid unit
    const gridDeltaY = deltaY / 50
    
    setGridPosition({
      x: dragOffset.x + gridDeltaX,
      y: dragOffset.y + gridDeltaY
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleScaleChange = (newScale) => {
    setScale(Math.max(0.1, Math.min(3.0, newScale)))
  }

  const resetPosition = () => {
    setGridPosition({ x: 0, y: 0 })
    setScale(1.0)
  }

  const saveAlignment = async () => {
    setSaving(true)
    setError('')
    
    try {
      const api = createAuthAPI()
      
      // Convert grid coordinates back to percentages for storage (for now)
      // TODO: Eventually migrate database to store grid coordinates directly
      const containerWidth = containerDimensions.width || 1200
      const containerHeight = containerDimensions.height || 800
      
      const percentPos = gridToPercent(
        gridPosition.x,
        gridPosition.y,
        containerWidth,
        containerHeight
      )
      
      await api.put(`/maps/${mapId}/timeline-images/${timelineImageId}`, {
        position_x: percentPos.percentX,
        position_y: percentPos.percentY,
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

  // Generate grid labels using utility function
  const getGridLabels = () => {
    const { width: containerWidth, height: containerHeight } = containerDimensions
    if (!containerWidth || !containerHeight) return []

    const labels = generateGridLabels(containerWidth, containerHeight)
    
    return labels.map((label, index) => (
      <span 
        key={`${label.type}-${index}`}
        className={`grid-label ${label.type}-label`}
        style={{ 
          left: label.type === 'column' ? `${label.x}px` : `${label.x}px`,
          top: label.type === 'row' ? `${label.y}px` : `${label.y}px`
        }}
      >
        {label.text}
      </span>
    ))
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
            min="0.1"
            max="3.0"
            step="0.1"
            value={scale}
            onChange={(e) => handleScaleChange(parseFloat(e.target.value))}
          />
        </div>
        <div className="position-info">
          Position: {gridPosition ? `${gridToCoordinate(gridPosition.x, gridPosition.y)} (${gridPosition.x.toFixed(1)}, ${gridPosition.y.toFixed(1)})` : 'Loading...'}
        </div>
      </div>

      <div 
        className="alignment-container"
        ref={containerRef}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}  
        onMouseLeave={handleMouseUp}
      >
        {/* Grid Labels */}
        <div className="grid-labels">
          {getGridLabels()}
        </div>

        {/* Base/Reference Image */}
        {baseImage && (
          <img 
            src={baseImage} 
            alt="Reference image"
            className="base-image"
          />
        )}
        
        {/* New Image Being Aligned */}
        {timelineImage && gridPosition && (
          <img
            ref={newImageRef}
            src={timelineImage.imageUrl}
            alt="Image being aligned"
            className={`alignment-image ${isDragging ? 'dragging' : ''}`}
            style={{
              transform: `translate(${gridPosition.x * 50}px, ${gridPosition.y * 50}px) scale(${scale})`,
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