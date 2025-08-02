import React, { useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import mapService from '../services/mapService'
import eventService from '../services/eventService'
import worldService from '../services/worldService'
import axios from 'axios'
import '../styles/timelineStyles.scss'
import '../styles/alignmentStyles.scss'

function MapViewer() {
  const { mapId } = useParams()
  const navigate = useNavigate()
  
  // Core state
  const [map, setMap] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [nodes, setNodes] = useState([])
  const [selectedNode, setSelectedNode] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  
  // Timeline state
  const [currentTime, setCurrentTime] = useState(50)
  const [timelineSettings, setTimelineSettings] = useState({
    minTime: 0,
    maxTime: 100,
    timeUnit: 'years'
  })
  const [timelineEnabled, setTimelineEnabled] = useState(false)
  const [timelineImages, setTimelineImages] = useState([])
  
  // Image alignment state
  const [alignmentMode, setAlignmentMode] = useState(false)
  const [selectedTimelineImage, setSelectedTimelineImage] = useState(null)
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 })
  const [imageScale, setImageScale] = useState(1.0)
  
  // Interaction state
  const [interactionMode, setInteractionMode] = useState('view') // 'view' or 'edit'
  const [isAddingNode, setIsAddingNode] = useState(false)
  const [nodeType, setNodeType] = useState('standard')
  const [availableMaps, setAvailableMaps] = useState([])
  const [showInfoPanel, setShowInfoPanel] = useState(false)
  const [infoPanelNode, setInfoPanelNode] = useState(null)
  
  // Edit form state
  const [editFormData, setEditFormData] = useState({
    title: '',
    description: '',
    content: '',
    linkToMapId: null,
    startTime: 0,
    endTime: 100,
    timelineEnabled: false
  })
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  
  // **SIMPLE COORDINATE SYSTEM**
  const [camera, setCamera] = useState({ x: 500, y: 500 }) // World position camera is looking at (center of typical coordinate space)
  const [zoom, setZoom] = useState(1) // Zoom level
  const [isDraggingViewport, setIsDraggingViewport] = useState(false)
  const [isDraggingNode, setIsDraggingNode] = useState(false)
  const [isDraggingImage, setIsDraggingImage] = useState(false)
  const [dragStartMouse, setDragStartMouse] = useState({ x: 0, y: 0 })
  const [dragStartCamera, setDragStartCamera] = useState({ x: 0, y: 0 })
  const [dragStartNodePos, setDragStartNodePos] = useState({ x: 0, y: 0 })
  const [dragStartImagePos, setDragStartImagePos] = useState({ x: 0, y: 0 })
  const [draggingNode, setDraggingNode] = useState(null)
  
  // Refs
  const containerRef = useRef(null)
  const alignmentImageRef = useRef(null)
  const timelineUpdateTimeoutRef = useRef(null)
  
  // **COORDINATE CONVERSION FUNCTIONS**
  const worldToScreen = (worldX, worldY) => {
    if (!containerRef.current) {
      // Return center of viewport as fallback
      return { x: 400, y: 300 }
    }
    
    const rect = containerRef.current.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      // Return center of viewport as fallback  
      return { x: 400, y: 300 }
    }
    
    const centerX = rect.width / 2
    const centerY = rect.height / 2
    
    const screenX = centerX + (worldX - camera.x) * zoom
    const screenY = centerY + (worldY - camera.y) * zoom
    
    // DEBUG: Log coordinate conversion if it seems wrong
    if (screenX > 10000 || screenY > 10000 || screenX < -10000 || screenY < -10000) {
      console.log('🚨 COORDINATE CONVERSION ERROR:', {
        input: { worldX, worldY },
        camera,
        zoom,
        rect: { width: rect.width, height: rect.height },
        center: { centerX, centerY },
        calculation: {
          deltaX: worldX - camera.x,
          deltaY: worldY - camera.y,
          scaledDeltaX: (worldX - camera.x) * zoom,
          scaledDeltaY: (worldY - camera.y) * zoom
        },
        output: { screenX, screenY }
      })
    }
    
    return { x: screenX, y: screenY }
  }
  
  const screenToWorld = (screenX, screenY) => {
    if (!containerRef.current) return { x: 0, y: 0 }
    
    const rect = containerRef.current.getBoundingClientRect()
    const centerX = rect.width / 2
    const centerY = rect.height / 2
    
    const worldX = camera.x + (screenX - centerX) / zoom
    const worldY = camera.y + (screenY - centerY) / zoom
    
    return { x: worldX, y: worldY }
  }
  
  // Load data
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        const [mapResult, eventsResult] = await Promise.all([
          mapService.getMap(mapId),
          eventService.getEvents(mapId)
        ])
        
        setMap(mapResult.map)
        
        // Convert coordinates to world pixels
        const convertedNodes = eventsResult.events.map(node => {
          // Priority: use pixel coordinates if they exist and are not 0, otherwise use percentage * 1000
          let worldX, worldY
          
          if (node.xPixel !== undefined && node.xPixel !== null) {
            worldX = node.xPixel
            worldY = node.yPixel || 0
          } else {
            // Convert percentage to world coordinates 
            worldX = (node.x || 0) * 1000
            worldY = (node.y || 0) * 1000
          }
          
          // DEBUG: Check for corrupted coordinates from database
          if (Math.abs(worldX) > 10000 || Math.abs(worldY) > 10000) {
            console.log('🚨 CORRUPTED COORDINATES FROM DATABASE:', {
              nodeId: node.id,
              title: node.title,
              rawData: { 
                x: node.x, 
                y: node.y, 
                xPixel: node.xPixel, 
                yPixel: node.yPixel,
                types: {
                  x: typeof node.x,
                  y: typeof node.y,
                  xPixel: typeof node.xPixel,
                  yPixel: typeof node.yPixel
                }
              },
              converted: { worldX, worldY },
              calculation: node.xPixel !== undefined && node.xPixel !== null 
                ? 'Used xPixel/yPixel' 
                : 'Used x/y * 1000'
            })
            // Reset to reasonable coordinates near camera center
            worldX = 500 + (Math.random() - 0.5) * 200 // Random position near center
            worldY = 500 + (Math.random() - 0.5) * 200
          }
          
          return {
            ...node,
            worldX,
            worldY
          }
        })
        setNodes(convertedNodes)
        
        // Load timeline data if enabled
        if (mapResult.map.timelineEnabled) {
          setTimelineEnabled(true)
          setCurrentTime(mapResult.map.timelineCurrentTime || 50)
          setTimelineSettings({
            minTime: mapResult.map.timelineMinTime || 0,
            maxTime: mapResult.map.timelineMaxTime || 100,
            timeUnit: mapResult.map.timelineTimeUnit || 'years'
          })
          
          // Load timeline images
          try {
            const token = localStorage.getItem('auth_token')
            const timelineImagesResult = await axios.get(`/api/maps/${mapId}/timeline-images`, {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            })
            setTimelineImages(timelineImagesResult.data.images || [])
          } catch (err) {
            console.error('Error loading timeline images:', err)
          }
        }
        
        // Load available maps for linking
        try {
          const mapsResult = await mapService.getMaps()
          setAvailableMaps(mapsResult.maps.filter(m => m.id !== parseInt(mapId)))
        } catch (err) {
          // Silently continue without available maps
        }
        
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
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isAddingNode) {
          setIsAddingNode(false)
        }
        if (alignmentMode) {
          exitAlignmentMode()
        }
        if (selectedNode) {
          setSelectedNode(null)
        }
        if (showInfoPanel) {
          setShowInfoPanel(false)
        }
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isAddingNode, alignmentMode, selectedNode, showInfoPanel])
  
  // Get visible nodes based on timeline
  const getVisibleNodes = () => {
    if (!timelineEnabled) {
      console.log('🔵 Timeline disabled, showing all', nodes.length, 'nodes')
      return nodes
    }
    
    const visibleNodes = nodes.filter(node => {
      if (!node.timelineEnabled) return true
      const visible = currentTime >= node.startTime && currentTime <= node.endTime
      if (!visible && isDraggingNode && draggingNode?.id === node.id) {
        console.log('⚠️ DRAGGED NODE FILTERED OUT:', {
          nodeId: node.id,
          timelineEnabled: node.timelineEnabled,
          startTime: node.startTime,
          endTime: node.endTime,
          currentTime,
          visible
        })
      }
      return visible
    })
    
    if (isDraggingNode) {
      console.log('🎯 Visible nodes during drag:', visibleNodes.length, 'of', nodes.length)
    }
    
    return visibleNodes
  }
  
  // Get current background image based on timeline
  const getCurrentBackgroundImage = () => {
    if (!timelineEnabled || timelineImages.length === 0) {
      return { url: map?.imageUrl, isTimelineImage: false }
    }
    
    // DEBUG: Timeline image selection
    console.log('🖼️ TIMELINE DEBUG:', {
      currentTime,
      totalImages: timelineImages.length,
      timelineEnabled,
      images: timelineImages.map(img => ({
        id: img.id,
        startTime: img.startTime,
        endTime: img.endTime,
        url: img.imageUrl,
        active: currentTime >= img.startTime && currentTime <= img.endTime
      }))
    })
    
    // Find active timeline image
    const activeImage = timelineImages.find(img => {
      return currentTime >= img.startTime && currentTime <= img.endTime
    })
    
    if (activeImage) {
      console.log('✅ Using timeline image:', activeImage.id, activeImage.imageUrl)
      return {
        url: activeImage.imageUrl,
        isTimelineImage: true,
        imageData: activeImage,
        positioning: {
          positionX: activeImage.positionX || 0,
          positionY: activeImage.positionY || 0,
          scale: activeImage.scale || 1.0
        }
      }
    }
    
    console.log('⭕ Using default map image:', map?.imageUrl)
    return { url: map?.imageUrl, isTimelineImage: false }
  }
  
  // **MOUSE EVENTS**
  const handleMouseDown = (e) => {
    if (isAddingNode) {
      handleMapClick(e)
      return
    }
    
    const mouseX = e.clientX
    const mouseY = e.clientY
    
    // Check for alignment image dragging
    if (alignmentMode && selectedTimelineImage && e.target === alignmentImageRef.current) {
      e.stopPropagation()
      setIsDraggingImage(true)
      setDragStartMouse({ x: mouseX, y: mouseY })
      setDragStartImagePos({ x: imagePosition.x, y: imagePosition.y })
      return
    }
    
    // Check for node dragging in edit mode
    if (interactionMode === 'edit') {
      const rect = containerRef.current.getBoundingClientRect()
      const localX = mouseX - rect.left
      const localY = mouseY - rect.top
      
      for (const node of getVisibleNodes()) {
        const screenPos = worldToScreen(node.worldX, node.worldY)
        const distance = Math.sqrt(
          Math.pow(localX - screenPos.x, 2) + Math.pow(localY - screenPos.y, 2)
        )
        
        if (distance < 20) {
          setIsDraggingNode(true)
          setDraggingNode(node)
          setDragStartMouse({ x: mouseX, y: mouseY })
          setDragStartNodePos({ x: node.worldX, y: node.worldY })
          return
        }
      }
    }
    
    // Start viewport dragging
    setIsDraggingViewport(true)
    setDragStartMouse({ x: mouseX, y: mouseY })
    setDragStartCamera({ x: camera.x, y: camera.y })
  }
  
  const handleMouseMove = (e) => {
    const mouseX = e.clientX
    const mouseY = e.clientY
    
    if (isDraggingImage && selectedTimelineImage) {
      // Image alignment dragging
      const mouseDeltaX = mouseX - dragStartMouse.x
      const mouseDeltaY = mouseY - dragStartMouse.y
      
      // Convert to world delta (scale by zoom for alignment precision)
      const worldDeltaX = mouseDeltaX / (zoom * 100) // Scale factor for alignment
      const worldDeltaY = mouseDeltaY / (zoom * 100)
      
      setImagePosition({
        x: dragStartImagePos.x + worldDeltaX,
        y: dragStartImagePos.y + worldDeltaY
      })
      
    } else if (isDraggingNode && draggingNode) {
      // Node dragging
      const mouseDeltaX = mouseX - dragStartMouse.x
      const mouseDeltaY = mouseY - dragStartMouse.y
      
      const worldDeltaX = mouseDeltaX / zoom
      const worldDeltaY = mouseDeltaY / zoom
      
      const newWorldX = dragStartNodePos.x + worldDeltaX
      const newWorldY = dragStartNodePos.y + worldDeltaY
      
      // DEBUG: Check for coordinate corruption during drag
      if (Math.abs(newWorldX) > 10000 || Math.abs(newWorldY) > 10000) {
        console.log('🚨 PREVENTING COORDINATE CORRUPTION DURING DRAG:', {
          nodeId: draggingNode.id,
          mouseDelta: { x: mouseDeltaX, y: mouseDeltaY },
          worldDelta: { x: worldDeltaX, y: worldDeltaY },
          dragStart: dragStartNodePos,
          newWorld: { x: newWorldX, y: newWorldY },
          zoom,
          camera
        })
        return // Don't update coordinates if they're corrupted
      }
      
      setNodes(nodes.map(node => 
        node.id === draggingNode.id 
          ? { ...node, worldX: newWorldX, worldY: newWorldY }
          : node
      ))
      setDraggingNode({ ...draggingNode, worldX: newWorldX, worldY: newWorldY })
      
    } else if (isDraggingViewport) {
      // Viewport dragging
      const mouseDeltaX = mouseX - dragStartMouse.x
      const mouseDeltaY = mouseY - dragStartMouse.y
      
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
        const pixelX = Math.round(draggingNode.worldX)
        const pixelY = Math.round(draggingNode.worldY)
        
        // Prevent saving corrupted coordinates to database
        if (Math.abs(pixelX) > 10000 || Math.abs(pixelY) > 10000) {
          console.log('🚨 PREVENTED SAVING CORRUPTED COORDINATES:', {
            nodeId: draggingNode.id,
            worldPos: { x: draggingNode.worldX, y: draggingNode.worldY },
            pixelPos: { x: pixelX, y: pixelY }
          })
          return
        }
        
        await handleNodeUpdate(draggingNode, {
          x_pixel: pixelX,
          y_pixel: pixelY
        })
        console.log('✅ Node position saved for node:', draggingNode.id)
      } catch (err) {
        console.error('Failed to save node position:', err)
        // Reset node position on error
        setNodes(nodes.map(node => 
          node.id === draggingNode.id 
            ? { ...node, worldX: dragStartNodePos.x, worldY: dragStartNodePos.y }
            : node
        ))
      }
    }
    
    if (isDraggingImage && selectedTimelineImage) {
      // Save image position
      try {
        await saveImageAlignment()
      } catch (err) {
        console.error('Failed to save image position:', err)
      }
    }
    
    setIsDraggingViewport(false)
    setIsDraggingNode(false)
    setIsDraggingImage(false)
    setDraggingNode(null)
  }
  
  const handleWheel = (e) => {
    e.preventDefault()
    
    if (e.shiftKey && alignmentMode) {
      // Image scale adjustment
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      const newImageScale = Math.max(0.05, Math.min(5.0, imageScale + delta))
      setImageScale(newImageScale)
    } else {
      // Viewport zoom
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
  }
  
  // Node operations
  const handleMapClick = async (e) => {
    if (!isAddingNode) return
    
    const rect = containerRef.current.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    
    const worldPos = screenToWorld(mouseX, mouseY)
    
    setSaving(true)
    setSaveError('')
    
    try {
      const newNodeData = {
        title: `New ${nodeType === 'standard' ? 'Info' : 'Map'} Node`,
        description: '',
        content: 'Click to edit this node',
        map_id: parseInt(mapId),
        x_position: 0, // Keep for compatibility
        y_position: 0,
        x_pixel: Math.round(worldPos.x),
        y_pixel: Math.round(worldPos.y),
        event_type: nodeType,
        start_time: 0,
        end_time: 100,
        timeline_enabled: false
      }
      
      const result = await eventService.createEvent(newNodeData)
      const newNode = {
        ...result.event,
        worldX: Math.round(worldPos.x),
        worldY: Math.round(worldPos.y)
      }
      
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
  
  const handleNodeUpdate = async (node, updates) => {
    setSaving(true)
    setSaveError('')
    
    try {
      const result = await eventService.updateEvent(node.id, updates)
      const updatedNode = result.event
      
      setNodes(nodes.map(n => n.id === node.id ? {
        ...updatedNode,
        worldX: updatedNode.xPixel !== undefined && updatedNode.xPixel !== null ? updatedNode.xPixel : updatedNode.x * 1000,
        worldY: updatedNode.yPixel !== undefined && updatedNode.yPixel !== null ? updatedNode.yPixel : updatedNode.y * 1000
      } : n))
      
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
    setSaving(true)
    setSaveError('')
    
    try {
      await eventService.deleteEvent(node.id)
      setNodes(nodes.filter(n => n.id !== node.id))
      
      if (selectedNode && selectedNode.id === node.id) {
        setSelectedNode(null)
      }
      if (infoPanelNode && infoPanelNode.id === node.id) {
        setShowInfoPanel(false)
        setInfoPanelNode(null)
      }
    } catch (err) {
      console.error('Failed to delete node:', err)
      setSaveError(err.message || 'Failed to delete node')
    } finally {
      setSaving(false)
    }
  }
  
  // Timeline operations
  const handleTimelineChange = (newTime) => {
    const timeValue = parseInt(newTime)
    console.log('⏰ Timeline changed to:', timeValue)
    setCurrentTime(timeValue)
    
    clearTimeout(timelineUpdateTimeoutRef.current)
    timelineUpdateTimeoutRef.current = setTimeout(async () => {
      try {
        await worldService.updateWorld(map.worldId, {
          timeline_current_time: timeValue
        })
      } catch (err) {
        console.error('Failed to save timeline position:', err)
      }
    }, 500)
  }
  
  // Image alignment operations
  const saveImageAlignment = async () => {
    if (!selectedTimelineImage) return
    
    try {
      const token = localStorage.getItem('auth_token')
      await axios.put(`/api/maps/${mapId}/timeline-images/${selectedTimelineImage.id}`, {
        position_x: imagePosition.x,
        position_y: imagePosition.y,
        scale: imageScale
      }, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
    } catch (err) {
      console.error('Failed to save image alignment:', err)
      throw err
    }
  }
  
  const enterAlignmentMode = (timelineImage) => {
    setSelectedTimelineImage(timelineImage)
    setImagePosition({
      x: timelineImage.positionX || 0,
      y: timelineImage.positionY || 0
    })
    setImageScale(timelineImage.scale || 1.0)
    setAlignmentMode(true)
  }
  
  const exitAlignmentMode = () => {
    setAlignmentMode(false)
    setSelectedTimelineImage(null)
    setImagePosition({ x: 0, y: 0 })
    setImageScale(1.0)
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
  
  const backgroundData = getCurrentBackgroundImage()
  
  return (
    <div className="map-viewer">
      {/* Header */}
      <div className="map-header">
        <div className="header-content">
          <h1>{map?.title || 'Map Viewer'}</h1>
          <div className="header-actions">
            <Link to={`/map/${mapId}/settings`} className="settings-button">⚙️ Settings</Link>
            <Link to="/maps" className="back-link">← Back to Maps</Link>
          </div>
        </div>
        {map?.description && (
          <p className="map-description">{map.description}</p>
        )}
      </div>
      
      {/* Controls */}
      <div className="map-controls">
        <div className="view-controls">
          <button onClick={() => setZoom(1)}>Reset Zoom</button>
          <button onClick={() => setCamera({ x: 500, y: 500 })}>Center</button>
          <span className="zoom-level">Zoom: {Math.round(zoom * 100)}%</span>
          
          <button 
            className={`mode-toggle ${interactionMode}`}
            onClick={() => setInteractionMode(interactionMode === 'view' ? 'edit' : 'view')}
          >
            {interactionMode === 'view' ? 'View Mode' : 'Edit Mode'}
          </button>
          
          {!timelineEnabled && (
            <button
              onClick={async () => {
                try {
                  const result = await worldService.updateWorld(map.worldId, { 
                    timeline_enabled: true,
                    timeline_min_time: 0,
                    timeline_max_time: 100,
                    timeline_current_time: 50,
                    timeline_time_unit: 'years'
                  })
                  
                  // Update local state without reloading
                  setTimelineEnabled(true)
                  setTimelineSettings({
                    minTime: 0,
                    maxTime: 100,
                    timeUnit: 'years'
                  })
                  setCurrentTime(50)
                  
                  // Update the map object
                  setMap(prev => ({
                    ...prev,
                    timelineEnabled: true,
                    timelineMinTime: 0,
                    timelineMaxTime: 100,
                    timelineCurrentTime: 50,
                    timelineTimeUnit: 'years'
                  }))
                  
                } catch (err) {
                  console.error('❌ Timeline enable error:', err)
                  setSaveError(`Failed to enable timeline: ${err.message || err}`)
                }
              }}
              className="enable-timeline-button"
            >
              Enable Timeline
            </button>
          )}
        </div>
        
        {interactionMode === 'edit' && (
          <div className="node-controls">
            <label>
              Node Type:
              <select value={nodeType} onChange={(e) => setNodeType(e.target.value)}>
                <option value="standard">Info Node</option>
                <option value="map_link">Map Link</option>
              </select>
            </label>
            
            <button
              className={`add-node-button ${isAddingNode ? 'active' : ''}`}
              onClick={() => setIsAddingNode(!isAddingNode)}
            >
              {isAddingNode ? 'Cancel' : 'Add Node'}
            </button>
            
            {saving && <span className="saving-indicator">Saving...</span>}
          </div>
        )}
      </div>
      
      {/* Timeline */}
      {timelineEnabled && (
        <div className="timeline-container">
          <div className="timeline-header">
            <span className="timeline-label">Timeline: {currentTime} {timelineSettings.timeUnit}</span>
            <div className="timeline-actions">
              {alignmentMode && (
                <button onClick={exitAlignmentMode} className="exit-alignment-button">
                  Exit Alignment Mode
                </button>
              )}
              {alignmentMode && (
                <div className="alignment-help">
                  💡 <strong>Tip:</strong> Drag the blue-bordered image to align it. Use Shift+scroll to scale.
                </div>
              )}
            </div>
          </div>
          
          <div className="timeline-controls">
            <span className="timeline-min">{timelineSettings.minTime}</span>
            <input
              type="range"
              min={timelineSettings.minTime}
              max={timelineSettings.maxTime}
              value={currentTime}
              onChange={(e) => handleTimelineChange(e.target.value)}
              className="timeline-slider"
            />
            <span className="timeline-max">{timelineSettings.maxTime}</span>
          </div>
          
          {/* Timeline image dots */}
          {timelineImages.length > 0 && (
            <div className="timeline-images-indicator">
              {timelineImages.map((img, index) => (
                <div
                  key={img.id}
                  className={`timeline-dot ${selectedTimelineImage?.id === img.id ? 'selected' : ''}`}
                  style={{
                    left: `${((img.startTime - timelineSettings.minTime) / (timelineSettings.maxTime - timelineSettings.minTime)) * 100}%`,
                    backgroundColor: `hsl(${index * 60}, 70%, 50%)`
                  }}
                  onClick={() => enterAlignmentMode(img)}
                  title={`Click to align: ${img.originalName} (${img.startTime}-${img.endTime} ${timelineSettings.timeUnit})`}
                />
              ))}
            </div>
          )}
          
          {timelineImages.length === 0 && (
            <div className="timeline-empty-state">
              <p>No timeline images added yet. Go to <Link to={`/map/${mapId}/settings`}>Settings</Link> to add timeline images.</p>
            </div>
          )}
        </div>
      )}
      
      {/* Map Container */}
      <div 
        ref={containerRef}
        className={`map-container ${isAddingNode ? 'adding-node' : ''} ${isDraggingViewport ? 'dragging' : ''}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        style={{
          position: 'relative',
          flex: 1,
          overflow: 'hidden',
          background: '#1a1a1a',
          cursor: isDraggingViewport ? 'grabbing' : isAddingNode ? 'crosshair' : 'grab'
        }}
      >
        {/* Background Image */}
        {backgroundData.url && (
          <img
            src={backgroundData.url}
            alt="Map background"
            onLoad={() => console.log('🖼️ Background image loaded:', backgroundData.url)}
            onError={() => console.log('❌ Background image failed to load:', backgroundData.url)}
            style={{
              position: 'absolute',
              left: worldToScreen(0, 0).x,
              top: worldToScreen(0, 0).y,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
              pointerEvents: 'none',
              maxWidth: 'none'
            }}
          />
        )}
        
        {/* Alignment overlay image */}
        {alignmentMode && selectedTimelineImage && (
          <img
            ref={alignmentImageRef}
            src={selectedTimelineImage.imageUrl}
            alt="Image being aligned"
            className={`alignment-image ${isDraggingImage ? 'dragging' : ''}`}
            style={{
              position: 'absolute',
              left: worldToScreen(imagePosition.x * 1000, imagePosition.y * 1000).x,
              top: worldToScreen(imagePosition.x * 1000, imagePosition.y * 1000).y,
              transform: `scale(${zoom * imageScale})`,
              transformOrigin: 'top left',
              cursor: isDraggingImage ? 'grabbing' : 'grab',
              opacity: 0.7,
              border: '2px solid #007bff',
              zIndex: 5,
              maxWidth: 'none'
            }}
            draggable={false}
          />
        )}
        
        {/* Nodes */}
        {getVisibleNodes().map(node => {
          const screenPos = worldToScreen(node.worldX, node.worldY)
          
          // DEBUG: Node dragging visibility
          if (isDraggingNode && draggingNode?.id === node.id) {
            console.log('🎯 DRAGGED NODE:', {
              nodeId: node.id,
              worldPos: { x: node.worldX, y: node.worldY },
              screenPos,
              visible: screenPos.x > -50 && screenPos.x < (containerRef.current?.getBoundingClientRect().width || 0) + 50 &&
                      screenPos.y > -50 && screenPos.y < (containerRef.current?.getBoundingClientRect().height || 0) + 50,
              containerSize: {
                width: containerRef.current?.getBoundingClientRect().width,
                height: containerRef.current?.getBoundingClientRect().height
              }
            })
          }
          
          // DEBUG: Check for coordinate issues
          if (screenPos.x > 10000 || screenPos.y > 10000) {
            console.log('❌ NODE WITH BAD SCREEN POSITION:', {
              nodeId: node.id,
              key: `node-${node.id}`,
              worldPos: { x: node.worldX, y: node.worldY },
              screenPos,
              isDragging: isDraggingNode && draggingNode?.id === node.id
            })
          }
          
          return (
            <div
              key={node.id}
              className={`map-node ${node.eventType} ${selectedNode?.id === node.id ? 'selected' : ''} ${isDraggingNode && draggingNode?.id === node.id ? 'dragging' : ''}`}
              style={{
                position: 'absolute',
                left: screenPos.x,
                top: screenPos.y,
                transform: 'translate(-50%, -50%)',
                cursor: interactionMode === 'edit' ? 'grab' : 'pointer',
                zIndex: isDraggingNode && draggingNode?.id === node.id ? 20 : 10
              }}
              onClick={(e) => {
                e.stopPropagation()
                if (interactionMode === 'view') {
                  setInfoPanelNode(node)
                  setShowInfoPanel(true)
                } else {
                  setSelectedNode(node)
                }
              }}
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
        
        {isAddingNode && (
          <div className="adding-node-help">
            <p>Click anywhere to place a new {nodeType === 'standard' ? 'info' : 'map link'} node</p>
            <p><small>Press Escape to cancel</small></p>
          </div>
        )}
        
        {interactionMode === 'edit' && !isAddingNode && (
          <div className="edit-mode-help">
            <p><small>💡 Drag nodes to move them, click to edit. Drag empty space to pan.</small></p>
          </div>
        )}
        
        {saveError && (
          <div className="save-error">
            {saveError}
          </div>
        )}
      </div>
      
      {/* Info Panel */}
      {showInfoPanel && infoPanelNode && (
        <div className="info-panel">
          <div className="info-panel-header">
            <h3>{infoPanelNode.title}</h3>
            <button 
              className="close-button"
              onClick={() => setShowInfoPanel(false)}
            >
              ×
            </button>
          </div>
          
          <div className="info-panel-content">
            {infoPanelNode.description && (
              <div className="info-section">
                <h4>Description</h4>
                <p className="content-text">{infoPanelNode.description}</p>
              </div>
            )}
            
            {infoPanelNode.content && (
              <div className="info-section">
                <h4>Details</h4>
                <p className="content-text">{infoPanelNode.content}</p>
              </div>
            )}
            
            {infoPanelNode.eventType === 'map_link' && infoPanelNode.linkToMapId && (
              <div className="info-section">
                <h4>Navigation</h4>
                <button
                  className="edit-button"
                  onClick={() => navigate(`/maps/${infoPanelNode.linkToMapId}`)}
                >
                  Go to Linked Map
                </button>
              </div>
            )}
            
            {interactionMode === 'edit' && (
              <div className="info-panel-actions">
                <button
                  className="edit-button"
                  onClick={() => {
                    setSelectedNode(infoPanelNode)
                    setEditFormData({
                      title: infoPanelNode.title || '',
                      description: infoPanelNode.description || '',
                      content: infoPanelNode.content || '',
                      linkToMapId: infoPanelNode.linkToMapId || null,
                      startTime: infoPanelNode.startTime || 0,
                      endTime: infoPanelNode.endTime || 100,
                      timelineEnabled: infoPanelNode.timelineEnabled || false
                    })
                    setHasUnsavedChanges(false)
                    setShowInfoPanel(false)
                  }}
                >
                  Edit Node
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Node Editor */}
      {selectedNode && interactionMode === 'edit' && (
        <div className="node-editor">
          <h3>Edit Node</h3>
          
          <div className="form-group">
            <label>Title</label>
            <input
              type="text"
              value={editFormData.title}
              onChange={(e) => {
                setEditFormData({...editFormData, title: e.target.value})
                setHasUnsavedChanges(true)
              }}
              placeholder="Node title"
            />
          </div>
          
          <div className="form-group">
            <label>Description</label>
            <textarea
              value={editFormData.description}
              onChange={(e) => {
                setEditFormData({...editFormData, description: e.target.value})
                setHasUnsavedChanges(true)
              }}
              placeholder="Brief description"
              rows="3"
            />
          </div>
          
          <div className="form-group">
            <label>Content</label>
            <textarea
              value={editFormData.content}
              onChange={(e) => {
                setEditFormData({...editFormData, content: e.target.value})
                setHasUnsavedChanges(true)
              }}
              placeholder="Detailed content"
              rows="4"
            />
          </div>
          
          {selectedNode.eventType === 'map_link' && (
            <div className="form-group">
              <label>Linked Map</label>
              <select
                value={editFormData.linkToMapId || ''}
                onChange={(e) => {
                  setEditFormData({...editFormData, linkToMapId: e.target.value || null})
                  setHasUnsavedChanges(true)
                }}
              >
                <option value="">Select a map...</option>
                {availableMaps.map(map => (
                  <option key={map.id} value={map.id}>{map.title}</option>
                ))}
              </select>
            </div>
          )}
          
          {timelineEnabled && (
            <>
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={editFormData.timelineEnabled}
                    onChange={(e) => {
                      setEditFormData({...editFormData, timelineEnabled: e.target.checked})
                      setHasUnsavedChanges(true)
                    }}
                  />
                  Enable for Timeline
                </label>
              </div>
              
              {editFormData.timelineEnabled && (
                <>
                  <div className="form-group">
                    <label>Start Time: {editFormData.startTime}</label>
                    <input
                      type="range"
                      min={timelineSettings.minTime}
                      max={timelineSettings.maxTime}
                      value={editFormData.startTime}
                      onChange={(e) => {
                        setEditFormData({...editFormData, startTime: parseInt(e.target.value)})
                        setHasUnsavedChanges(true)
                      }}
                    />
                  </div>
                  
                  <div className="form-group">
                    <label>End Time: {editFormData.endTime}</label>
                    <input
                      type="range"
                      min={timelineSettings.minTime}
                      max={timelineSettings.maxTime}
                      value={editFormData.endTime}
                      onChange={(e) => {
                        setEditFormData({...editFormData, endTime: parseInt(e.target.value)})
                        setHasUnsavedChanges(true)
                      }}
                    />
                  </div>
                </>
              )}
            </>
          )}
          
          <div className="form-actions">
            <button onClick={() => setSelectedNode(null)}>
              Cancel
            </button>
            
            <button
              className="save-button"
              disabled={saving}
              onClick={async () => {
                await handleNodeUpdate(selectedNode, editFormData)
                setSelectedNode(null)
                setHasUnsavedChanges(false)
              }}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            
            <button
              className="delete-button"
              onClick={async () => {
                if (window.confirm('Delete this node?')) {
                  await handleNodeDelete(selectedNode)
                  setSelectedNode(null)
                }
              }}
            >
              Delete
            </button>
          </div>
          
          {hasUnsavedChanges && (
            <div className="unsaved-changes-notice">
              <small>You have unsaved changes</small>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default MapViewer