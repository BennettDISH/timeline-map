import React, { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useMapData } from '../hooks/useMapData'
import { useMapInteractions } from '../hooks/useMapInteractions'
import MapContainer from '../components/MapContainer'
import NodeEditor from '../components/NodeEditor'
import InfoPanel from '../components/InfoPanel'
import Timeline from '../components/Timeline'
import NodesListPanel from '../components/NodesListPanel'
import eventService from '../services/eventService'
import worldService from '../services/worldService'
import imageServiceBase64 from '../services/imageServiceBase64'
import '../styles/timelineStyles.scss'

function MapViewer() {
  const { mapId } = useParams()
  
  // Core data
  const { map, setMap, nodes, setNodes, loading, error, availableMaps } = useMapData(mapId)
  
  // UI state (must be defined before hooks that use them)
  const [selectedNode, setSelectedNode] = useState(null)
  const [showInfoPanel, setShowInfoPanel] = useState(false)
  const [infoPanelNode, setInfoPanelNode] = useState(null)
  const [interactionMode, setInteractionMode] = useState('view')
  const [isAddingNode, setIsAddingNode] = useState(false)
  const [nodeType, setNodeType] = useState('info')
  const [showGrid, setShowGrid] = useState(false)
  const [showNodesPanel, setShowNodesPanel] = useState(false)

  // Interactions
  const {
    camera, setCamera, zoom, setZoom,
    isDraggingViewport, isDraggingNode, draggingNode,
    saving, setSaving, saveError, setSaveError, containerReady,
    containerRef, setContainerRef, worldToScreen, screenToWorld,
    handleMouseDown, handleNodeMouseDown, handleMouseMove, handleMouseUp, handleWheel
  } = useMapInteractions(nodes, setNodes, mapId, interactionMode)
  
  // Timeline state
  const [currentTime, setCurrentTime] = useState(50)
  const [timelineSettings, setTimelineSettings] = useState({
    minTime: 0,
    maxTime: 100,
    timeUnit: 'years'
  })
  const [timelineEnabled, setTimelineEnabled] = useState(false)
  const [timelineActive, setTimelineActive] = useState(false) // Local toggle for temporarily disabling timeline

  // Helper function to get scale from node dimensions
  const getNodeScale = (node) => {
    if ((node.eventType !== 'standard' && node.eventType !== 'map_link') || !node.imageId) return 100
    
    try {
      if (node.tooltipText) {
        const dimensions = JSON.parse(node.tooltipText)
        const scale = dimensions.scale || 100
        return scale
      }
    } catch (e) {
    }
    
    return 100
  }

  // Helper function to get node type from metadata
  const getNodeType = (node) => {
    if (node.eventType === 'background_map') return 'background_map'
    if (node.eventType === 'map_link') return 'map_link'
    
    try {
      if (node.tooltipText) {
        const metadata = JSON.parse(node.tooltipText)
        return metadata.nodeType || 'info'
      }
    } catch (e) {
    }
    
    return 'info'
  }

  // Global edit state - track unsaved changes for multiple nodes
  const [unsavedChanges, setUnsavedChanges] = useState(new Map()) // nodeId -> formData
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  
  // Current edit form data (derived from unsavedChanges for selected node)
  const editFormData = selectedNode && unsavedChanges.has(selectedNode.id) 
    ? unsavedChanges.get(selectedNode.id)
    : selectedNode ? {
        title: selectedNode.title || '',
        description: selectedNode.description || '',
        content: selectedNode.content || '',
        linkToMapId: selectedNode.linkToMapId || null,
        startTime: selectedNode.startTime || 0,
        endTime: selectedNode.endTime || 100,
        timelineEnabled: selectedNode.timelineEnabled || false,
        imageId: selectedNode.imageId || null,
        nodeType: getNodeType(selectedNode),
        width: (selectedNode.eventType === 'standard' && selectedNode.imageId) || (selectedNode.eventType === 'map_link' && selectedNode.imageId) ? 100 : 
               (selectedNode.width || (selectedNode.eventType === 'background_map' ? 400 : 100)),
        height: (selectedNode.eventType === 'standard' && selectedNode.imageId) || (selectedNode.eventType === 'map_link' && selectedNode.imageId) ? 100 : 
                (selectedNode.height || (selectedNode.eventType === 'background_map' ? 300 : 100)),
        scale: getNodeScale(selectedNode),
        locked: selectedNode.locked || false
      } : null
  
  // Image management
  const [availableImages, setAvailableImages] = useState([])
  
  const timelineUpdateTimeoutRef = useRef(null)

  // Load timeline data when map loads
  useEffect(() => {
    if (map) {
      setTimelineEnabled(!!map.timelineEnabled)
      setTimelineActive(!!map.timelineEnabled) // Initially match the enabled state
      setCurrentTime(map.timelineCurrentTime || 50)
      setTimelineSettings({
        minTime: map.timelineMinTime || 0,
        maxTime: map.timelineMaxTime || 100,
        timeUnit: map.timelineTimeUnit || 'years'
      })
    }
  }, [map])

  // Load images when entering edit mode
  const loadImages = async () => {
    if (availableImages.length === 0 && map?.worldId) {
      try {
        const imagesResult = await imageServiceBase64.getImages({ worldId: map.worldId })
        setAvailableImages(imagesResult.images)
      } catch (err) {
      }
    }
  }
  
  useEffect(() => {
    if (interactionMode === 'edit') {
      loadImages()
    }
  }, [interactionMode])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isAddingNode) setIsAddingNode(false)
        if (selectedNode) setSelectedNode(null)
        if (showInfoPanel) setShowInfoPanel(false)
        if (showNodesPanel) setShowNodesPanel(false)
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isAddingNode, selectedNode, showInfoPanel, showNodesPanel])

  // Get visible nodes based on timeline
  const getVisibleNodes = () => {
    if (!timelineEnabled || !timelineActive) {
      return nodes
    }
    
    const visibleNodes = nodes.filter(node => {
      const isVisible = !node.timelineEnabled || (currentTime >= node.startTime && currentTime <= node.endTime)
      return isVisible
    })
    
    const bgMapCount = visibleNodes.filter(n => n.eventType === 'background_map').length
    return visibleNodes
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
      const nodeTitle = nodeType === 'info' ? 'Info Node' : 
                       nodeType === 'npc' ? 'NPC' :
                       nodeType === 'item' ? 'Item' :
                       nodeType === 'map_link' ? 'Map Link' :
                       nodeType === 'background_map' ? 'Background Map' : 'Info Node'
      
      const newNodeData = {
        title: `New ${nodeTitle}`,
        description: '',
        content: 'Click to edit this node',
        map_id: parseInt(mapId),
        x_position: 0,
        y_position: 0,
        x_pixel: Math.round(worldPos.x),
        y_pixel: Math.round(worldPos.y),
        event_type: (nodeType === 'info' || nodeType === 'npc' || nodeType === 'item') ? 'standard' : nodeType,
        start_time: 0,
        end_time: 100,
        timeline_enabled: false,
        image_id: null,
        tooltip_text: (nodeType === 'npc' || nodeType === 'item') ? JSON.stringify({ nodeType: nodeType }) : null
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
      
      const newWorldX = updatedNode.xPixel !== undefined && updatedNode.xPixel !== null ? updatedNode.xPixel : updatedNode.x * 1000
      const newWorldY = updatedNode.yPixel !== undefined && updatedNode.yPixel !== null ? updatedNode.yPixel : updatedNode.y * 1000
      
      // Parse dimensions for background maps and image nodes
      let width = 400, height = 300
      
      // Check if we have stored dimensions in tooltipText
      let hasDimensions = false
      if ((updatedNode.eventType === 'background_map' || 
           (updatedNode.eventType === 'standard' && updatedNode.imageId) || 
           (updatedNode.eventType === 'map_link' && updatedNode.imageId)) && updatedNode.tooltipText) {
        try {
          const dimensions = JSON.parse(updatedNode.tooltipText)
          width = dimensions.width !== undefined ? dimensions.width : (updatedNode.eventType === 'standard' ? 100 : 400)
          height = dimensions.height !== undefined ? dimensions.height : (updatedNode.eventType === 'standard' ? 100 : 300)
          hasDimensions = true
        } catch (e) {
          // Fallback to defaults if JSON parsing fails
          width = updatedNode.eventType === 'standard' ? 100 : 400
          height = updatedNode.eventType === 'standard' ? 100 : 300
        }
      }
      
      // Only set defaults if we don't have stored dimensions
      if (!hasDimensions && (updatedNode.eventType === 'standard' || updatedNode.eventType === 'map_link') && updatedNode.imageId) {
        width = 100
        height = 100
      }
      
      // If image was added but imageUrl is missing, fetch it from availableImages
      let imageUrl = updatedNode.imageUrl
      if (updatedNode.imageId && !imageUrl && availableImages.length > 0) {
        const selectedImage = availableImages.find(img => img.id === updatedNode.imageId)
        imageUrl = selectedImage ? selectedImage.url : null
      }
      
      const processedUpdatedNode = {
        ...updatedNode,
        worldX: newWorldX,
        worldY: newWorldY,
        width,
        height,
        imageUrl
      }
      
      setNodes(nodes.map(n => n.id === node.id ? processedUpdatedNode : n))
      
      if (selectedNode && selectedNode.id === node.id) {
        setSelectedNode(processedUpdatedNode)
      }
    } catch (err) {
      setSaveError(err.message || 'Failed to update node')
    } finally {
      setSaving(false)
    }
  }

  const handleNodeDelete = async (node) => {
    if (!window.confirm('Delete this node?')) return
    
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
      setSaveError(err.message || 'Failed to delete node')
    } finally {
      setSaving(false)
    }
  }

  const handleTimelineChange = (newTime) => {
    const timeValue = parseInt(newTime)
    setCurrentTime(timeValue)
    
    clearTimeout(timelineUpdateTimeoutRef.current)
    timelineUpdateTimeoutRef.current = setTimeout(async () => {
      try {
        await worldService.updateTimelinePosition(map.worldId, timeValue)
      } catch (err) {
      }
    }, 500)
  }

  // Node click handler
  const handleNodeClick = (e, node) => {
    e.stopPropagation()
    if (interactionMode === 'view') {
      setInfoPanelNode(node)
      setShowInfoPanel(true)
    } else {
      console.log('🎯 NODE CLICK - Setting editFormData for node:', {
        nodeId: node.id,
        eventType: node.eventType,
        imageId: node.imageId,
        currentDimensions: { width: node.width, height: node.height },
        tooltipText: node.tooltipText,
        scale: getNodeScale(node),
        lockedFromDB: node.locked,
        allNodeData: node
      })
      setSelectedNode(node)
      // editFormData will be automatically derived from unsavedChanges or selectedNode
    }
  }

  const handleInfoPanelEditNode = (node) => {
    setSelectedNode(node)
    setShowInfoPanel(false)
    // editFormData will be automatically derived from unsavedChanges or selectedNode
  }

  const handleFieldChange = (field, value) => {
    if (!selectedNode) return
    
    // Update unsaved changes for this node
    const newUnsavedChanges = new Map(unsavedChanges)
    const currentData = newUnsavedChanges.get(selectedNode.id) || editFormData
    newUnsavedChanges.set(selectedNode.id, { ...currentData, [field]: value })
    setUnsavedChanges(newUnsavedChanges)
    setHasUnsavedChanges(newUnsavedChanges.size > 0)
    
    // Update dimensions in real-time for visual feedback
    if ((field === 'width' || field === 'height') && selectedNode) {
      setNodes(nodes.map(n => n.id === selectedNode.id ? {
        ...n,
        [field]: value
      } : n))
    }
    
    // Handle scale changes for info and map_link nodes with images
    if (field === 'scale' && selectedNode && (editFormData.nodeType === 'info' || editFormData.nodeType === 'npc' || editFormData.nodeType === 'item' || editFormData.nodeType === 'map_link') && editFormData.imageId) {
      // Use fixed base dimensions for consistent scaling
      const baseWidth = 100
      const baseHeight = 100
      const newWidth = Math.round(baseWidth * value / 100)
      const newHeight = Math.round(baseHeight * value / 100)
      
      setNodes(nodes.map(n => n.id === selectedNode.id ? {
        ...n,
        width: newWidth,
        height: newHeight
      } : n))
    }
    
    // Update image immediately when imageId changes
    if (field === 'imageId' && selectedNode) {
      // Find the image URL from availableImages
      const selectedImage = availableImages.find(img => img.id === value)
      const imageUrl = selectedImage ? selectedImage.url : null
      
      setNodes(nodes.map(n => n.id === selectedNode.id ? {
        ...n,
        imageId: value,
        imageUrl: imageUrl
      } : n))
    }
  }

  // New global save function that saves all unsaved changes
  const handleSaveAllChanges = async () => {
    if (unsavedChanges.size === 0) return
    
    setSaving(true)
    setSaveError('')
    
    try {
      // Save all unsaved nodes
      for (const [nodeId, formData] of unsavedChanges) {
        const node = nodes.find(n => n.id === parseInt(nodeId))
        if (!node) continue
        
        const updateData = {
          title: formData.title,
          description: formData.description,
          content: formData.content,
          image_id: formData.imageId,
          link_to_map_id: formData.nodeType === 'map_link' ? formData.linkToMapId : null,
          start_time: formData.startTime,
          end_time: formData.endTime,
          timeline_enabled: formData.timelineEnabled,
          event_type: formData.nodeType === 'background_map' ? 'background_map' : 
                      formData.nodeType === 'map_link' ? 'map_link' : 'standard',
          locked: formData.locked || false
        }

        console.log('🚀 CLIENT SAVING NODE:', {
          nodeId: nodeId,
          formData: formData,
          updateData: updateData
        })

        // Handle dimensions for background maps and image nodes, plus connections for all nodes
        if (formData.nodeType === 'background_map' || 
            (formData.nodeType === 'info' && formData.imageId) ||
            (formData.nodeType === 'npc' && formData.imageId) ||
            (formData.nodeType === 'item' && formData.imageId) ||
            (formData.nodeType === 'map_link' && formData.imageId) ||
            formData.connections) {
          let finalWidth = formData.width
          let finalHeight = formData.height
          
          if ((formData.nodeType === 'info' || formData.nodeType === 'npc' || formData.nodeType === 'item' || formData.nodeType === 'map_link') && formData.imageId && formData.scale) {
            const baseWidth = 100
            const baseHeight = 100
            finalWidth = Math.round(baseWidth * formData.scale / 100)
            finalHeight = Math.round(baseHeight * formData.scale / 100)
          }
          
          const tooltipData = {
            width: finalWidth,
            height: finalHeight,
            scale: (formData.nodeType === 'info' || formData.nodeType === 'npc' || formData.nodeType === 'item' || formData.nodeType === 'map_link') ? formData.scale : undefined,
            baseWidth: (formData.nodeType === 'info' || formData.nodeType === 'npc' || formData.nodeType === 'item' || formData.nodeType === 'map_link') ? 100 : undefined,
            baseHeight: (formData.nodeType === 'info' || formData.nodeType === 'npc' || formData.nodeType === 'item' || formData.nodeType === 'map_link') ? 100 : undefined,
            nodeType: formData.nodeType, // Store the specific node type
            connections: formData.connections || [] // Store connections
          }
          
          updateData.tooltip_text = JSON.stringify(tooltipData)
        }
        
        await handleNodeUpdate(node, updateData)
      }
      
      // Clear all unsaved changes after successful save
      setUnsavedChanges(new Map())
      setHasUnsavedChanges(false)
      setSelectedNode(null)
      
    } catch (error) {
      setSaveError(error.message || 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  // Legacy function - keeping for now but will remove individual save buttons
  const handleEditorSave = async () => {
    const updateData = {
      title: editFormData.title,
      description: editFormData.description,
      content: editFormData.content,
      image_id: editFormData.imageId,
      link_to_map_id: editFormData.nodeType === 'map_link' ? editFormData.linkToMapId : null,
      start_time: editFormData.startTime,
      end_time: editFormData.endTime,
      timeline_enabled: editFormData.timelineEnabled,
      event_type: editFormData.nodeType === 'background_map' ? 'background_map' : 
                  editFormData.nodeType === 'map_link' ? 'map_link' : 'standard',
      locked: editFormData.locked || false
    }
    
    console.log('🚀 CLIENT SENDING UPDATE:', {
      nodeId: selectedNode.id,
      editFormData: editFormData,
      updateData: updateData,
      lockedValue: editFormData.locked
    })
    
    // Store dimensions temporarily in tooltip_text as JSON for background maps and image nodes
    if (editFormData.nodeType === 'background_map' || 
        (editFormData.nodeType === 'info' && editFormData.imageId) ||
        (editFormData.nodeType === 'map_link' && editFormData.imageId)) {
      let finalWidth = editFormData.width
      let finalHeight = editFormData.height
      
      // For info and map_link nodes with images, apply the scale to get final dimensions
      if ((editFormData.nodeType === 'info' || editFormData.nodeType === 'map_link') && editFormData.imageId && editFormData.scale) {
        // Use fixed base dimensions for scaling to prevent compounding
        const baseWidth = 100  // Fixed base width
        const baseHeight = 100 // Fixed base height
        finalWidth = Math.round(baseWidth * editFormData.scale / 100)
        finalHeight = Math.round(baseHeight * editFormData.scale / 100)
      }
      
      const tooltipData = {
        width: finalWidth,
        height: finalHeight,
        scale: (editFormData.nodeType === 'info' || editFormData.nodeType === 'map_link') ? editFormData.scale : undefined,
        baseWidth: (editFormData.nodeType === 'info' || editFormData.nodeType === 'map_link') ? 100 : undefined,
        baseHeight: (editFormData.nodeType === 'info' || editFormData.nodeType === 'map_link') ? 100 : undefined
      }
      
      updateData.tooltip_text = JSON.stringify(tooltipData)
    }
    
    await handleNodeUpdate(selectedNode, updateData)
    setSelectedNode(null)
    setHasUnsavedChanges(false)
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
          
          <label className="mode-toggle" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            userSelect: 'none'
          }}>
            <span style={{ fontSize: '14px' }}>View</span>
            <div style={{
              position: 'relative',
              width: '50px',
              height: '24px',
              background: interactionMode === 'edit' ? '#4CAF50' : '#ccc',
              borderRadius: '12px',
              transition: 'background-color 0.3s'
            }}>
              <input
                type="checkbox"
                checked={interactionMode === 'edit'}
                onChange={() => setInteractionMode(interactionMode === 'view' ? 'edit' : 'view')}
                style={{ opacity: 0, position: 'absolute' }}
              />
              <div style={{
                position: 'absolute',
                top: '2px',
                left: interactionMode === 'edit' ? '26px' : '2px',
                width: '20px',
                height: '20px',
                background: 'white',
                borderRadius: '50%',
                transition: 'left 0.3s',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
              }}></div>
            </div>
            <span style={{ fontSize: '14px' }}>Edit</span>
          </label>
          
          <button 
            onClick={() => setShowGrid(!showGrid)}
            className={`grid-toggle ${showGrid ? 'active' : ''}`}
            style={{
              padding: '6px 12px',
              border: 'none',
              borderRadius: '4px',
              background: showGrid ? '#4CAF50' : '#f0f0f0',
              color: showGrid ? 'white' : '#333',
              cursor: 'pointer',
              fontSize: '12px',
              transition: 'all 0.2s'
            }}
          >
            📐 Grid
          </button>

          {/* Global Save All Changes button - only show in edit mode when there are unsaved changes */}
          {interactionMode === 'edit' && hasUnsavedChanges && (
            <button 
              onClick={handleSaveAllChanges}
              disabled={saving}
              style={{
                padding: '8px 16px',
                border: 'none',
                borderRadius: '4px',
                background: '#4CAF50',
                color: 'white',
                cursor: saving ? 'wait' : 'pointer',
                fontSize: '14px',
                fontWeight: 'bold',
                transition: 'all 0.2s',
                opacity: saving ? 0.7 : 1
              }}
            >
              {saving ? '💾 Saving...' : `💾 Save All Changes (${unsavedChanges.size})`}
            </button>
          )}
          
          <button 
            onClick={() => setShowNodesPanel(!showNodesPanel)}
            className={`nodes-list-toggle ${showNodesPanel ? 'active' : ''}`}
            style={{
              padding: '6px 12px',
              border: 'none',
              borderRadius: '4px',
              background: showNodesPanel ? '#4CAF50' : '#f0f0f0',
              color: showNodesPanel ? 'white' : '#333',
              cursor: 'pointer',
              fontSize: '12px',
              transition: 'all 0.2s'
            }}
          >
            📋 View All Nodes ({nodes.length})
          </button>
          
          {!timelineEnabled && (
            <button
              onClick={async () => {
                try {
                  await worldService.updateWorldTimeline(map.worldId, { 
                    timeline_enabled: true,
                    timeline_min_time: 0,
                    timeline_max_time: 100,
                    timeline_current_time: 50,
                    timeline_time_unit: 'years'
                  })
                  
                  setTimelineEnabled(true)
                  setTimelineActive(true)
                  setTimelineSettings({
                    minTime: 0,
                    maxTime: 100,
                    timeUnit: 'years'
                  })
                  setCurrentTime(50)
                  
                  setMap(prev => ({
                    ...prev,
                    timelineEnabled: true,
                    timelineMinTime: 0,
                    timelineMaxTime: 100,
                    timelineCurrentTime: 50,
                    timelineTimeUnit: 'years'
                  }))
                } catch (err) {
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
      
      {/* Map Container */}
      <MapContainer
        containerRef={setContainerRef}
        isAddingNode={isAddingNode}
        isDraggingViewport={isDraggingViewport}
        nodeType={nodeType}
        interactionMode={interactionMode}
        saveError={saveError}
        visibleNodes={getVisibleNodes()}
        worldToScreen={worldToScreen}
        zoom={zoom}
        selectedNode={selectedNode}
        isDraggingNode={isDraggingNode}
        draggingNode={draggingNode}
        showGrid={showGrid}
        camera={camera}
        containerReady={containerReady}
        onMouseDown={(e) => isAddingNode ? handleMapClick(e) : handleMouseDown(e)}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onNodeClick={handleNodeClick}
        onNodeMouseDown={handleNodeMouseDown}
        unsavedChanges={unsavedChanges}
      />
      
      {/* Info Panel */}
      <InfoPanel
        showInfoPanel={showInfoPanel}
        infoPanelNode={infoPanelNode}
        interactionMode={interactionMode}
        onClose={() => setShowInfoPanel(false)}
        onEditNode={handleInfoPanelEditNode}
      />
      
      {/* Nodes List Panel */}
      <NodesListPanel
        showNodesPanel={showNodesPanel}
        nodes={nodes}
        selectedNode={selectedNode}
        interactionMode={interactionMode}
        onClose={() => setShowNodesPanel(false)}
        onNodeSelect={(node) => setSelectedNode(node)}
        onNodeClick={handleNodeClick}
      />
      
      {/* Node Editor */}
      {interactionMode === 'edit' && (
        <NodeEditor
          selectedNode={selectedNode}
          editFormData={editFormData}
          timelineEnabled={timelineEnabled}
          timelineSettings={timelineSettings}
          availableMaps={availableMaps}
          availableImages={availableImages}
          nodes={nodes}
          onCancel={() => setSelectedNode(null)}
          onDelete={() => handleNodeDelete(selectedNode)}
          handleFieldChange={handleFieldChange}
          hasUnsavedChanges={hasUnsavedChanges}
        />
      )}
      
      {/* Timeline at bottom */}
      <Timeline
        timelineEnabled={timelineEnabled}
        timelineActive={timelineActive}
        currentTime={currentTime}
        timelineSettings={timelineSettings}
        onTimelineChange={handleTimelineChange}
        onToggleActive={() => setTimelineActive(!timelineActive)}
      />
    </div>
  )
}

export default MapViewer