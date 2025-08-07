import React from 'react'

function NodesListPanel({ 
  showNodesPanel, 
  nodes, 
  selectedNode, 
  interactionMode,
  onClose, 
  onNodeSelect,
  onNodeClick 
}) {
  if (!showNodesPanel) return null

  const sortedNodes = [...nodes].sort((a, b) => a.title?.localeCompare(b.title) || 0)

  return (
    <div className="nodes-list-panel">
      <div className="nodes-panel-header">
        <h3>All Nodes ({nodes.length})</h3>
        <button onClick={onClose} className="close-button">
          ✕
        </button>
      </div>
      
      <div className="nodes-panel-content">
        {sortedNodes.length === 0 ? (
          <div className="no-nodes">
            <p>No nodes in this map yet.</p>
            {interactionMode === 'edit' && (
              <p><small>Switch to edit mode and click "Add Node" to create your first node.</small></p>
            )}
          </div>
        ) : (
          <div className="nodes-list">
            {sortedNodes.map(node => (
              <div 
                key={node.id} 
                className={`node-item ${selectedNode?.id === node.id ? 'selected' : ''}`}
                onClick={() => onNodeClick && onNodeClick({stopPropagation: () => {}}, node)}
              >
                <div className="node-item-header">
                  <div className="node-type-icon">
                    {node.eventType === 'map_link' ? '🗺️' : 
                     node.eventType === 'background_map' ? '🖼️' : 
                     node.imageUrl ? '📷' : 'ℹ️'}
                  </div>
                  <div className="node-title">
                    {node.title || 'Untitled Node'}
                  </div>
                </div>
                
                {node.description && (
                  <div className="node-description">
                    {node.description}
                  </div>
                )}
                
                <div className="node-meta">
                  <span className="node-type">
                    {node.eventType === 'map_link' ? 'Map Link' : 
                     node.eventType === 'background_map' ? 'Background Map' : 
                     'Info Node'}
                  </span>
                  
                  {node.timelineEnabled && (
                    <span className="timeline-range">
                      📅 {node.startTime}-{node.endTime}
                    </span>
                  )}
                </div>
                
                {interactionMode === 'edit' && (
                  <div className="node-actions">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onNodeSelect && onNodeSelect(node)
                      }}
                      className="edit-node-btn"
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default NodesListPanel