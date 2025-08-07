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