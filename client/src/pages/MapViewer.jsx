import React, { useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import mapService from '../services/mapService'
import eventService from '../services/eventService'
import worldService from '../services/worldService'
import '../styles/timelineStyles.scss'

function MapViewer() {
  const { mapId } = useParams()
  const navigate = useNavigate()
  const [map, setMap] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [nodes, setNodes] = useState([])
  const [isAddingNode, setIsAddingNode] = useState(false)
  const [selectedNode, setSelectedNode] = useState(null)
  const [nodeType, setNodeType] = useState('standard') // 'standard' or 'map_link'
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [availableMaps, setAvailableMaps] = useState([])
  const [loadingMaps, setLoadingMaps] = useState(false)
  const [interactionMode, setInteractionMode] = useState('view') // 'view' or 'edit'
  const [showInfoPanel, setShowInfoPanel] = useState(false)
  const [infoPanelNode, setInfoPanelNode] = useState(null)
  const [editFormData, setEditFormData] = useState({
    title: '',
    description: '',
    content: '',
    linkToMapId: null,
    startTime: 0,
    endTime: 100
  })
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  
  // Timeline state
  const [currentTime, setCurrentTime] = useState(50) // Current timeline position (0-100)
  const [timelineSettings, setTimelineSettings] = useState({
    minTime: 0,
    maxTime: 100,
    timeUnit: 'years'
  })
  
  // Pan and zoom state
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 })
  
  // Node dragging state
  const [isDraggingNode, setIsDraggingNode] = useState(false)
  const [draggingNode, setDraggingNode] = useState(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  
  const containerRef = useRef(null)
  const imageRef = useRef(null)

  useEffect(() => {
    if (mapId) {
      loadMap()
    }
  }, [mapId])

  useEffect(() => {
    if (map?.worldId) {
      loadAvailableMaps()
    }
  }, [map?.worldId])

  const loadMap = async () => {
    try {
      setLoading(true)
      const [mapResult, eventsResult] = await Promise.all([
        mapService.getMap(mapId),
        eventService.getEvents(mapId)
      ])
      
      // Load world data to get timeline settings
      const worldResult = await worldService.getWorld(mapResult.map.worldId)
      
      // Merge world timeline settings into map object
      const mapWithTimeline = {
        ...mapResult.map,
        timelineEnabled: worldResult.world.timelineEnabled,
        timelineSettings: worldResult.world.timelineSettings
      }
      
      setMap(mapWithTimeline)
      setNodes(eventsResult.events)
      setTimelineSettings(worldResult.world.timelineSettings)
      setCurrentTime(worldResult.world.timelineSettings.currentTime)
      setError('')
    } catch (err) {
      console.error('Failed to load map:', err)
      setError(err.message || 'Failed to load map')
    } finally {
      setLoading(false)
    }
  }

  const loadAvailableMaps = async () => {
    try {
      setLoadingMaps(true)
      const result = await mapService.getMaps(map.worldId)
      // Filter out current map from available options
      const filteredMaps = result.maps.filter(m => m.id !== parseInt(mapId))
      setAvailableMaps(filteredMaps)
    } catch (err) {
      console.error('Failed to load available maps:', err)
    } finally {
      setLoadingMaps(false)
    }
  }

  const handleMouseDown = (e) => {
    if (isAddingNode || isDraggingNode) return // Don't drag map when adding nodes or dragging nodes
    
    setIsDragging(true)
    setLastMousePos({ x: e.clientX, y: e.clientY })
    // Remove preventDefault to avoid passive event listener issues
  }

  const handleMouseMove = (e) => {
    if (isDragging && !isDraggingNode) {
      // Map dragging
      const deltaX = e.clientX - lastMousePos.x
      const deltaY = e.clientY - lastMousePos.y
      
      setPosition(prev => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY
      }))
      
      setLastMousePos({ x: e.clientX, y: e.clientY })
    } else if (isDraggingNode && draggingNode) {
      // Node dragging - let's go back to basics and use the working click logic
      if (!imageRef.current) return
      
      // Simplified approach - get mouse position relative to the image directly
      const imageRect = imageRef.current.getBoundingClientRect()
      
      // Mouse position relative to the image element
      const mouseX = e.clientX - imageRect.left
      const mouseY = e.clientY - imageRect.top
      
      // Simplified calculation since image element now matches displayed image size
      const imageX = (mouseX / imageRect.width) * 100
      const imageY = (mouseY / imageRect.height) * 100
      
      // Simple debug logging
      const img = imageRef.current
      const computedStyle = window.getComputedStyle(img)
      
      console.log('Dragging debug (simplified):', {
        imageRect: { width: imageRect.width, height: imageRect.height },
        mousePos: { mouseX, mouseY },
        calculatedPercent: { imageX, imageY }
      })
      
      // Keep within bounds
      const boundedX = Math.max(0, Math.min(100, imageX))
      const boundedY = Math.max(0, Math.min(100, imageY))
      
      // Update node position locally (don't save yet)
      setNodes(nodes.map(node => 
        node.id === draggingNode.id 
          ? { ...node, x: boundedX, y: boundedY }
          : node
      ))
      
      // Update dragging node reference
      setDraggingNode({ ...draggingNode, x: boundedX, y: boundedY })
    }
  }

  const handleMouseUp = async () => {
    if (isDraggingNode && draggingNode) {
      // Save the final position to database
      try {
        await handleNodeUpdate(draggingNode, {
          x_position: draggingNode.x,
          y_position: draggingNode.y
        })
      } catch (err) {
        console.error('Failed to save node position:', err)
      }
      
      setIsDraggingNode(false)
      setDraggingNode(null)
    }
    
    setIsDragging(false)
  }

  const handleWheel = (e) => {
    e.preventDefault()
    
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newScale = Math.max(0.1, Math.min(5, scale * delta))
    
    // Zoom towards mouse position
    const rect = containerRef.current.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    
    const zoomPointX = (mouseX - position.x) / scale
    const zoomPointY = (mouseY - position.y) / scale
    
    setPosition({
      x: mouseX - zoomPointX * newScale,
      y: mouseY - zoomPointY * newScale
    })
    
    setScale(newScale)
  }

  const handleMapClick = async (e) => {
    if (!isAddingNode) return
    
    // Use simplified approach - mouse position relative to image directly
    const imageRect = imageRef.current.getBoundingClientRect()
    
    const mouseX = e.clientX - imageRect.left
    const mouseY = e.clientY - imageRect.top
    
    // Simplified calculation since image element now matches displayed image size
    const imageX = (mouseX / imageRect.width) * 100
    const imageY = (mouseY / imageRect.height) * 100
    
    // Debug logging for placement
    // Check what CSS is actually being applied
    const img = imageRef.current
    const computedStyle = window.getComputedStyle(img)
    
    console.log('Click placement debug (simplified):', {
      imageRect: { width: imageRect.width, height: imageRect.height },
      mousePos: { mouseX, mouseY },
      calculatedPercent: { imageX, imageY },
      css: {
        width: computedStyle.width,
        height: computedStyle.height,
        objectFit: computedStyle.objectFit
      }
    })
    
    // Ensure coordinates are within bounds
    if (imageX >= 0 && imageX <= 100 && imageY >= 0 && imageY <= 100) {
      setSaving(true)
      setSaveError('')
      
      try {
        const newNodeData = {
          title: `New ${nodeType === 'standard' ? 'Info' : 'Map'} Node`,
          description: '',
          content: 'Click to edit this node',
          map_id: parseInt(mapId),
          x_position: imageX,
          y_position: imageY,
          event_type: nodeType,
          start_time: 0,
          end_time: 100
        }
        
        const result = await eventService.createEvent(newNodeData)
        const newNode = result.event
        
        setNodes([...nodes, newNode])
        setSelectedNode(newNode)
        setIsAddingNode(false)
      } catch (err) {
        console.error('Failed to create node:', err)
        setSaveError(err.message || 'Failed to create node')
      } finally {
        setSaving(false)
      }
    }
  }

  const handleNodeMouseDown = (e, node) => {
    e.stopPropagation() // Prevent map dragging
    
    // Only allow dragging in edit mode
    if (interactionMode === 'edit') {
      setIsDraggingNode(true)
      setDraggingNode(node)
      setDragOffset({ x: 0, y: 0 })
    }
  }

  const handleNodeClick = (e, node) => {
    e.stopPropagation()
    
    if (interactionMode === 'view') {
      // View mode behavior
      if (node.eventType === 'standard') {
        // Info node - show info panel
        setInfoPanelNode(node)
        setShowInfoPanel(true)
      } else if (node.eventType === 'map_link' && node.linkToMapId) {
        // Map node - navigate to linked map
        navigate(`/map/${node.linkToMapId}`)
      }
    } else {
      // Edit mode behavior - select node for editing
      setSelectedNode(node)
      // Populate form data
      setEditFormData({
        title: node.title || '',
        description: node.description || '',
        content: node.content || '',
        linkToMapId: node.linkToMapId || null,
        startTime: node.startTime || 0,
        endTime: node.endTime || 100
      })
      setHasUnsavedChanges(false)
      // Close info panel if open
      setShowInfoPanel(false)
    }
  }

  const resetView = () => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }

  const handleNodeUpdate = async (node, updates) => {
    setSaving(true)
    setSaveError('')
    
    try {
      const result = await eventService.updateEvent(node.id, updates)
      const updatedNode = result.event
      
      // Update the node in the local state
      setNodes(nodes.map(n => n.id === node.id ? updatedNode : n))
      
      // Update selected node if it's the one being updated
      if (selectedNode && selectedNode.id === node.id) {
        setSelectedNode(updatedNode)
      }
    } catch (err) {
      console.error('Failed to update node:', err)
      setSaveError(err.message || 'Failed to update node')
    } finally {
      setSaving(false)
    }
  }

  const handleTimelineChange = async (newTime) => {
    const timeValue = parseInt(newTime)
    setCurrentTime(timeValue)
    
    // Update world timeline position
    try {
      await worldService.updateTimelinePosition(map.worldId, timeValue)
    } catch (err) {
      console.error('Failed to update timeline position:', err)
      // Continue silently - don't disrupt user interaction
    }
  }

  const handleTimelineToggle = async () => {
    setSaving(true)
    setSaveError('')
    
    try {
      const newTimelineEnabled = !map.timelineEnabled
      const result = await worldService.updateWorldTimeline(map.worldId, {
        timeline_enabled: newTimelineEnabled,
        timeline_min_time: timelineSettings.minTime,
        timeline_max_time: timelineSettings.maxTime,
        timeline_current_time: newTimelineEnabled ? 50 : currentTime,
        timeline_time_unit: timelineSettings.timeUnit
      })
      
      // Update local map state
      setMap(prev => ({ ...prev, timelineEnabled: newTimelineEnabled }))
      
      // Reset timeline position when enabling
      if (newTimelineEnabled) {
        setCurrentTime(50)
      }
    } catch (err) {
      console.error('Failed to toggle timeline:', err)
      setSaveError(err.message || 'Failed to update timeline settings')
    } finally {
      setSaving(false)
    }
  }

  // Filter nodes based on current time if timeline is enabled
  const getVisibleNodes = () => {
    if (!map?.timelineEnabled) {
      return nodes
    }
    
    return nodes.filter(node => {
      const nodeStart = node.startTime || 0
      const nodeEnd = node.endTime || 100
      return currentTime >= nodeStart && currentTime <= nodeEnd
    })
  }

  const handleNodeDelete = async (node) => {
    if (!confirm(`Are you sure you want to delete "${node.title}"?`)) {
      return
    }
    
    setSaving(true)
    setSaveError('')
    
    try {
      await eventService.deleteEvent(node.id)
      
      // Remove the node from local state
      setNodes(nodes.filter(n => n.id !== node.id))
      
      // Clear selection if the deleted node was selected
      if (selectedNode && selectedNode.id === node.id) {
        setSelectedNode(null)
        setHasUnsavedChanges(false)
      }
    } catch (err) {
      console.error('Failed to delete node:', err)
      setSaveError(err.message || 'Failed to delete node')
    } finally {
      setSaving(false)
    }
  }

  const handleFormChange = (field, value) => {
    setEditFormData(prev => ({
      ...prev,
      [field]: value
    }))
    setHasUnsavedChanges(true)
  }

  const handleSaveChanges = async () => {
    if (!selectedNode || !hasUnsavedChanges) return
    
    setSaving(true)
    setSaveError('')
    
    try {
      const updates = {
        title: editFormData.title,
        description: editFormData.description,
        content: editFormData.content
      }
      
      // Add timeline fields if timeline is enabled
      if (map?.timelineEnabled) {
        updates.start_time = editFormData.startTime
        updates.end_time = editFormData.endTime
      }
      
      // Add link_to_map_id for map_link nodes
      if (selectedNode.eventType === 'map_link') {
        updates.link_to_map_id = editFormData.linkToMapId
      }
      
      const result = await eventService.updateEvent(selectedNode.id, updates)
      const updatedNode = result.event
      
      // Update the node in the local state
      setNodes(nodes.map(n => n.id === selectedNode.id ? updatedNode : n))
      
      // Update selected node
      setSelectedNode(updatedNode)
      setHasUnsavedChanges(false)
    } catch (err) {
      console.error('Failed to save node:', err)
      setSaveError(err.message || 'Failed to save node')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="map-viewer-loading">Loading map...</div>
  }

  if (error) {
    return (
      <div className="map-viewer-error">
        <h2>Error Loading Map</h2>
        <p>{error}</p>
        <Link to="/maps" className="back-link">← Back to Maps</Link>
      </div>
    )
  }

  if (!map) {
    return (
      <div className="map-viewer-error">
        <h2>Map Not Found</h2>
        <Link to="/maps" className="back-link">← Back to Maps</Link>
      </div>
    )
  }

  return (
    <div className="map-viewer">
      <div className="map-header">
        <div className="header-content">
          <h1>{map.title}</h1>
          <div className="header-actions">
            <Link to="/maps" className="back-link">← Back to Maps</Link>
          </div>
        </div>
        {map.description && (
          <p className="map-description">{map.description}</p>
        )}
      </div>

      <div className="map-controls">
        <div className="view-controls">
          <button onClick={resetView} title="Reset view">
            🎯 Reset View
          </button>
          <span className="zoom-level">
            Zoom: {Math.round(scale * 100)}%
          </span>
          <button 
            onClick={() => {
              const newMode = interactionMode === 'view' ? 'edit' : 'view'
              setInteractionMode(newMode)
              
              // Clean up UI state when switching modes
              if (newMode === 'view') {
                setSelectedNode(null)
                setIsAddingNode(false)
              } else {
                setShowInfoPanel(false)
              }
            }}
            className={`mode-toggle ${interactionMode}`}
            title={`Switch to ${interactionMode === 'view' ? 'edit' : 'view'} mode`}
          >
            {interactionMode === 'view' ? '👁️ View Mode' : '✏️ Edit Mode'}
          </button>
          
          {interactionMode === 'edit' && (
            <button 
              onClick={handleTimelineToggle}
              className={`timeline-toggle ${map?.timelineEnabled ? 'enabled' : 'disabled'}`}
              title={`${map?.timelineEnabled ? 'Disable' : 'Enable'} timeline for this map`}
              disabled={saving}
            >
              {map?.timelineEnabled ? '🕒 Timeline ON' : '🕒 Timeline OFF'}
            </button>
          )}
        </div>
        
        {interactionMode === 'edit' && (
          <div className="node-controls">
            <label>
              Node Type:
              <select 
                value={nodeType} 
                onChange={(e) => setNodeType(e.target.value)}
                disabled={isAddingNode || saving}
              >
                <option value="standard">Info Node</option>
                <option value="map_link">Map Node</option>
              </select>
            </label>
            <button 
              className={`add-node-button ${isAddingNode ? 'active' : ''}`}
              onClick={() => setIsAddingNode(!isAddingNode)}
              disabled={saving}
            >
              {isAddingNode ? '✕ Cancel' : `+ Add ${nodeType === 'standard' ? 'Info' : 'Map'} Node`}
            </button>
            {saving && <span className="saving-indicator">💾 Saving...</span>}
          </div>
        )}
      </div>

      <div 
        className={`map-container ${isAddingNode ? 'adding-node' : ''} ${isDragging ? 'dragging' : ''} ${isDraggingNode ? 'dragging-node' : ''}`}
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onClick={handleMapClick}
      >
        <div 
          className="map-content"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: '0 0'
          }}
        >
          {map.imageUrl ? (
            <img 
              ref={imageRef}
              src={map.imageUrl} 
              alt={map.title}
              className="map-image"
              draggable={false}
            />
          ) : (
            <div className="no-map-image">
              <h3>No Background Image</h3>
              <p>This map doesn't have a background image set.</p>
            </div>
          )}
          
          {/* Render nodes */}
          {getVisibleNodes().map(node => (
            <div
              key={node.id}
              className={`map-node ${node.eventType} ${selectedNode?.id === node.id ? 'selected' : ''} ${draggingNode?.id === node.id ? 'dragging' : ''}`}
              style={{
                left: `${node.x}%`,
                top: `${node.y}%`,
                cursor: isDraggingNode && draggingNode?.id === node.id 
                  ? 'grabbing' 
                  : interactionMode === 'edit' 
                    ? 'grab' 
                    : 'pointer'
              }}
              onMouseDown={(e) => handleNodeMouseDown(e, node)}
              onClick={(e) => handleNodeClick(e, node)}
              title={
                interactionMode === 'view'
                  ? node.eventType === 'standard' 
                    ? 'Click to view info'
                    : node.linkToMapId 
                      ? 'Click to navigate to linked map'
                      : 'Map node (no link set)'
                  : 'Click to edit node'
              }
            >
              <div className="node-marker">
                {node.eventType === 'standard' ? 'ℹ️' : node.linkToMapId ? '🗺️' : '📍'}
              </div>
              <div className="node-tooltip">
                <strong>{node.title}</strong>
                <p>{node.content || node.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {isAddingNode && (
        <div className="adding-node-help">
          Click on the map to place a new {nodeType === 'standard' ? 'info' : 'map'} node
        </div>
      )}

      {saveError && (
        <div className="save-error">
          ❌ {saveError}
        </div>
      )}

      {selectedNode && (
        <div className="node-editor">
          <h3>Edit {selectedNode.eventType === 'standard' ? 'Info' : 'Map'} Node</h3>
          <div className="form-group">
            <label>Title:</label>
            <input
              type="text"
              value={editFormData.title}
              onChange={(e) => handleFormChange('title', e.target.value)}
              disabled={saving}
            />
          </div>
          <div className="form-group">
            <label>Description:</label>
            <textarea
              value={editFormData.description}
              onChange={(e) => handleFormChange('description', e.target.value)}
              rows={2}
              disabled={saving}
            />
          </div>
          <div className="form-group">
            <label>Content:</label>
            <textarea
              value={editFormData.content}
              onChange={(e) => handleFormChange('content', e.target.value)}
              rows={4}
              disabled={saving}
            />
          </div>
          {map?.timelineEnabled && (
            <>
              <div className="form-group">
                <label>Start Time:</label>
                <input
                  type="number"
                  value={editFormData.startTime}
                  onChange={(e) => handleFormChange('startTime', parseInt(e.target.value) || 0)}
                  min={timelineSettings.minTime}
                  max={timelineSettings.maxTime}
                  disabled={saving}
                />
              </div>
              <div className="form-group">
                <label>End Time:</label>
                <input
                  type="number"
                  value={editFormData.endTime}
                  onChange={(e) => handleFormChange('endTime', parseInt(e.target.value) || 100)}
                  min={timelineSettings.minTime}
                  max={timelineSettings.maxTime}
                  disabled={saving}
                />
              </div>
            </>
          )}
          {selectedNode.eventType === 'map_link' && (
            <div className="form-group">
              <label>Linked Map:</label>
              <select
                value={editFormData.linkToMapId || ''}
                onChange={(e) => {
                  const newMapId = e.target.value ? parseInt(e.target.value) : null
                  handleFormChange('linkToMapId', newMapId)
                }}
                disabled={saving || loadingMaps}
              >
                <option value="">Select a map...</option>
                {availableMaps.map(map => (
                  <option key={map.id} value={map.id}>
                    {map.title}
                  </option>
                ))}
              </select>
              {loadingMaps && <small>Loading maps...</small>}
            </div>
          )}
          <div className="form-actions">
            <button 
              onClick={handleSaveChanges}
              className="save-button"
              disabled={saving || !hasUnsavedChanges}
            >
              {saving ? '💾 Saving...' : hasUnsavedChanges ? '💾 Save Changes' : '✅ Saved'}
            </button>
            <button onClick={() => setSelectedNode(null)} disabled={saving}>
              Close
            </button>
            <button 
              onClick={() => handleNodeDelete(selectedNode)}
              className="delete-button"
              disabled={saving}
            >
              Delete Node
            </button>
          </div>
          {hasUnsavedChanges && (
            <div className="unsaved-changes-notice">
              <small>⚠️ You have unsaved changes</small>
            </div>
          )}
        </div>
      )}

      {showInfoPanel && infoPanelNode && (
        <div className="info-panel">
          <div className="info-panel-header">
            <h3>{infoPanelNode.title}</h3>
            <button 
              onClick={() => setShowInfoPanel(false)}
              className="close-button"
              title="Close info panel"
            >
              ✕
            </button>
          </div>
          <div className="info-panel-content">
            {infoPanelNode.description && (
              <div className="info-section">
                <h4>Description</h4>
                <p>{infoPanelNode.description}</p>
              </div>
            )}
            {infoPanelNode.content && (
              <div className="info-section">
                <h4>Details</h4>
                <div className="content-text">{infoPanelNode.content}</div>
              </div>
            )}
            {interactionMode === 'view' && (
              <div className="info-panel-actions">
                <button 
                  onClick={() => {
                    setInteractionMode('edit')
                    setSelectedNode(infoPanelNode)
                    // Populate form data for editing
                    setEditFormData({
                      title: infoPanelNode.title || '',
                      description: infoPanelNode.description || '',
                      content: infoPanelNode.content || '',
                      linkToMapId: infoPanelNode.linkToMapId || null,
                      startTime: infoPanelNode.startTime || 0,
                      endTime: infoPanelNode.endTime || 100
                    })
                    setHasUnsavedChanges(false)
                    setShowInfoPanel(false)
                  }}
                  className="edit-button"
                >
                  ✏️ Edit This Node
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Timeline scrubber */}
      {map?.timelineEnabled && (
        <div className="timeline-scrubber">
          <div className="timeline-controls">
            <div className="timeline-label">
              <span>Timeline: {currentTime} {timelineSettings.timeUnit}</span>
            </div>
            <div className="timeline-slider">
              <input
                type="range"
                min={timelineSettings.minTime}
                max={timelineSettings.maxTime}
                value={currentTime}
                onChange={(e) => handleTimelineChange(e.target.value)}
                className="timeline-range"
              />
            </div>
            <div className="timeline-bounds">
              <span>{timelineSettings.minTime}</span>
              <span>{timelineSettings.maxTime}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MapViewer