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
    if (nodeType === 'map_link') return '🗺️'
    if (nodeType === 'background_map') return '🖼️'
    return node.imageUrl ? '📷' : 'ℹ️'
  }
  
  // Helper function to get node type label
  const getNodeTypeLabel = (node) => {
    const nodeType = getNodeType(node)
    if (nodeType === 'npc') return 'NPC'
    if (nodeType === 'item') return 'Item'
    if (nodeType === 'map_link') return 'Map Link'
    if (nodeType === 'background_map') return 'Background Map'
    return 'Info Node'
  }

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
                    {getNodeIcon(node)}
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
                    {getNodeTypeLabel(node)}
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