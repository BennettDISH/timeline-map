import React, { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import mapService from '../services/mapService'

function MapViewer() {
  const { mapId } = useParams()
  const [map, setMap] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [nodes, setNodes] = useState([])
  const [isAddingNode, setIsAddingNode] = useState(false)
  const [selectedNode, setSelectedNode] = useState(null)
  const [nodeType, setNodeType] = useState('info') // 'info' or 'map'
  
  // Pan and zoom state
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 })
  
  const containerRef = useRef(null)
  const imageRef = useRef(null)

  useEffect(() => {
    if (mapId) {
      loadMap()
    }
  }, [mapId])

  const loadMap = async () => {
    try {
      setLoading(true)
      const result = await mapService.getMap(mapId)
      setMap(result.map)
      setError('')
      
      // TODO: Load nodes/events for this map
      setNodes([])
    } catch (err) {
      console.error('Failed to load map:', err)
      setError(err.message || 'Failed to load map')
    } finally {
      setLoading(false)
    }
  }

  const handleMouseDown = (e) => {
    if (isAddingNode) return // Don't drag when adding nodes
    
    setIsDragging(true)
    setLastMousePos({ x: e.clientX, y: e.clientY })
    e.preventDefault()
  }

  const handleMouseMove = (e) => {
    if (!isDragging) return
    
    const deltaX = e.clientX - lastMousePos.x
    const deltaY = e.clientY - lastMousePos.y
    
    setPosition(prev => ({
      x: prev.x + deltaX,
      y: prev.y + deltaY
    }))
    
    setLastMousePos({ x: e.clientX, y: e.clientY })
  }

  const handleMouseUp = () => {
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

  const handleMapClick = (e) => {
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
      const newNode = {
        id: Date.now(), // Temporary ID
        type: nodeType,
        x: imageX,
        y: imageY,
        title: `New ${nodeType} node`,
        content: 'Click to edit this node'
      }
      
      setNodes([...nodes, newNode])
      setSelectedNode(newNode)
      setIsAddingNode(false)
    }
  }

  const resetView = () => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
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
              disabled={isAddingNode}
            >
              <option value="info">Info Node</option>
              <option value="map">Map Node</option>
            </select>
          </label>
          <button 
            className={`add-node-button ${isAddingNode ? 'active' : ''}`}
            onClick={() => setIsAddingNode(!isAddingNode)}
          >
            {isAddingNode ? '✕ Cancel' : `+ Add ${nodeType === 'info' ? 'Info' : 'Map'} Node`}
          </button>
        </div>
      </div>

      <div 
        className={`map-container ${isAddingNode ? 'adding-node' : ''} ${isDragging ? 'dragging' : ''}`}
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
              className={`map-node ${node.type} ${selectedNode?.id === node.id ? 'selected' : ''}`}
              style={{
                left: `${node.x}%`,
                top: `${node.y}%`
              }}
              onClick={(e) => {
                e.stopPropagation()
                setSelectedNode(node)
              }}
            >
              <div className="node-marker">
                {node.type === 'info' ? 'ℹ️' : '🗺️'}
              </div>
              <div className="node-tooltip">
                <strong>{node.title}</strong>
                <p>{node.content}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {isAddingNode && (
        <div className="adding-node-help">
          Click on the map to place a new {nodeType === 'info' ? 'info' : 'map'} node
        </div>
      )}

      {selectedNode && (
        <div className="node-editor">
          <h3>Edit {selectedNode.type === 'info' ? 'Info' : 'Map'} Node</h3>
          <div className="form-group">
            <label>Title:</label>
            <input
              type="text"
              value={selectedNode.title}
              onChange={(e) => {
                const updated = { ...selectedNode, title: e.target.value }
                setSelectedNode(updated)
                setNodes(nodes.map(n => n.id === updated.id ? updated : n))
              }}
            />
          </div>
          <div className="form-group">
            <label>Content:</label>
            <textarea
              value={selectedNode.content}
              onChange={(e) => {
                const updated = { ...selectedNode, content: e.target.value }
                setSelectedNode(updated)
                setNodes(nodes.map(n => n.id === updated.id ? updated : n))
              }}
              rows={4}
            />
          </div>
          <div className="form-actions">
            <button onClick={() => setSelectedNode(null)}>Close</button>
            <button 
              onClick={() => {
                setNodes(nodes.filter(n => n.id !== selectedNode.id))
                setSelectedNode(null)
              }}
              className="delete-button"
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