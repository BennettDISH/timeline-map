import React from 'react'
import NodeRenderer from './NodeRenderer'

function MapContainer({ 
  containerRef,
  isAddingNode,
  isDraggingViewport,
  nodeType,
  interactionMode,
  saveError,
  visibleNodes,
  worldToScreen,
  zoom,
  selectedNode,
  isDraggingNode,
  draggingNode,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onWheel,
  onNodeClick
}) {
  return (
    <div 
      ref={containerRef}
      className={`map-container ${isAddingNode ? 'adding-node' : ''} ${isDraggingViewport ? 'dragging' : ''}`}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onWheel={onWheel}
      style={{
        position: 'relative',
        flex: 1,
        overflow: 'hidden',
        background: '#1a1a1a',
        cursor: isDraggingViewport ? 'grabbing' : isAddingNode ? 'crosshair' : 'grab'
      }}
    >
      <NodeRenderer
        nodes={visibleNodes}
        worldToScreen={worldToScreen}
        zoom={zoom}
        interactionMode={interactionMode}
        selectedNode={selectedNode}
        isDraggingNode={isDraggingNode}
        draggingNode={draggingNode}
        onNodeClick={onNodeClick}
        containerRef={containerRef}
      />
      
      {isAddingNode && (
        <div className="adding-node-help">
          <p>Click anywhere to place a new {
            nodeType === 'info' ? 'info' : 
            nodeType === 'map_link' ? 'map link' :
            nodeType === 'background_map' ? 'background map' : 'info'
          } node</p>
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
  )
}

export default MapContainer