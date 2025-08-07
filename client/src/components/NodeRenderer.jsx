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
  containerRef
}) {
  const regularNodes = nodes.filter(node => node.eventType !== 'background_map')
  const backgroundNodes = nodes.filter(node => node.eventType === 'background_map')

  const renderRegularNode = (node) => {
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
    
    // Check if this is an image node (info node with image)
    const isImageNode = node.eventType === 'standard' && node.imageUrl
    
    if (isImageNode) {
      // Render as scalable image without node styling
      return (
        <div
          key={node.id}
          className={`image-node ${selectedNode?.id === node.id ? 'selected' : ''} ${isDraggingNode && draggingNode?.id === node.id ? 'dragging' : ''}`}
          style={{
            position: 'absolute',
            left: screenPos.x - (node.width * zoom) / 2,
            top: screenPos.y - (node.height * zoom) / 2,
            width: node.width * zoom,
            height: node.height * zoom,
            cursor: interactionMode === 'edit' ? 'grab' : 'pointer',
            zIndex: isDraggingNode && draggingNode?.id === node.id ? 20 : 10
          }}
          onMouseDown={(e) => onNodeMouseDown && onNodeMouseDown(e, node)}
          onClick={(e) => onNodeClick(e, node)}
        >
          <img 
            src={node.imageUrl} 
            alt={node.title}
            className="scalable-node-image"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              borderRadius: '4px'
            }}
          />
          <div className="image-node-tooltip">
            <strong>{node.title}</strong>
            {node.description && <p>{node.description}</p>}
          </div>
        </div>
      )
    } else {
      // Render as traditional node with marker
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
          onMouseDown={(e) => onNodeMouseDown && onNodeMouseDown(e, node)}
          onClick={(e) => onNodeClick(e, node)}
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
    }
  }

  const renderBackgroundNode = (node) => {
    const screenPos = worldToScreen(node.worldX, node.worldY)
    
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
        onMouseDown={(e) => onNodeMouseDown && onNodeMouseDown(e, node)}
        onClick={(e) => onNodeClick(e, node)}
      >
        {node.imageUrl && (
          <img 
            src={node.imageUrl} 
            alt={node.title}
            className="background-map-image"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: 0.8,
              borderRadius: '8px'
            }}
          />
        )}
        <div className="background-map-label">{node.title}</div>
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