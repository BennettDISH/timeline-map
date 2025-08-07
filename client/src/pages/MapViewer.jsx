import React, { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useMapData } from '../hooks/useMapData'
import { useMapInteractions } from '../hooks/useMapInteractions'
import MapContainer from '../components/MapContainer'
import NodeEditor from '../components/NodeEditor'
import InfoPanel from '../components/InfoPanel'
import Timeline from '../components/Timeline'
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

  // Interactions
  const {
    camera, setCamera, zoom, setZoom,
    isDraggingViewport, isDraggingNode, draggingNode,
    saving, setSaving, saveError, setSaveError,
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

  // Edit form state
  const [editFormData, setEditFormData] = useState({
    title: '',
    description: '',
    content: '',
    linkToMapId: null,
    startTime: 0,
    endTime: 100,
    timelineEnabled: false,
    imageId: null,
    nodeType: 'info',
    width: 100,
    height: 100
  })
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  
  // Image management
  const [availableImages, setAvailableImages] = useState([])
  
  const timelineUpdateTimeoutRef = useRef(null)

  // Load timeline data when map loads
  useEffect(() => {
    if (map?.timelineEnabled) {
      setTimelineEnabled(true)
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
        console.error('Failed to load images:', err)
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
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isAddingNode, selectedNode, showInfoPanel])

  // Get visible nodes based on timeline
  const getVisibleNodes = () => {
    if (!timelineEnabled) {
      console.log('🔵 Timeline disabled, showing all', nodes.length, 'nodes')
      return nodes
    }
    
    const visibleNodes = nodes.filter(node => {
      const isVisible = !node.timelineEnabled || (currentTime >= node.startTime && currentTime <= node.endTime)
      
      // Debug background map nodes specifically
      if (node.eventType === 'background_map') {
        console.log('🖼️ Background map timeline check:', {
          nodeId: node.id,
          title: node.title,
          timelineEnabled: node.timelineEnabled,
          startTime: node.startTime,
          endTime: node.endTime,
          currentTime,
          isVisible
        })
      }
      
      return isVisible
    })
    
    const bgMapCount = visibleNodes.filter(n => n.eventType === 'background_map').length
    console.log(`📊 Timeline filter result: ${visibleNodes.length} of ${nodes.length} nodes visible (${bgMapCount} background maps)`)
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
        event_type: nodeType === 'info' ? 'standard' : nodeType,
        start_time: 0,
        end_time: 100,
        timeline_enabled: false,
        image_id: null
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
      
      const newWorldX = updatedNode.xPixel !== undefined && updatedNode.xPixel !== null ? updatedNode.xPixel : updatedNode.x * 1000
      const newWorldY = updatedNode.yPixel !== undefined && updatedNode.yPixel !== null ? updatedNode.yPixel : updatedNode.y * 1000
      
      // Parse dimensions for background maps and image nodes
      let width = 400, height = 300
      if ((updatedNode.eventType === 'background_map' || (updatedNode.eventType === 'standard' && updatedNode.imageUrl)) && updatedNode.tooltipText) {
        try {
          const dimensions = JSON.parse(updatedNode.tooltipText)
          width = dimensions.width || (updatedNode.eventType === 'standard' ? 100 : 400)
          height = dimensions.height || (updatedNode.eventType === 'standard' ? 100 : 300)
        } catch (e) {
          // Fallback to defaults if JSON parsing fails
          width = updatedNode.eventType === 'standard' ? 100 : 400
          height = updatedNode.eventType === 'standard' ? 100 : 300
        }
      } else if (updatedNode.eventType === 'standard' && updatedNode.imageUrl) {
        // Default size for image nodes
        width = 100
        height = 100
      }
      
      const processedUpdatedNode = {
        ...updatedNode,
        worldX: newWorldX,
        worldY: newWorldY,
        width,
        height
      }
      
      console.log('🔄 NODE UPDATE COMPLETE:', {
        originalNode: node,
        updatedFromAPI: updatedNode,
        processedNode: processedUpdatedNode,
        hasImage: !!processedUpdatedNode.imageUrl
      })
      
      setNodes(nodes.map(n => n.id === node.id ? processedUpdatedNode : n))
      
      if (selectedNode && selectedNode.id === node.id) {
        setSelectedNode(processedUpdatedNode)
      }
    } catch (err) {
      console.error('Failed to update node:', err)
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
      console.error('Failed to delete node:', err)
      setSaveError(err.message || 'Failed to delete node')
    } finally {
      setSaving(false)
    }
  }

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

  // Node click handler
  const handleNodeClick = (e, node) => {
    e.stopPropagation()
    if (interactionMode === 'view') {
      setInfoPanelNode(node)
      setShowInfoPanel(true)
    } else {
      setSelectedNode(node)
      setEditFormData({
        title: node.title || '',
        description: node.description || '',
        content: node.content || '',
        linkToMapId: node.linkToMapId || null,
        startTime: node.startTime || 0,
        endTime: node.endTime || 100,
        timelineEnabled: node.timelineEnabled || false,
        imageId: node.imageId || null,
        nodeType: node.eventType === 'background_map' ? 'background_map' : 
                 node.eventType === 'map_link' ? 'map_link' : 'info',
        width: node.width || (node.eventType === 'background_map' ? 400 : 100),
        height: node.height || (node.eventType === 'background_map' ? 300 : 100)
      })
      setHasUnsavedChanges(false)
    }
  }

  const handleInfoPanelEditNode = (node) => {
    setSelectedNode(node)
    setEditFormData({
      title: node.title || '',
      description: node.description || '',
      content: node.content || '',
      linkToMapId: node.linkToMapId || null,
      startTime: node.startTime || 0,
      endTime: node.endTime || 100,
      timelineEnabled: node.timelineEnabled || false,
      imageId: node.imageId || null,
      nodeType: node.eventType === 'background_map' ? 'background_map' : 
               node.eventType === 'map_link' ? 'map_link' : 'info',
      width: node.width || (node.eventType === 'background_map' ? 400 : 100),
      height: node.height || (node.eventType === 'background_map' ? 300 : 100)
    })
    setHasUnsavedChanges(false)
    setShowInfoPanel(false)
  }

  const handleFieldChange = (field, value) => {
    setEditFormData({ ...editFormData, [field]: value })
    setHasUnsavedChanges(true)
    
    // Update dimensions in real-time for visual feedback
    if ((field === 'width' || field === 'height') && selectedNode) {
      setNodes(nodes.map(n => n.id === selectedNode.id ? {
        ...n,
        [field]: value
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
                  editFormData.nodeType === 'map_link' ? 'map_link' : 'standard'
    }
    
    // Store dimensions temporarily in tooltip_text as JSON for background maps and image nodes
    if (editFormData.nodeType === 'background_map' || (editFormData.nodeType === 'info' && editFormData.imageId)) {
      updateData.tooltip_text = JSON.stringify({
        width: editFormData.width,
        height: editFormData.height
      })
    }
    
    console.log('Sending update data:', updateData)
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
          
          {!timelineEnabled && (
            <button
              onClick={async () => {
                try {
                  await worldService.updateWorld(map.worldId, { 
                    timeline_enabled: true,
                    timeline_min_time: 0,
                    timeline_max_time: 100,
                    timeline_current_time: 50,
                    timeline_time_unit: 'years'
                  })
                  
                  setTimelineEnabled(true)
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
        onMouseDown={(e) => isAddingNode ? handleMapClick(e) : handleMouseDown(e)}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onNodeClick={handleNodeClick}
        onNodeMouseDown={handleNodeMouseDown}
      />
      
      {/* Info Panel */}
      <InfoPanel
        showInfoPanel={showInfoPanel}
        infoPanelNode={infoPanelNode}
        interactionMode={interactionMode}
        onClose={() => setShowInfoPanel(false)}
        onEditNode={handleInfoPanelEditNode}
      />
      
      {/* Node Editor */}
      {interactionMode === 'edit' && (
        <NodeEditor
          selectedNode={selectedNode}
          editFormData={editFormData}
          setEditFormData={setEditFormData}
          hasUnsavedChanges={hasUnsavedChanges}
          setHasUnsavedChanges={setHasUnsavedChanges}
          timelineEnabled={timelineEnabled}
          timelineSettings={timelineSettings}
          availableMaps={availableMaps}
          availableImages={availableImages}
          saving={saving}
          onSave={handleEditorSave}
          onCancel={() => setSelectedNode(null)}
          onDelete={() => handleNodeDelete(selectedNode)}
          handleFieldChange={handleFieldChange}
        />
      )}
      
      {/* Timeline at bottom */}
      <Timeline
        timelineEnabled={timelineEnabled}
        currentTime={currentTime}
        timelineSettings={timelineSettings}
        onTimelineChange={handleTimelineChange}
      />
    </div>
  )
}

export default MapViewer