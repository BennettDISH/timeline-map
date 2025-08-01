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
    endTime: 100,
    timelineEnabled: false
  })
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  
  // Timeline state
  const [currentTime, setCurrentTime] = useState(50) // Current timeline position (0-100)
  const [timelineSettings, setTimelineSettings] = useState({
    minTime: 0,
    maxTime: 100,
    timeUnit: 'years'
  })
  const [timelineImages, setTimelineImages] = useState([]) // Timeline-based background images
  
  // Image alignment state (for timeline images)
  const [alignmentMode, setAlignmentMode] = useState(false)
  const [selectedTimelineImage, setSelectedTimelineImage] = useState(null)
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 })
  const [imageScale, setImageScale] = useState(1.0)
  const [isDraggingImage, setIsDraggingImage] = useState(false)
  const [dragStartPosition, setDragStartPosition] = useState({ x: 0, y: 0 })
  const [dragStartImagePosition, setDragStartImagePosition] = useState({ x: 0, y: 0 })
  
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
  const alignmentImageRef = useRef(null)

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

  // Cleanup timeline update timeout on unmount
  useEffect(() => {
    return () => {
      if (timelineUpdateTimeoutRef.current) {
        clearTimeout(timelineUpdateTimeoutRef.current)
      }
    }
  }, [])

  // Debug positioning issues
  useEffect(() => {
    if (alignmentMode && containerRef.current && imageRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect()
      const imageRect = imageRef.current.getBoundingClientRect()
      const mapContentEl = containerRef.current.querySelector('.map-content')
      const mapContentRect = mapContentEl ? mapContentEl.getBoundingClientRect() : null
      
      console.log('🔍 POSITIONING DEBUG:', {
        alignmentMode,
        selectedImage: selectedTimelineImage?.imageName,
        containerDimensions: {
          width: containerRect.width,
          height: containerRect.height
        },
        mapContentDimensions: mapContentRect ? {
          width: mapContentRect.width,
          height: mapContentRect.height,
          transform: mapContentEl.style.transform
        } : 'not found',
        imageDimensions: {
          width: imageRect.width,
          height: imageRect.height,
          naturalWidth: imageRef.current.naturalWidth,
          naturalHeight: imageRef.current.naturalHeight
        },
        imageStyles: {
          objectFit: window.getComputedStyle(imageRef.current).objectFit,
          transform: window.getComputedStyle(imageRef.current).transform
        },
        currentPosition: imagePosition,
        scale: imageScale,
        viewportTransform: {
          scale: scale,
          position: position
        }
      })
    }
  }, [alignmentMode, selectedTimelineImage, imagePosition, imageScale])

  const loadMap = async () => {
    try {
      setLoading(true)
      const [mapResult, eventsResult] = await Promise.all([
        mapService.getMap(mapId),
        eventService.getEvents(mapId)
      ])
      
      // Load world data to get timeline settings
      const worldResult = await worldService.getWorld(mapResult.map.worldId)
      
      // Load timeline images for this map if timeline is enabled
      let timelineImagesData = []
      if (worldResult.world.timelineEnabled) {
        try {
          const api = axios.create({
            baseURL: '/api',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            }
          })
          const timelineImagesResult = await api.get(`/maps/${mapId}/timeline-images`)
          timelineImagesData = timelineImagesResult.data.images || []
        } catch (err) {
          console.error('Failed to load timeline images:', err)
          // Continue without timeline images - not critical
        }
      }
      
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
      setTimelineImages(timelineImagesData)
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
    
    // Check if we're dragging the alignment image
    if (alignmentMode && selectedTimelineImage && e.target === alignmentImageRef.current) {
      e.stopPropagation()
      setIsDraggingImage(true)
      // Store starting position for delta-based dragging
      setDragStartPosition({ x: e.clientX, y: e.clientY })
      setDragStartImagePosition({ x: imagePosition.x, y: imagePosition.y })
      return
    }
    
    setIsDragging(true)
    setLastMousePos({ x: e.clientX, y: e.clientY })
    // Remove preventDefault to avoid passive event listener issues
  }

  const handleMouseMove = (e) => {
    if (isDraggingImage && selectedTimelineImage) {
      // Delta-based image dragging - immune to viewport coordinate issues
      const mouseDeltaX = e.clientX - dragStartPosition.x
      const mouseDeltaY = e.clientY - dragStartPosition.y
      
      // Convert mouse delta to grid delta (independent of absolute coordinates)
      const gridDeltaX = mouseDeltaX / scale
      const gridDeltaY = mouseDeltaY / scale
      
      // Apply delta to original image position
      const originalGridX = (dragStartImagePosition.x || 0) * 5
      const originalGridY = (dragStartImagePosition.y || 0) * 5
      
      const newGridX = originalGridX + gridDeltaX
      const newGridY = originalGridY + gridDeltaY
      
      // Convert back to percentage
      const newPercentX = newGridX / 5
      const newPercentY = newGridY / 5
      
      console.log('🖱️ DELTA-BASED IMAGE DRAG:', {
        mouseDelta: { mouseDeltaX, mouseDeltaY },
        gridDelta: { gridDeltaX, gridDeltaY },
        originalGrid: { originalGridX, originalGridY },
        newGrid: { newGridX, newGridY },
        newPercent: { newPercentX, newPercentY },
        viewportState: { scale: scale, position: position }
      })
      
      setImagePosition({
        x: newPercentX,
        y: newPercentY
      })
    } else if (isDragging && !isDraggingNode) {
      // Map dragging
      const deltaX = e.clientX - lastMousePos.x
      const deltaY = e.clientY - lastMousePos.y
      
      setPosition(prev => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY
      }))
      
      setLastMousePos({ x: e.clientX, y: e.clientY })
    } else if (isDraggingNode && draggingNode) {
      // Simple pixel-based node dragging
      const mouseDeltaX = e.clientX - lastMousePos.x
      const mouseDeltaY = e.clientY - lastMousePos.y
      
      // Convert mouse delta to world pixels (account for scale)
      const pixelDeltaX = mouseDeltaX / scale
      const pixelDeltaY = mouseDeltaY / scale
      
      // Apply delta to current pixel position
      const currentPixelX = draggingNode.xPixel !== undefined ? draggingNode.xPixel : (draggingNode.x || 0) * 500
      const currentPixelY = draggingNode.yPixel !== undefined ? draggingNode.yPixel : (draggingNode.y || 0) * 500
      
      const newPixelX = currentPixelX + pixelDeltaX
      const newPixelY = currentPixelY + pixelDeltaY
      
      console.log('🔵 PIXEL-BASED NODE DRAG:', {
        mouseDelta: { mouseDeltaX, mouseDeltaY },
        pixelDelta: { pixelDeltaX, pixelDeltaY },
        currentPixel: { currentPixelX, currentPixelY },
        newPixel: { newPixelX, newPixelY },
        scale: scale
      })
      
      // Update node position locally (don't save yet)
      setNodes(nodes.map(node => 
        node.id === draggingNode.id 
          ? { ...node, xPixel: Math.round(newPixelX), yPixel: Math.round(newPixelY) }
          : node
      ))
      
      // Update dragging node reference
      setDraggingNode({ ...draggingNode, xPixel: Math.round(newPixelX), yPixel: Math.round(newPixelY) })
      
      // Update mouse position for next delta calculation
      setLastMousePos({ x: e.clientX, y: e.clientY })
    }
  }

  const handleMouseUp = async () => {
    if (isDraggingImage) {
      setIsDraggingImage(false)
    } else if (isDraggingNode && draggingNode) {
      // Save the final position to database
      try {
        await handleNodeUpdate(draggingNode, {
          x_pixel: draggingNode.xPixel,
          y_pixel: draggingNode.yPixel
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
    
    if (e.shiftKey && alignmentMode) {
      // Image scale adjustment (Shift + wheel in alignment mode)
      const delta = e.deltaY > 0 ? -0.1 : 0.1
      const newImageScale = Math.max(0.05, Math.min(5.0, imageScale + delta))
      setImageScale(newImageScale)
    } else {
      // Regular viewport zoom
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
  }

  const handleMapClick = async (e) => {
    if (!isAddingNode || !containerRef.current) return
    
    // Calculate click position relative to GRID COORDINATES (not image)
    const containerRect = containerRef.current.getBoundingClientRect()
    const centerX = containerRect.width / 2
    const centerY = containerRect.height / 2
    
    // Mouse position relative to container
    const mouseX = e.clientX - containerRect.left
    const mouseY = e.clientY - containerRect.top
    
    // Convert mouse position to world pixel coordinates
    const pixelX = (mouseX - centerX) / scale - position.x
    const pixelY = (mouseY - centerY) / scale - position.y
    
    console.log('🎯 NODE PLACEMENT (pixel-based):', {
      mousePos: { mouseX, mouseY },
      worldPixel: { x: pixelX, y: pixelY },
      viewportState: { scale, position },
      center: { centerX, centerY }
    })
    
    // No bounds checking - nodes can be placed anywhere
    setSaving(true)
    setSaveError('')
    
    try {
      const newNodeData = {
        title: `New ${nodeType === 'standard' ? 'Info' : 'Map'} Node`,
        description: '',
        content: 'Click to edit this node',
        map_id: parseInt(mapId),
        x_position: 0, // Keep for backward compatibility
        y_position: 0, // Keep for backward compatibility
        x_pixel: Math.round(pixelX),
        y_pixel: Math.round(pixelY),
        event_type: nodeType,
        start_time: 0,
        end_time: 100,
        timeline_enabled: false
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
        endTime: node.endTime || 100,
        timelineEnabled: node.timelineEnabled || false
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

  const timelineUpdateTimeoutRef = useRef(null)

  const handleTimelineChange = (newTime) => {
    const timeValue = parseInt(newTime)
    setCurrentTime(timeValue)
    
    // Debounce the API call - only save after user stops dragging for 500ms
    if (timelineUpdateTimeoutRef.current) {
      clearTimeout(timelineUpdateTimeoutRef.current)
    }
    
    timelineUpdateTimeoutRef.current = setTimeout(async () => {
      try {
        await worldService.updateTimelinePosition(map.worldId, timeValue)
      } catch (err) {
        console.error('Failed to update timeline position:', err)
      }
    }, 500)
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

  // Get the appropriate background image based on current timeline position
  const getCurrentBackgroundImage = () => {
    console.log('getCurrentBackgroundImage called:', {
      timelineEnabled: map?.timelineEnabled,
      timelineImagesCount: timelineImages.length,
      currentTime: currentTime,
      alignmentMode: alignmentMode,
      selectedTimelineImageId: selectedTimelineImage?.id
    })
    
    if (!map?.timelineEnabled || timelineImages.length === 0) {
      // Return the original map image if timeline is disabled or no timeline images
      return { url: map?.imageUrl, positioning: null }
    }
    
    // If we're in alignment mode, show the reference image for alignment
    if (alignmentMode && selectedTimelineImage) {
      // Find the chronologically previous image to align against
      const sortedImages = timelineImages
        .filter(img => img.id !== selectedTimelineImage.id) // Exclude the image being aligned
        .sort((a, b) => a.startTime - b.startTime)
      
      // Find the most recent image before the one being aligned
      const referenceImage = sortedImages
        .filter(img => img.startTime < selectedTimelineImage.startTime)
        .pop() // Get the last one (most recent before current)
      
      if (referenceImage) {
        console.log('Using reference image for alignment:', referenceImage)
        return {
          url: referenceImage.imageUrl,
          positioning: {
            positionX: referenceImage.positionX || 0,
            positionY: referenceImage.positionY || 0,
            scale: referenceImage.scale || 1.0,
            objectFit: referenceImage.objectFit || 'cover'
          }
        }
      } else {
        // No previous image, use the base map image
        console.log('No reference image found, using base map')
        return { url: map?.imageUrl, positioning: null }
      }
    }
    
    // Normal timeline behavior - find the image that should be displayed at the current time
    const activeImage = timelineImages.find(img => {
      const matches = currentTime >= img.startTime && currentTime <= img.endTime
      console.log(`Checking timeline image ${img.id}:`, {
        startTime: img.startTime,
        endTime: img.endTime,
        currentTime: currentTime,
        matches: matches,
        hasPositioning: !!(img.positionX || img.positionY || img.scale !== 1.0)
      })
      return matches
    })
    
    if (activeImage) {
      console.log('Found active timeline image:', activeImage)
      return {
        url: activeImage.imageUrl,
        positioning: {
          positionX: activeImage.positionX || 0,
          positionY: activeImage.positionY || 0,
          scale: activeImage.scale || 1.0,
          objectFit: activeImage.objectFit || 'cover'
        }
      }
    }
    
    // Fall back to default image if one exists
    const defaultImage = timelineImages.find(img => img.isDefault)
    if (defaultImage) {
      return {
        url: defaultImage.imageUrl,
        positioning: {
          positionX: defaultImage.positionX || 0,
          positionY: defaultImage.positionY || 0,
          scale: defaultImage.scale || 1.0,
          objectFit: defaultImage.objectFit || 'cover'
        }
      }
    }
    
    // Fall back to original map image
    return { url: map?.imageUrl, positioning: null }
  }

  // Filter nodes based on current time if timeline is enabled
  const getVisibleNodes = () => {
    // Show all nodes by default
    if (!map?.timelineEnabled) {
      return nodes
    }
    
    // Only filter nodes that have timeline enabled
    return nodes.filter(node => {
      // If node doesn't have timeline enabled, always show it
      if (!node.timelineEnabled) {
        return true
      }
      
      // If node has timeline enabled, check if it's within time range
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
  
  // Image alignment functions
  const enterAlignmentMode = (timelineImage) => {
    setAlignmentMode(true)
    setSelectedTimelineImage(timelineImage)
    setImagePosition({ 
      x: timelineImage.positionX || 0, 
      y: timelineImage.positionY || 0 
    })
    setImageScale(timelineImage.scale || 1.0)
    setInteractionMode('edit') // Switch to edit mode for alignment
  }
  
  const exitAlignmentMode = () => {
    setAlignmentMode(false)
    setSelectedTimelineImage(null)
    setImagePosition({ x: 0, y: 0 })
    setImageScale(1.0)
  }
  
  const resetImagePosition = () => {
    setImagePosition({ x: 0, y: 0 })
    setImageScale(1.0)
  }
  
  const saveImageAlignment = async () => {
    if (!selectedTimelineImage) return
    
    console.log('Saving alignment:', {
      imageId: selectedTimelineImage.id,
      imageName: selectedTimelineImage.imageName,
      position: imagePosition,
      scale: imageScale
    })
    
    setSaving(true)
    setSaveError('')
    
    try {
      const api = axios.create({
        baseURL: '/api',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      })
      
      const response = await api.put(`/maps/${mapId}/timeline-images/${selectedTimelineImage.id}`, {
        position_x: imagePosition.x,
        position_y: imagePosition.y,
        scale: imageScale
      })
      
      console.log('Alignment save response:', response.data)
      
      // Update the timeline image in local state
      setTimelineImages(timelineImages.map(img => 
        img.id === selectedTimelineImage.id 
          ? { ...img, positionX: imagePosition.x, positionY: imagePosition.y, scale: imageScale }
          : img
      ))
      
      // Update selected image
      setSelectedTimelineImage({
        ...selectedTimelineImage,
        positionX: imagePosition.x,
        positionY: imagePosition.y,
        scale: imageScale
      })
      
      setSaveError('')
    } catch (err) {
      console.error('Failed to save image alignment:', err)
      const errorMessage = err.response?.data?.message || 'Failed to save alignment'
      
      if (errorMessage.includes('column "position_x" does not exist') || errorMessage.includes('position_x')) {
        setSaveError('Database migration required. Please run the migration from /migration to add positioning support.')
      } else {
        setSaveError(errorMessage)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleSaveChanges = async () => {
    if (!selectedNode || !hasUnsavedChanges) return
    
    setSaving(true)
    setSaveError('')
    
    try {
      const updates = {
        title: editFormData.title,
        description: editFormData.description,
        content: editFormData.content,
        timeline_enabled: editFormData.timelineEnabled
      }
      
      // Add timeline fields if node has timeline enabled
      if (editFormData.timelineEnabled) {
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
            <Link to={`/map/${mapId}/settings`} className="settings-button">⚙️ Settings</Link>
            <Link to="/maps" className="back-link">← Back to Maps</Link>
          </div>
        </div>
        {map.description && (
          <p className="map-description">{map.description}</p>
        )}
      </div>

      {alignmentMode && selectedTimelineImage && (
        <div className="alignment-info-compact">
          <span className="alignment-title">🎯 Aligning: {selectedTimelineImage.imageName}</span>
          <div className="alignment-controls-compact">
            <span>Scale: {imageScale.toFixed(2)}x</span>
            <input
              type="range"
              min="0.05"
              max="5.0"
              step="0.05"
              value={imageScale}
              onChange={(e) => setImageScale(parseFloat(e.target.value))}
            />
            <span>Pos: {imagePosition.x.toFixed(0)}%, {imagePosition.y.toFixed(0)}%</span>
          </div>
        </div>
      )}

      <div className="map-controls">
        <div className="view-controls">
          <button onClick={resetView} title="Reset view">
            🎯 Reset View
          </button>
          <span className="zoom-level">
            Zoom: {Math.round(scale * 100)}%
            {alignmentMode && ` | Image: ${(imageScale * 100).toFixed(0)}%`}
          </span>
          <div className="mode-toggle-container">
            <span className="mode-label">👁️ View</span>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={interactionMode === 'edit'}
                onChange={() => {
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
              />
              <span className="slider"></span>
            </label>
            <span className="mode-label">✏️ Edit</span>
          </div>
          
          {interactionMode === 'edit' && (
            <>
              <button 
                onClick={handleTimelineToggle}
                className={`timeline-toggle ${map?.timelineEnabled ? 'enabled' : 'disabled'}`}
                title={`${map?.timelineEnabled ? 'Disable' : 'Enable'} timeline for this map`}
                disabled={saving}
              >
                {map?.timelineEnabled ? '🕒 Timeline ON' : '🕒 Timeline OFF'}
              </button>
              
              {alignmentMode && (
                <>
                  <button onClick={resetImagePosition} className="reset-button">
                    🔄 Reset Position
                  </button>
                  <button onClick={saveImageAlignment} disabled={saving} className="save-button">
                    {saving ? '💾 Saving...' : '💾 Save Alignment'}
                  </button>
                  <button onClick={exitAlignmentMode} className="cancel-button">
                    ✕ Exit Alignment
                  </button>
                </>
              )}
            </>
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
          {(() => {
            const backgroundData = getCurrentBackgroundImage()
            if (!backgroundData.url) {
              return (
                <div className="no-map-image">
                  <h3>No Background Image</h3>
                  <p>This map doesn't have a background image set.</p>
                </div>
              )
            }
            
            // Debug logging for positioning
            if (backgroundData.positioning) {
              console.log('MapViewer: Timeline image found with positioning:', {
                positionX: backgroundData.positioning.positionX,
                positionY: backgroundData.positioning.positionY,
                scale: backgroundData.positioning.scale,
                url: backgroundData.url
              })
            } else {
              console.log('MapViewer: Using regular map image (no positioning)', {
                url: backgroundData.url,
                timelineImagesCount: timelineImages.length,
                currentTime: currentTime
              })
            }
            
            // Apply positioning styles using GRID COORDINATES
            const imageStyle = backgroundData.positioning && containerRef.current ? (() => {
              const containerRect = containerRef.current.getBoundingClientRect()
              const centerX = containerRect.width / 2
              const centerY = containerRect.height / 2
              
              // Convert percentage-based positioning to grid coordinates
              // For now, treat percentages as grid coordinate offsets (we'll update this later)
              const gridX = (backgroundData.positioning.positionX || 0) * 5 // Scale up percentage to grid units
              const gridY = (backgroundData.positioning.positionY || 0) * 5
              
              // Convert grid coordinates to screen pixels relative to FIXED grid origin
              // Images should NOT move when viewport is dragged - they stay at fixed grid positions
              const screenX = centerX + (gridX * scale)
              const screenY = centerY + (gridY * scale)
              
              console.log('🎯 GRID POSITIONING:', {
                percentagePos: { x: backgroundData.positioning.positionX, y: backgroundData.positioning.positionY },
                gridPos: { x: gridX, y: gridY },
                screenPos: { x: screenX, y: screenY },
                scale: scale,
                viewportOffset: position
              })
              
              return {
                position: 'absolute',
                left: '0',
                top: '0',
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                transform: `translate(${screenX - centerX}px, ${screenY - centerY}px) scale(${backgroundData.positioning.scale || 1})`,
                transformOrigin: 'center center'
              }
            })() : {
              position: 'absolute',
              left: '0',
              top: '0',  
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              transform: `translate(0px, 0px) scale(${scale})`,
              transformOrigin: 'center center'
            }
            
            // Debug positioning and container info
            if (backgroundData.positioning) {
              console.log('MapViewer: Applied transform:', imageStyle.transform)
            }
            
            return (
              <>
                <img 
                  ref={imageRef}
                  src={backgroundData.url} 
                  alt={map.title}
                  className="map-image"
                  style={imageStyle}
                  draggable={false}
                />
                
                {/* Fixed coordinate grid - NEVER moves */}
                {interactionMode === 'edit' && containerRef.current && (() => {
                  const containerRect = containerRef.current.getBoundingClientRect()
                  const centerX = containerRect.width / 2
                  const centerY = containerRect.height / 2
                  
                  // Fixed grid spacing in pixels (scales with zoom for visibility)
                  const gridSpacing = 50 * scale
                  
                  // Calculate grid range to cover expanded view
                  const gridRange = 50 // Show 50 grid lines in each direction
                  
                  const verticalLines = []
                  const horizontalLines = []
                  
                  // Generate vertical lines - FIXED positions
                  for (let i = -gridRange; i <= gridRange; i++) {
                    const x = centerX + (i * gridSpacing)
                    const gridCoord = i
                    const isMajor = i % 5 === 0
                    
                    verticalLines.push(
                      <div 
                        key={`v${i}`}
                        className={`grid-line vertical ${isMajor ? 'major' : 'minor'}`}
                        style={{ 
                          left: `${x}px`,
                          top: 0,
                          height: '100%',
                          position: 'absolute'
                        }}
                      >
                        {isMajor && (
                          <span className="grid-label" style={{ 
                            position: 'absolute', 
                            top: `${centerY + 5}px`, 
                            left: '2px', 
                            fontSize: `${10 / scale}px`, 
                            color: '#007bff',
                            background: 'rgba(255,255,255,0.8)',
                            padding: '1px 3px',
                            borderRadius: '2px',
                            transform: `scale(${Math.min(1, 1/scale)})`,
                            pointerEvents: 'none'
                          }}>
                            {gridCoord * 50}
                          </span>
                        )}
                      </div>
                    )
                  }
                  
                  // Generate horizontal lines - FIXED positions
                  for (let i = -gridRange; i <= gridRange; i++) {
                    const y = centerY + (i * gridSpacing)
                    const gridCoord = -i // Negative because Y coordinates go up=positive, down=negative
                    const isMajor = i % 5 === 0
                    
                    horizontalLines.push(
                      <div 
                        key={`h${i}`}
                        className={`grid-line horizontal ${isMajor ? 'major' : 'minor'}`}
                        style={{ 
                          top: `${y}px`,
                          left: 0,
                          width: '100%',
                          position: 'absolute'
                        }}
                      >
                        {isMajor && (
                          <span className="grid-label" style={{ 
                            position: 'absolute', 
                            top: '2px', 
                            left: `${centerX + 5}px`, 
                            fontSize: `${10 / scale}px`, 
                            color: '#007bff',
                            background: 'rgba(255,255,255,0.8)',
                            padding: '1px 3px',
                            borderRadius: '2px',
                            transform: `scale(${Math.min(1, 1/scale)})`,
                            pointerEvents: 'none'
                          }}>
                            {gridCoord * 50}
                          </span>
                        )}
                      </div>
                    )
                  }
                  
                  return (
                    <div className="alignment-grid" style={{ 
                      overflow: 'visible', 
                      position: 'absolute', 
                      top: 0, 
                      left: 0, 
                      width: '100%', 
                      height: '100%', 
                      zIndex: 2,
                      pointerEvents: 'none'
                    }}>
                      {verticalLines}
                      {horizontalLines}
                      
                      {/* Origin marker at center of container */}
                      <div 
                        style={{
                          position: 'absolute',
                          left: `${centerX}px`,
                          top: `${centerY}px`,
                          width: '10px',
                          height: '10px',
                          background: '#ff0000',
                          borderRadius: '50%',
                          transform: 'translate(-50%, -50%)',
                          zIndex: 5,
                          pointerEvents: 'none'
                        }}
                      />
                      <div 
                        style={{
                          position: 'absolute',
                          left: `${centerX + 15}px`,
                          top: `${centerY - 8}px`,
                          fontSize: `${12 / scale}px`,
                          color: '#ff0000',
                          fontWeight: 'bold',
                          background: 'rgba(255,255,255,0.9)',
                          padding: '2px 4px',
                          borderRadius: '3px',
                          transform: `scale(${Math.min(1, 1/scale)})`,
                          pointerEvents: 'none',
                          zIndex: 5
                        }}
                      >
                        (0,0)
                      </div>
                    </div>
                  )
                })()}
                
                {/* Alignment overlay image */}
                {alignmentMode && selectedTimelineImage && (
                  <img
                    ref={alignmentImageRef}
                    src={selectedTimelineImage.imageUrl}
                    alt="Image being aligned"
                    className={`alignment-image ${isDraggingImage ? 'dragging' : ''}`}
                    style={(() => {
                      if (!containerRef.current) return {};
                      const containerRect = containerRef.current.getBoundingClientRect()
                      const centerX = containerRect.width / 2
                      const centerY = containerRect.height / 2
                      
                      // Convert alignment position to grid coordinates
                      const gridX = (imagePosition.x || 0) * 5 // Scale up percentage to grid units
                      const gridY = (imagePosition.y || 0) * 5
                      
                      // Convert grid coordinates to screen pixels relative to FIXED grid origin
                      const screenX = centerX + (gridX * scale)
                      const screenY = centerY + (gridY * scale)
                      
                      console.log('🎯 ALIGNMENT OVERLAY GRID:', {
                        percentagePos: { x: imagePosition.x, y: imagePosition.y },
                        gridPos: { x: gridX, y: gridY },
                        screenPos: { x: screenX, y: screenY }
                      })
                      
                      return {
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        transform: `translate(${screenX - centerX}px, ${screenY - centerY}px) scale(${imageScale})`,
                        transformOrigin: 'center center',
                        cursor: isDraggingImage ? 'grabbing' : 'grab',
                        opacity: 0.5,
                        border: '2px solid #007bff',
                        borderRadius: '4px',
                        boxShadow: '0 0 10px rgba(0,123,255,0.3)',
                        zIndex: 5
                      }
                    })()}
                    draggable={false}
                  />
                )}
              </>
            )
          })()}
          
          {/* Render nodes using PIXEL COORDINATES */}
          {getVisibleNodes().map(node => {
            if (!containerRef.current) return null
            
            const containerRect = containerRef.current.getBoundingClientRect()
            const centerX = containerRect.width / 2
            const centerY = containerRect.height / 2
            
            // Use pixel coordinates directly (fallback to percentage if pixel not set)
            const nodePixelX = node.xPixel !== undefined ? node.xPixel : (node.x || 0) * 500
            const nodePixelY = node.yPixel !== undefined ? node.yPixel : (node.y || 0) * 500
            
            // Apply viewport transform: center + pixel position + viewport offset, scaled
            const screenX = centerX + (nodePixelX + position.x) * scale
            const screenY = centerY + (nodePixelY + position.y) * scale
            
            return (
              <div
                key={node.id}
                className={`map-node ${node.eventType} ${selectedNode?.id === node.id ? 'selected' : ''} ${draggingNode?.id === node.id ? 'dragging' : ''}`}
                style={{
                  position: 'absolute',
                  left: `${screenX}px`,
                  top: `${screenY}px`,
                  transform: 'translate(-50%, -50%)',
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
            )
          })}
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
      
      {alignmentMode && selectedTimelineImage && (
        <div className="alignment-help">
          💡 <strong>Tip:</strong> Move the timeline scrubber to show different background images, then align the blue-bordered overlay against them. 
          This lets you position each timeline image relative to others at different time periods.
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
                <label>
                  <input
                    type="checkbox"
                    checked={editFormData.timelineEnabled}
                    onChange={(e) => handleFormChange('timelineEnabled', e.target.checked)}
                    disabled={saving}
                  />
                  Show during timeline
                </label>
              </div>
              
              {editFormData.timelineEnabled && (
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
            
            {/* Timeline image dots */}
            {interactionMode === 'edit' && timelineImages.length > 0 && (
              <div className="timeline-dots">
                {timelineImages.map((img, index) => {
                  const isActive = currentTime >= img.startTime && currentTime <= img.endTime
                  const isAligning = selectedTimelineImage?.id === img.id
                  const colors = ['#007bff', '#28a745', '#ffc107', '#dc3545', '#6f42c1', '#fd7e14', '#20c997', '#e83e8c']
                  const color = colors[index % colors.length]
                  
                  return (
                    <button
                      key={img.id}
                      className={`timeline-dot ${isActive ? 'active' : ''} ${isAligning ? 'aligning' : ''}`}
                      style={{
                        backgroundColor: color,
                        borderColor: isActive ? color : '#dee2e6'
                      }}
                      onClick={() => {
                        if (alignmentMode && selectedTimelineImage?.id === img.id) {
                          exitAlignmentMode()
                        } else {
                          enterAlignmentMode(img)
                        }
                      }}
                      title={`${img.imageName || 'Timeline Image'} (${img.startTime}-${img.endTime})${isAligning ? ' - Click to exit alignment' : ' - Click to align'}`}
                    >
                      {isAligning ? '🎯' : ''}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default MapViewer