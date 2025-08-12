import React from 'react'
import { useNavigate } from 'react-router-dom'

function InfoPanel({ 
  showInfoPanel, 
  infoPanelNode, 
  interactionMode,
  onClose,
  onEditNode
}) {
  const navigate = useNavigate()

  if (!showInfoPanel || !infoPanelNode) return null

  // Get connections from node metadata
  const getNodeConnections = () => {
    try {
      if (infoPanelNode.tooltipText) {
        const metadata = JSON.parse(infoPanelNode.tooltipText)
        return metadata.connections || []
      }
    } catch (e) {
      // Ignore JSON parsing errors
    }
    return []
  }

  const connections = getNodeConnections()


  return (
    <div className="info-panel">
      <div className="info-panel-header">
        <h3>{infoPanelNode.title}</h3>
        <button 
          className="close-button"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      
      <div className="info-panel-content">
        {infoPanelNode.imageUrl && (
          <div className="info-section">
            <h4>Image</h4>
            <img 
              src={infoPanelNode.imageUrl} 
              alt={infoPanelNode.title}
              className="node-preview-image"
            />
          </div>
        )}
        
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
        
        {connections.length > 0 && (
          <div className="info-section">
            <div className="info-section-header">
              <h4>Connected Nodes</h4>
              {interactionMode === 'edit' && (
                <button
                  className="edit-connections-btn"
                  onClick={() => onEditNode(infoPanelNode, 'connections')}
                  title="Edit connections"
                >
                  ✏️
                </button>
              )}
            </div>
            <div className="connections-list">
              {connections.map((connection, index) => (
                <div key={index} className="connection-item">
                  <div className="connection-info">
                    <span className="connection-title">
                      🔗 {connection.targetTitle || `Node #${connection.nodeId}`}
                    </span>
                    {connection.targetMapTitle && connection.mapId !== infoPanelNode.mapId && (
                      <span className="connection-map">
                        📍 {connection.targetMapTitle}
                      </span>
                    )}
                    {connection.timeContext && (
                      <span className="connection-time">
                        🕐 Year {connection.timeContext}
                      </span>
                    )}
                  </div>
                  {connection.description && (
                    <p className="connection-description">{connection.description}</p>
                  )}
                  <div className="connection-actions">
                    <button 
                      className="connection-navigate-btn"
                      onClick={() => {
                        if (connection.mapId && connection.mapId !== infoPanelNode.mapId) {
                          // Navigate to different map
                          navigate(`/map/${connection.mapId}`)
                        } else {
                          // TODO: Scroll to node on same map
                          console.log('Navigate to node on same map:', connection.nodeId)
                        }
                      }}
                      title="Navigate to connected node"
                    >
                      →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add Connection button when no connections exist and in edit mode */}
        {interactionMode === 'edit' && connections.length === 0 && (
          <div className="info-section">
            <div className="info-section-header">
              <h4>Connections</h4>
              <button
                className="add-connection-btn"
                onClick={() => onEditNode(infoPanelNode, 'connections')}
                title="Add connections"
              >
                + Add Connection
              </button>
            </div>
            <p className="no-connections-hint">
              <em>No connections yet. Click "Add Connection" to link this node to others.</em>
            </p>
          </div>
        )}
        
        {infoPanelNode.eventType === 'map_link' && infoPanelNode.linkToMapId && (
          <div className="info-section">
            <h4>Navigation</h4>
            <button
              className="edit-button"
              onClick={() => navigate(`/map/${infoPanelNode.linkToMapId}`)}
            >
              Go to Linked Map
            </button>
          </div>
        )}
        
        {interactionMode === 'edit' && (
          <div className="info-panel-actions">
            <button
              className="edit-button"
              onClick={() => onEditNode(infoPanelNode)}
            >
              Edit Node
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default InfoPanel