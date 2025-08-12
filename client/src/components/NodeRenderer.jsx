import React from 'react'

function NodeRenderer({ 
  nodes, 
  worldToScreen, 
  zoom,
  interactionMode,
  selectedNode,
  isDraggingNode,
  draggingNode,
  onNodeClick,
  onNodeMouseDown,
  containerRef,
  containerReady,
  unsavedChanges
}) {
  
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
  
  // Helper function to get node icon
  const getNodeIcon = (node) => {
    const nodeType = getNodeType(node)
    if (nodeType === 'npc') return '👤'
    if (nodeType === 'item') return '⚔️'
    if (nodeType === 'text') return '📝'
    if (nodeType === 'map_link') return '🗺️'
    return 'ℹ️' // info icon
  }
  // Only skip rendering if container explicitly has zero dimensions
  // This prevents the "nothing shows" issue while still preventing bad positioning
  if (containerRef && containerRef.current) {
    const rect = containerRef.current.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      return null
    }
  }

  const regularNodes = nodes.filter(node => node.eventType !== 'background_map')
  const backgroundNodes = nodes.filter(node => node.eventType === 'background_map')

  const renderRegularNode = (node) => {
    const screenPos = worldToScreen(node.worldX, node.worldY)
    const hasUnsavedChanges = unsavedChanges && unsavedChanges.has(node.id)
    
    // DEBUG: Check node dragging visibility
    if (isDraggingNode && draggingNode?.id === node.id) {
      // Node is being dragged
    }
    
    // DEBUG: Check for coordinate issues
    if (screenPos.x > 10000 || screenPos.y > 10000) {
      // Coordinates seem corrupted
    }
    
    // Check node type from metadata
    const getNodeType = (node) => {
      try {
        if (node.tooltipText) {
          const metadata = JSON.parse(node.tooltipText)
          return metadata.nodeType || 'info'
        }
      } catch (e) {}
      return 'info'
    }

    const nodeType = getNodeType(node)
    const isImageNode = (node.eventType === 'standard' || node.eventType === 'map_link') && node.imageUrl
    const isTextNode = nodeType === 'text'
    
    if (isTextNode) {
      // Get text styling properties from metadata
      const getTextProps = (node) => {
        try {
          if (node.tooltipText) {
            const metadata = JSON.parse(node.tooltipText)
            return {
              fontSize: metadata.fontSize || 16,
              textColor: metadata.textColor || 'white',
              width: metadata.width || 200
            }
          }
        } catch (e) {}
        return { fontSize: 16, textColor: 'white', width: 200 }
      }
      
      const textProps = getTextProps(node)
      
      // Render as text label
      return (
        <div
          key={node.id}
          data-node-id={node.id}
          className={`text-node ${selectedNode?.id === node.id ? 'selected' : ''} ${isDraggingNode && draggingNode?.id === node.id ? 'dragging' : ''}`}
          style={{
            position: 'absolute',
            left: screenPos.x,
            top: screenPos.y,
            transform: 'translate(-50%, -50%)',
            cursor: interactionMode === 'edit' ? 'grab' : 'pointer',
            zIndex: isDraggingNode && draggingNode?.id === node.id ? 20 : 10,
            width: textProps.width * zoom,
            fontSize: textProps.fontSize * zoom,
            color: textProps.textColor,
            textAlign: 'center',
            fontWeight: 'bold',
            textShadow: textProps.textColor === 'white' ? '2px 2px 4px rgba(0,0,0,0.8)' : '2px 2px 4px rgba(255,255,255,0.8)',
            userSelect: 'none',
            pointerEvents: 'auto',
            wordWrap: 'break-word',
            lineHeight: '1.2'
          }}
          onMouseDown={(e) => {
            if (interactionMode === 'edit') {
              onNodeMouseDown && onNodeMouseDown(e, node)
            }
          }}
          onClick={(e) => onNodeClick(e, node)}
        >
          {node.title}
          {hasUnsavedChanges && (
            <div className="unsaved-indicator" style={{
              position: 'absolute',
              top: '-5px',
              right: '-5px',
              width: '12px',
              height: '12px',
              backgroundColor: '#ff6b35',
              borderRadius: '50%',
              border: '2px solid white',
              zIndex: 30
            }} />
          )}
        </div>
      )
    } else if (isImageNode) {
      // Render as scalable image without node styling
      return (
        <div
          key={node.id}
          data-node-id={node.id}
          className={`image-node ${selectedNode?.id === node.id ? 'selected' : ''} ${isDraggingNode && draggingNode?.id === node.id ? 'dragging' : ''}`}
          style={{
            position: 'absolute',
            left: screenPos.x - (node.width * zoom) / 2,
            top: screenPos.y - (node.height * zoom) / 2,
            width: node.width * zoom,
            height: node.height * zoom,
            cursor: interactionMode === 'edit' ? 'grab' : 'pointer',
            zIndex: isDraggingNode && draggingNode?.id === node.id ? 20 : 10,
            pointerEvents: interactionMode === 'view' ? 'auto' : 'auto'
          }}
          onMouseDown={(e) => {
            if (interactionMode === 'edit') {
              onNodeMouseDown && onNodeMouseDown(e, node)
            }
            // In view mode, don't prevent default to allow map panning
          }}
          onClick={(e) => onNodeClick(e, node)}
        >
          <img 
            src={node.imageUrl} 
            alt={node.title}
            className="scalable-node-image"
            draggable={false}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              borderRadius: '4px',
              userSelect: 'none',
              pointerEvents: 'none'
            }}
          />
          <div className="image-node-tooltip">
            <strong>{node.title}</strong>
            {node.description && <p>{node.description}</p>}
          </div>
          {hasUnsavedChanges && (
            <div className="unsaved-indicator" style={{
              position: 'absolute',
              top: '-5px',
              right: '-5px',
              width: '12px',
              height: '12px',
              backgroundColor: '#ff6b35',
              borderRadius: '50%',
              border: '2px solid white',
              zIndex: 30
            }} />
          )}
        </div>
      )
    } else {
      // Render as traditional node with marker
      return (
        <div
          key={node.id}
          data-node-id={node.id}
          className={`map-node ${node.eventType} ${selectedNode?.id === node.id ? 'selected' : ''} ${isDraggingNode && draggingNode?.id === node.id ? 'dragging' : ''}`}
          style={{
            position: 'absolute',
            left: screenPos.x,
            top: screenPos.y,
            transform: 'translate(-50%, -50%)',
            cursor: interactionMode === 'edit' ? 'grab' : 'pointer',
            zIndex: isDraggingNode && draggingNode?.id === node.id ? 20 : 10
          }}
          onMouseDown={(e) => onNodeMouseDown && onNodeMouseDown(e, node)}
          onClick={(e) => onNodeClick(e, node)}
        >
          <div className="node-marker">
            {getNodeIcon(node)}
          </div>
          
          <div className="node-tooltip">
            <strong>{node.title}</strong>
            {node.description && <p>{node.description}</p>}
          </div>
          {hasUnsavedChanges && (
            <div className="unsaved-indicator" style={{
              position: 'absolute',
              top: '-8px',
              right: '-8px',
              width: '12px',
              height: '12px',
              backgroundColor: '#ff6b35',
              borderRadius: '50%',
              border: '2px solid white',
              zIndex: 30
            }} />
          )}
        </div>
      )
    }
  }

  const renderBackgroundNode = (node) => {
    const screenPos = worldToScreen(node.worldX, node.worldY)
    const hasUnsavedChanges = unsavedChanges && unsavedChanges.has(node.id)
    
    return (
      <div
        key={`bg-${node.id}`}
        className={`background-map-node ${selectedNode?.id === node.id ? 'selected' : ''} ${isDraggingNode && draggingNode?.id === node.id ? 'dragging' : ''}`}
        style={{
          position: 'absolute',
          left: screenPos.x - (node.width * zoom) / 2,
          top: screenPos.y - (node.height * zoom) / 2,
          width: node.width * zoom,
          height: node.height * zoom,
          cursor: interactionMode === 'edit' ? 'grab' : 'pointer',
          zIndex: isDraggingNode && draggingNode?.id === node.id ? 20 : 1
        }}
        onMouseDown={(e) => {
          if (interactionMode === 'edit') {
            onNodeMouseDown && onNodeMouseDown(e, node)
          }
          // In view mode, don't prevent default to allow map panning
        }}
        onClick={(e) => onNodeClick(e, node)}
      >
        {node.imageUrl && (
          <img 
            src={node.imageUrl} 
            alt={node.title}
            className="background-map-image"
            draggable={false}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: 0.8,
              borderRadius: '8px',
              userSelect: 'none',
              pointerEvents: 'none'
            }}
          />
        )}
        <div className="background-map-label">{node.title}</div>
        {hasUnsavedChanges && (
          <div className="unsaved-indicator" style={{
            position: 'absolute',
            top: '5px',
            right: '5px',
            width: '12px',
            height: '12px',
            backgroundColor: '#ff6b35',
            borderRadius: '50%',
            border: '2px solid white',
            zIndex: 30
          }} />
        )}
      </div>
    )
  }

  return (
    <>
      {/* Background Map Nodes (render behind regular nodes) */}
      {backgroundNodes.map(renderBackgroundNode)}
      
      {/* Regular Nodes */}
      {regularNodes.map(renderRegularNode)}
    </>
  )
}

export default NodeRenderer