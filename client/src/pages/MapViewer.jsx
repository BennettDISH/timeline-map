import React, { useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import mapService from '../services/mapService'
import eventService from '../services/eventService'

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
      
      setMap(mapResult.map)
      setNodes(eventsResult.events)
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
    e.preventDefault()
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
      // Node dragging - simplified coordinate calculation
      if (!imageRef.current) return
      
      // Get the transformed image element's current position and size
      const imageRect = imageRef.current.getBoundingClientRect()
      
      // Calculate mouse position relative to the transformed image
      const mouseX = e.clientX - imageRect.left
      const mouseY = e.clientY - imageRect.top
      
      // Convert to percentage of the actual displayed image size
      const percentX = (mouseX / imageRect.width) * 100
      const percentY = (mouseY / imageRect.height) * 100
      
      // Keep within reasonable bounds
      const boundedX = Math.max(0, Math.min(100, percentX))
      const boundedY = Math.max(0, Math.min(100, percentY))
      
      console.log('Dragging coordinates:', { 
        mouseX, mouseY, 
        imageRect: { width: imageRect.width, height: imageRect.height },
        percentX, percentY, 
        boundedX, boundedY 
      })
      
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
    
    // Calculate click position relative to the image
    const rect = imageRef.current.getBoundingClientRect()
    const containerRect = containerRef.current.getBoundingClientRect()
    
    const clickX = e.clientX - containerRect.left
    const clickY = e.clientY - containerRect.top
    
    // Convert to image coordinates (percentage)
    const imageX = ((clickX - position.x) / scale - (rect.left - containerRect.left)) / (rect.width / scale) * 100
    const imageY = ((clickY - position.y) / scale - (rect.top - containerRect.top)) / (rect.height / scale) * 100
    
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
    
    setIsDraggingNode(true)
    setDraggingNode(node)
    
    // Don't calculate any offset - we'll handle positioning directly
    setDragOffset({ x: 0, y: 0 })
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
      }
    } catch (err) {
      console.error('Failed to delete node:', err)
      setSaveError(err.message || 'Failed to delete node')
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
        </div>
        
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
          {nodes.map(node => (
            <div
              key={node.id}
              className={`map-node ${node.eventType} ${selectedNode?.id === node.id ? 'selected' : ''} ${draggingNode?.id === node.id ? 'dragging' : ''}`}
              style={{
                left: `${node.x}%`,
                top: `${node.y}%`,
                cursor: isDraggingNode && draggingNode?.id === node.id ? 'grabbing' : 'grab'
              }}
              onMouseDown={(e) => handleNodeMouseDown(e, node)}
              onClick={(e) => {
                e.stopPropagation()
                if (!isDraggingNode) {
                  if (node.eventType === 'map_link' && node.linkToMapId) {
                    // Navigate to linked map
                    navigate(`/map/${node.linkToMapId}`)
                  } else {
                    setSelectedNode(node)
                  }
                }
              }}
              title={node.eventType === 'map_link' && node.linkToMapId ? 'Click to navigate to linked map' : 'Click to edit node'}
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
              value={selectedNode.title}
              onChange={(e) => {
                const newTitle = e.target.value
                handleNodeUpdate(selectedNode, { title: newTitle })
              }}
              disabled={saving}
            />
          </div>
          <div className="form-group">
            <label>Description:</label>
            <textarea
              value={selectedNode.description || ''}
              onChange={(e) => {
                const newDescription = e.target.value
                handleNodeUpdate(selectedNode, { description: newDescription })
              }}
              rows={2}
              disabled={saving}
            />
          </div>
          <div className="form-group">
            <label>Content:</label>
            <textarea
              value={selectedNode.content || ''}
              onChange={(e) => {
                const newContent = e.target.value
                handleNodeUpdate(selectedNode, { content: newContent })
              }}
              rows={4}
              disabled={saving}
            />
          </div>
          {selectedNode.eventType === 'map_link' && (
            <div className="form-group">
              <label>Linked Map:</label>
              <select
                value={selectedNode.linkToMapId || ''}
                onChange={(e) => {
                  const newMapId = e.target.value ? parseInt(e.target.value) : null
                  handleNodeUpdate(selectedNode, { link_to_map_id: newMapId })
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
        </div>
      )}
    </div>
  )
}

export default MapViewer