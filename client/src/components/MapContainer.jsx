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
  showGrid,
  camera,
  containerReady,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onWheel,
  onNodeClick,
  onNodeMouseDown
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
      {/* Grid overlay */}
      {showGrid && (
        <div 
          className="grid-overlay"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            pointerEvents: 'none',
            backgroundImage: `
              linear-gradient(to right, rgba(255,255,255,0.1) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(255,255,255,0.1) 1px, transparent 1px)
            `,
            backgroundSize: `${50 * zoom}px ${50 * zoom}px`,
            backgroundPosition: `${(-(camera.x * zoom) % (50 * zoom))}px ${(-(camera.y * zoom) % (50 * zoom))}px`,
            zIndex: 1
          }}
        />
      )}
      
      <NodeRenderer
        nodes={visibleNodes}
        worldToScreen={worldToScreen}
        zoom={zoom}
        interactionMode={interactionMode}
        selectedNode={selectedNode}
        isDraggingNode={isDraggingNode}
        draggingNode={draggingNode}
        onNodeClick={onNodeClick}
        onNodeMouseDown={onNodeMouseDown}
        containerRef={containerRef}
        containerReady={containerReady}
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
        <div className="edit-mode-help" style={{ 
          userSelect: 'none', 
          pointerEvents: 'none',
          position: 'absolute',
          top: '10px',
          left: '10px',
          background: 'rgba(0,0,0,0.7)',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '4px',
          fontSize: '12px',
          zIndex: 1000
        }}>
          <small>💡 Drag nodes to move them, click to edit. Drag empty space to pan.</small>
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