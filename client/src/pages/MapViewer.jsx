import React, { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import mapService from '../services/mapService'
import eventService from '../services/eventService'
import imageService from '../services/imageService'

const MapViewer = () => {
  const { mapId } = useParams()
  
  // Core state
  const [map, setMap] = useState(null)
  const [nodes, setNodes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  
  // Camera/viewport state
  const [camera, setCamera] = useState({ x: 0, y: 0 }) // World position camera is looking at
  const [zoom, setZoom] = useState(1) // Zoom level
  
  // Interaction state
  const [interactionMode, setInteractionMode] = useState('view') // 'view' or 'edit'
  const [isDraggingViewport, setIsDraggingViewport] = useState(false)
  const [isDraggingNode, setIsDraggingNode] = useState(false)
  const [dragStartMouse, setDragStartMouse] = useState({ x: 0, y: 0 })
  const [dragStartCamera, setDragStartCamera] = useState({ x: 0, y: 0 })
  const [dragStartNodePos, setDragStartNodePos] = useState({ x: 0, y: 0 })
  const [draggingNode, setDraggingNode] = useState(null)
  const [selectedNode, setSelectedNode] = useState(null)
  
  // Refs
  const containerRef = useRef(null)
  
  // Load map and nodes
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        const [mapResult, eventsResult] = await Promise.all([
          mapService.getMap(mapId),
          eventService.getEvents(mapId)
        ])
        
        setMap(mapResult.map)
        // Convert percentage coordinates to world pixels (temporary migration)
        const convertedNodes = eventsResult.events.map(node => ({
          ...node,
          worldX: node.xPixel || (node.x || 0) * 1000, // Convert % to pixels
          worldY: node.yPixel || (node.y || 0) * 1000
        }))
        setNodes(convertedNodes)
      } catch (err) {
        console.error('Failed to load map data:', err)
        setError(err.message || 'Failed to load map')
      } finally {
        setLoading(false)
      }
    }
    
    if (mapId) {
      loadData()
    }
  }, [mapId])
  
  // Convert world coordinates to screen coordinates
  const worldToScreen = (worldX, worldY) => {
    if (!containerRef.current) return { x: 0, y: 0 }
    
    const rect = containerRef.current.getBoundingClientRect()
    const centerX = rect.width / 2
    const centerY = rect.height / 2
    
    const screenX = centerX + (worldX - camera.x) * zoom
    const screenY = centerY + (worldY - camera.y) * zoom
    
    return { x: screenX, y: screenY }
  }
  
  // Convert screen coordinates to world coordinates
  const screenToWorld = (screenX, screenY) => {
    if (!containerRef.current) return { x: 0, y: 0 }
    
    const rect = containerRef.current.getBoundingClientRect()
    const centerX = rect.width / 2
    const centerY = rect.height / 2
    
    const worldX = camera.x + (screenX - centerX) / zoom
    const worldY = camera.y + (screenY - centerY) / zoom
    
    return { x: worldX, y: worldY }
  }
  
  // Mouse event handlers
  const handleMouseDown = (e) => {
    const mouseX = e.clientX
    const mouseY = e.clientY
    
    // Check if clicking on a node
    if (interactionMode === 'edit') {
      const rect = containerRef.current.getBoundingClientRect()
      const localX = mouseX - rect.left
      const localY = mouseY - rect.top
      
      // Find node under cursor
      for (const node of nodes) {
        const screenPos = worldToScreen(node.worldX, node.worldY)
        const distance = Math.sqrt(
          Math.pow(localX - screenPos.x, 2) + Math.pow(localY - screenPos.y, 2)
        )
        
        if (distance < 20) { // 20px click radius
          // Start dragging node
          setIsDraggingNode(true)
          setDraggingNode(node)
          setDragStartMouse({ x: mouseX, y: mouseY })
          setDragStartNodePos({ x: node.worldX, y: node.worldY })
          return
        }
      }
    }
    
    // Start dragging viewport
    setIsDraggingViewport(true)
    setDragStartMouse({ x: mouseX, y: mouseY })
    setDragStartCamera({ x: camera.x, y: camera.y })
  }
  
  const handleMouseMove = (e) => {
    const mouseX = e.clientX
    const mouseY = e.clientY
    
    if (isDraggingNode && draggingNode) {
      // Drag node: update world position
      const mouseDeltaX = mouseX - dragStartMouse.x
      const mouseDeltaY = mouseY - dragStartMouse.y
      
      // Convert mouse delta to world delta
      const worldDeltaX = mouseDeltaX / zoom
      const worldDeltaY = mouseDeltaY / zoom
      
      const newWorldX = dragStartNodePos.x + worldDeltaX
      const newWorldY = dragStartNodePos.y + worldDeltaY
      
      // Update node position
      setNodes(nodes.map(node => 
        node.id === draggingNode.id 
          ? { ...node, worldX: newWorldX, worldY: newWorldY }
          : node
      ))
      setDraggingNode({ ...draggingNode, worldX: newWorldX, worldY: newWorldY })
      
    } else if (isDraggingViewport) {
      // Drag viewport: update camera position
      const mouseDeltaX = mouseX - dragStartMouse.x
      const mouseDeltaY = mouseY - dragStartMouse.y
      
      // Convert mouse delta to world delta (inverted for camera)
      const cameraDeltaX = -mouseDeltaX / zoom
      const cameraDeltaY = -mouseDeltaY / zoom
      
      setCamera({
        x: dragStartCamera.x + cameraDeltaX,
        y: dragStartCamera.y + cameraDeltaY
      })
    }
  }
  
  const handleMouseUp = async () => {
    if (isDraggingNode && draggingNode) {
      // Save node position
      try {
        await eventService.updateEvent(draggingNode.id, {
          x_pixel: Math.round(draggingNode.worldX),
          y_pixel: Math.round(draggingNode.worldY)
        })
      } catch (err) {
        console.error('Failed to save node position:', err)
      }
    }
    
    setIsDraggingViewport(false)
    setIsDraggingNode(false)
    setDraggingNode(null)
  }
  
  const handleWheel = (e) => {
    e.preventDefault()
    
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1
    const newZoom = Math.max(0.1, Math.min(5, zoom * zoomFactor))
    
    // Zoom towards mouse position
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top
      
      const worldPos = screenToWorld(mouseX, mouseY)
      
      setZoom(newZoom)
      
      // Adjust camera to keep mouse position fixed
      const newScreenPos = worldToScreen(worldPos.x, worldPos.y)
      const deltaX = (mouseX - newScreenPos.x) / newZoom
      const deltaY = (mouseY - newScreenPos.y) / newZoom
      
      setCamera(prev => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY
      }))
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
        <Link to="/maps">← Back to Maps</Link>
      </div>
    )
  }
  
  return (
    <div className="map-viewer">
      {/* Header */}
      <div className="map-header">
        <div className="header-content">
          <h1>{map?.title || 'Map Viewer'}</h1>
          <Link to="/maps" className="back-link">← Back to Maps</Link>
        </div>
        {map?.description && (
          <p className="map-description">{map.description}</p>
        )}
      </div>
      
      {/* Controls */}
      <div className="map-controls">
        <div className="view-controls">
          <button onClick={() => setZoom(1)}>Reset Zoom</button>
          <button onClick={() => setCamera({ x: 0, y: 0 })}>Center</button>
          <span className="zoom-level">Zoom: {Math.round(zoom * 100)}%</span>
          
          <button 
            className={`mode-toggle ${interactionMode}`}
            onClick={() => setInteractionMode(interactionMode === 'view' ? 'edit' : 'view')}
          >
            {interactionMode === 'view' ? 'View Mode' : 'Edit Mode'}
          </button>
        </div>
      </div>
      
      {/* Map Container */}
      <div 
        ref={containerRef}
        className="map-container"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        style={{
          cursor: isDraggingViewport ? 'grabbing' : 'grab',
          position: 'relative',
          flex: 1,
          overflow: 'hidden',
          background: '#1a1a1a'
        }}
      >
        {/* Background Image */}
        {map?.imageUrl && (
          <img
            src={map.imageUrl}
            alt="Map background"
            style={{
              position: 'absolute',
              ...worldToScreen(0, 0),
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
              pointerEvents: 'none',
              maxWidth: 'none'
            }}
          />
        )}
        
        {/* Nodes */}
        {nodes.map(node => {
          const screenPos = worldToScreen(node.worldX, node.worldY)
          
          return (
            <div
              key={node.id}
              className={`map-node ${node.eventType} ${selectedNode?.id === node.id ? 'selected' : ''}`}
              style={{
                position: 'absolute',
                left: screenPos.x,
                top: screenPos.y,
                transform: 'translate(-50%, -50%)',
                cursor: interactionMode === 'edit' ? 'grab' : 'pointer',
                zIndex: 10
              }}
              onClick={() => setSelectedNode(node)}
            >
              <div className="node-marker">
                {node.eventType === 'map_link' ? '🗺️' : 'ℹ️'}
              </div>
              
              <div className="node-tooltip">
                <strong>{node.title}</strong>
                {node.description && <p>{node.description}</p>}
              </div>
            </div>
          )
        })}
        
        {/* Debug Info */}
        <div style={{
          position: 'absolute',
          top: 10,
          left: 10,
          background: 'rgba(0,0,0,0.7)',
          color: 'white',
          padding: '10px',
          borderRadius: '5px',
          fontSize: '12px',
          fontFamily: 'monospace'
        }}>
          Camera: ({Math.round(camera.x)}, {Math.round(camera.y)})<br/>
          Zoom: {zoom.toFixed(2)}<br/>
          Mode: {interactionMode}<br/>
          Nodes: {nodes.length}
        </div>
      </div>
    </div>
  )
}

export default MapViewer