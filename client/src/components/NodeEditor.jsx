import React, { useState } from 'react'
import ImageSelector from './ImageSelector'
import UniversalNodeSearch from './UniversalNodeSearch'

function NodeEditor({ 
  selectedNode,
  editFormData,
  timelineEnabled,
  timelineSettings,
  availableMaps,
  availableImages,
  nodes,
  worldId,
  onCancel,
  onDelete,
  handleFieldChange,
  hasUnsavedChanges
}) {
  if (!selectedNode) return null

  // Get existing connections from node metadata
  const getNodeConnections = () => {
    try {
      if (selectedNode.tooltipText) {
        const metadata = JSON.parse(selectedNode.tooltipText)
        return metadata.connections || []
      }
    } catch (e) {
    }
    return []
  }

  const [expandedSections, setExpandedSections] = useState({
    nodeType: true,
    content: true,
    image: true,
    connections: false,
    link: true,
    timeline: false,
    position: false
  })

  const [isExpanded, setIsExpanded] = useState(false)

  const toggleSection = (section) => {
    setExpandedSections(prev => ({...prev, [section]: !prev[section]}))
  }

  const nodeTypeOptions = [
    { value: 'info', label: 'Info Node', icon: 'ℹ️', description: 'Information point with rich content' },
    { value: 'npc', label: 'NPC', icon: '👤', description: 'Non-player character with personality' },
    { value: 'item', label: 'Item', icon: '⚔️', description: 'Legendary items, artifacts, or equipment' },
    { value: 'map_link', label: 'Map Link', icon: '🗺️', description: 'Portal to another map' },
    { value: 'background_map', label: 'Background Map', icon: '🖼️', description: 'Large background image' }
  ]

  const currentNodeType = nodeTypeOptions.find(opt => opt.value === (editFormData.nodeType || 'info'))
  
  // Get available nodes for connections (excluding current node)
  const availableNodes = nodes ? nodes.filter(node => node.id !== selectedNode.id) : []
  
  // Connection management state
  const [newConnection, setNewConnection] = useState({ 
    nodeId: '', 
    mapId: '', 
    timeContext: '', 
    relationshipType: '', 
    description: '' 
  })
  const [existingConnections, setExistingConnections] = useState(getNodeConnections())
  const [selectedSearchNode, setSelectedSearchNode] = useState(null)
  
  const addConnection = () => {
    if (!selectedSearchNode) return
    
    const connection = {
      nodeId: selectedSearchNode.nodeId,
      mapId: selectedSearchNode.mapId,
      timeContext: newConnection.timeContext || null,
      relationshipType: 'connected_to', // Default relationship
      description: newConnection.description || '',
      targetTitle: selectedSearchNode.title,
      targetMapTitle: selectedSearchNode.mapTitle
    }
    
    const updatedConnections = [...existingConnections, connection]
    setExistingConnections(updatedConnections)
    
    // Update the form data with new connections
    const updatedTooltipData = editFormData.tooltipData || {}
    updatedTooltipData.connections = updatedConnections
    handleFieldChange('connections', updatedConnections)
    
    // Reset form
    setNewConnection({ nodeId: '', mapId: '', timeContext: '', relationshipType: '', description: '' })
    setSelectedSearchNode(null)
  }
  
  const removeConnection = (index) => {
    const updatedConnections = existingConnections.filter((_, i) => i !== index)
    setExistingConnections(updatedConnections)
    handleFieldChange('connections', updatedConnections)
  }
  
  const getNodeById = (nodeId) => {
    return availableNodes.find(node => node.id === nodeId)
  }
  
  const handleNodeSearchSelect = (searchResult) => {
    setSelectedSearchNode(searchResult)
    setNewConnection(prev => ({ 
      ...prev, 
      nodeId: searchResult.nodeId, 
      mapId: searchResult.mapId 
    }))
  }

  return (
    <div className={`node-editor ${isExpanded ? 'expanded' : 'condensed'}`}>
      <div className="editor-header">
        <div className="header-main">
          <div className="node-type-badge">
            <span className="node-icon">{currentNodeType?.icon}</span>
            <span className="node-type-name">{currentNodeType?.label}</span>
          </div>
          <div className="header-actions">
            <button 
              className="expand-toggle"
              onClick={() => setIsExpanded(!isExpanded)}
              title={isExpanded ? 'Compact view' : 'Expanded view'}
            >
              {isExpanded ? '📱' : '🖥️'}
            </button>
            {hasUnsavedChanges && (
              <div className="unsaved-indicator-header">
                <span className="unsaved-dot">●</span>
                <span className="unsaved-text">Unsaved</span>
              </div>
            )}
          </div>
        </div>
        <div className="header-subtitle">
          {editFormData.title || 'Untitled Node'}
        </div>
      </div>
      
      <div className="editor-content">
        <div className={isExpanded ? "form-sections-container" : ""}>
        <div className="form-section node-type-section">
          <div className="section-header" onClick={() => toggleSection('nodeType')}>
            <div className="section-title">Node Type {expandedSections.nodeType ? '▼' : '▶'}</div>
          </div>
          {expandedSections.nodeType && (
            <div className="section-content">
              <div className="node-type-selector">
            {nodeTypeOptions.map(option => (
              <div
                key={option.value}
                className={`node-type-card ${editFormData.nodeType === option.value ? 'selected' : ''}`}
                onClick={() => handleFieldChange('nodeType', option.value)}
              >
                <div className="node-type-icon">{option.icon}</div>
                <div className="node-type-info">
                  <div className="node-type-label">{option.label}</div>
                  <div className="node-type-desc">{option.description}</div>
                </div>
              </div>
              ))}
              </div>
            </div>
          )}
        </div>

        <div className="form-section">
          <div className="section-header" onClick={() => toggleSection('content')}>
            <div className="section-title">Content {expandedSections.content ? '▼' : '▶'}</div>
          </div>
          {expandedSections.content && (
            <div className="section-content">
              <div className="form-group">
                <label>Title</label>
                <input
                  type="text"
                  value={editFormData.title}
                  onChange={(e) => handleFieldChange('title', e.target.value)}
                  placeholder={`What's this ${currentNodeType?.label.toLowerCase()}?`}
                  className="title-input"
                />
              </div>
              
              <div className="form-group">
                <label>Quick Description</label>
                <textarea
                  value={editFormData.description}
                  onChange={(e) => handleFieldChange('description', e.target.value)}
                  placeholder="Brief overview that appears in tooltips and previews"
                  rows="2"
                  className="description-input"
                />
              </div>
              
              <div className="form-group">
                <label>Detailed Content</label>
                <textarea
                  value={editFormData.content}
                  onChange={(e) => handleFieldChange('content', e.target.value)}
                  placeholder="Rich, detailed information. Tell the story, describe the location, share the lore..."
                  rows="6"
                  className="content-input auto-resize"
                  style={{ minHeight: '120px' }}
                />
              </div>
            </div>
          )}
        </div>
      
        {/* Show image selector for info, map link, and background map nodes */}
        {(editFormData.nodeType === 'background_map' || editFormData.nodeType === 'info' || editFormData.nodeType === 'map_link' || editFormData.nodeType === 'npc' || editFormData.nodeType === 'item') && (
          <div className="form-section">
            <div className="section-header" onClick={() => toggleSection('image')}>
              <div className="section-title">Visual Settings {expandedSections.image ? '▼' : '▶'}</div>
            </div>
            {expandedSections.image && (
              <div className="section-content">
                <div className="form-group">
                  <label>
                    {editFormData.nodeType === 'background_map' ? 'Background Image' :
                     editFormData.nodeType === 'map_link' ? 'Portal Image (optional)' :
                     'Visual Element (optional)'}
                  </label>
                  <ImageSelector
                    images={availableImages}
                    selectedImageId={editFormData.imageId}
                    onImageSelect={(imageId) => handleFieldChange('imageId', imageId)}
                    placeholder={editFormData.nodeType === 'background_map' ? 'Choose a background image' : 'Add visual flair'}
                    showPreview={true}
                  />
                </div>
                
                {(editFormData.nodeType === 'info' || editFormData.nodeType === 'npc' || editFormData.nodeType === 'item' || editFormData.nodeType === 'map_link') && editFormData.imageId && (
                  <div className="form-group scale-control">
                    <label className="scale-label">
                      <span>Size</span>
                      <span className="scale-value">
                        {editFormData.scale || 100}% 
                        <span className="scale-dimensions">
                          ({Math.round((editFormData.scale || 100) * editFormData.width / 100)}×{Math.round((editFormData.scale || 100) * editFormData.height / 100)}px)
                        </span>
                      </span>
                    </label>
                    <div className="scale-slider-container">
                      <span className="scale-min">Tiny</span>
                      <input
                        type="range"
                        min="25"
                        max="300"
                        step="5"
                        value={editFormData.scale || 100}
                        onChange={(e) => handleFieldChange('scale', parseInt(e.target.value))}
                        className="scale-slider"
                      />
                      <span className="scale-max">Huge</span>
                    </div>
                  </div>
                )}
                
                {editFormData.nodeType === 'background_map' && editFormData.imageId && (
                  <div className="dimensions-control">
                    <label className="dimensions-label">Background Dimensions</label>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="dimension-label">
                          <span>Width</span>
                          <span className="dimension-value">{editFormData.width}px</span>
                        </label>
                        <input
                          type="range"
                          min="100"
                          max="1000"
                          value={editFormData.width}
                          onChange={(e) => handleFieldChange('width', parseInt(e.target.value))}
                          className="dimension-slider"
                        />
                      </div>
                      
                      <div className="form-group">
                        <label className="dimension-label">
                          <span>Height</span>
                          <span className="dimension-value">{editFormData.height}px</span>
                        </label>
                        <input
                          type="range"
                          min="100"
                          max="1000"
                          value={editFormData.height}
                          onChange={(e) => handleFieldChange('height', parseInt(e.target.value))}
                          className="dimension-slider"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        
        {/* Universal Connections Section */}
        <div className="form-section">
          <div className="section-header" onClick={() => toggleSection('connections')}>
            <div className="section-title">Connections & Relationships {expandedSections.connections ? '▼' : '▶'}</div>
          </div>
          {expandedSections.connections && (
            <div className="section-content">
              <div className="connections-help">
                <small>🔗 Link this node to other nodes to show relationships and connections</small>
              </div>
              
              {/* Existing Connections */}
              {existingConnections.length > 0 && (
                <div className="existing-connections">
                  <label>Current Connections</label>
                  <div className="connections-list">
                    {existingConnections.map((connection, index) => {
                      const relationshipLabel = '🔗 Connected to'
                      const isCurrentMap = !connection.mapId || connection.mapId === selectedNode.mapId
                      const connectedNode = isCurrentMap ? getNodeById(connection.nodeId) : null
                      
                      return (
                        <div key={index} className={`connection-item ${!isCurrentMap ? 'cross-map' : ''}`}>
                          <div className="connection-info">
                            <span className="relationship-label">{relationshipLabel}</span>
                            <span className="connected-node-name">
                              {connection.targetTitle || connectedNode?.title || `Node #${connection.nodeId}`}
                              {!isCurrentMap && (
                                <span className="map-indicator">
                                  📍 {connection.targetMapTitle || 'Other Map'}
                                </span>
                              )}
                              {connection.timeContext && (
                                <span className="time-indicator">
                                  🕐 Year {connection.timeContext}
                                </span>
                              )}
                            </span>
                            {connection.description && (
                              <small className="connection-description">{connection.description}</small>
                            )}
                          </div>
                          <button 
                            type="button" 
                            className="remove-connection-btn"
                            onClick={() => removeConnection(index)}
                            title="Remove connection"
                          >
                            ✗
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              
              {/* Add New Connection */}
              <div className="add-connection">
                <label>Add Connection</label>
                <div className="connection-form">
                  <div className="form-group">
                    <label>Target Node</label>
                    <UniversalNodeSearch
                      worldId={worldId}
                      currentMapId={selectedNode.mapId}
                      availableMaps={availableMaps}
                      onNodeSelect={handleNodeSearchSelect}
                      placeholder="Search for any node across all maps..."
                      className="connection-search"
                    />
                    {selectedSearchNode && (
                      <div className="selected-node-preview">
                        <small>
                          ✓ Selected: <strong>{selectedSearchNode.title}</strong> 
                          {selectedSearchNode.mapId !== selectedNode.mapId && (
                            <span className="cross-map-indicator">
                              📍 on {selectedSearchNode.mapTitle}
                            </span>
                          )}
                        </small>
                      </div>
                    )}
                  </div>
                  
                  <div className="form-group">
                    <label>Time Context (optional)</label>
                    <input
                      type="number"
                      placeholder="e.g. 1420 (year when this relationship applies)"
                      value={newConnection.timeContext}
                      onChange={(e) => setNewConnection({...newConnection, timeContext: e.target.value})}
                      className="time-context-input"
                    />
                    <small className="time-context-help">
                      💡 Specify when this relationship applies (useful for historical connections)
                    </small>
                  </div>
                  
                  <div className="form-group">
                    <input
                      type="text"
                      placeholder="Optional description"
                      value={newConnection.description}
                      onChange={(e) => setNewConnection({...newConnection, description: e.target.value})}
                      className="connection-description-input"
                    />
                  </div>
                  
                  <button 
                    type="button" 
                    onClick={addConnection}
                    className="add-connection-btn"
                    disabled={!selectedSearchNode}
                  >
                    🔗 Add Connection
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        
        {editFormData.nodeType === 'map_link' && (
          <div className="form-section">
            <div className="section-header" onClick={() => toggleSection('link')}>
              <div className="section-title">Portal Destination {expandedSections.link ? '▼' : '▶'}</div>
            </div>
            {expandedSections.link && (
              <div className="section-content">
                <div className="form-group">
                  <label>Destination Map</label>
                  <select
                    value={editFormData.linkToMapId || ''}
                    onChange={(e) => handleFieldChange('linkToMapId', e.target.value || null)}
                    className="destination-select"
                  >
                    <option value="">🚪 Choose destination...</option>
                    {availableMaps.map(map => (
                      <option key={map.id} value={map.id}>🗺️ {map.title}</option>
                    ))}
                  </select>
                  {editFormData.linkToMapId && (
                    <div className="link-preview">
                      <small>✨ Clicking this node will teleport users to the selected map</small>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        
        {timelineEnabled && (
          <div className="form-section">
            <div className="section-header" onClick={() => toggleSection('timeline')}>
              <div className="section-title">Timeline Integration {expandedSections.timeline ? '▼' : '▶'}</div>
            </div>
            {expandedSections.timeline && (
              <div className="section-content">
                <div className="form-group">
                  <label className="timeline-toggle">
                    <input
                      type="checkbox"
                      checked={editFormData.timelineEnabled}
                      onChange={(e) => handleFieldChange('timelineEnabled', e.target.checked)}
                    />
                    <span className="timeline-toggle-text">
                      <strong>Show on Timeline</strong>
                      <small>This node will appear/disappear based on the current time</small>
                    </span>
                  </label>
                </div>
                
                {editFormData.timelineEnabled && (
                  <div className="timeline-range">
                    <div className="timeline-help">
                      <small>📅 This node will be visible from {editFormData.startTime} to {editFormData.endTime} {timelineSettings.timeUnit}</small>
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="time-label">
                          <span>Appears At</span>
                          <span className="time-value">{editFormData.startTime} {timelineSettings.timeUnit}</span>
                        </label>
                        <input
                          type="range"
                          min={timelineSettings.minTime}
                          max={timelineSettings.maxTime}
                          value={editFormData.startTime}
                          onChange={(e) => handleFieldChange('startTime', parseInt(e.target.value))}
                          className="time-slider"
                        />
                      </div>
                      
                      <div className="form-group">
                        <label className="time-label">
                          <span>Disappears At</span>
                          <span className="time-value">{editFormData.endTime} {timelineSettings.timeUnit}</span>
                        </label>
                        <input
                          type="range"
                          min={timelineSettings.minTime}
                          max={timelineSettings.maxTime}
                          value={editFormData.endTime}
                          onChange={(e) => handleFieldChange('endTime', parseInt(e.target.value))}
                          className="time-slider"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="form-section">
          <div className="section-header" onClick={() => toggleSection('position')}>
            <div className="section-title">Advanced Settings {expandedSections.position ? '▼' : '▶'}</div>
          </div>
          {expandedSections.position && (
            <div className="section-content">
              <div className="form-group">
                <label className="position-toggle">
                  <input
                    type="checkbox"
                    checked={editFormData.locked || false}
                    onChange={(e) => handleFieldChange('locked', e.target.checked)}
                  />
                  <span className="position-toggle-text">
                    <strong>🔒 Lock Position</strong>
                    <small>Prevent accidental dragging while editing</small>
                  </span>
                </label>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>
      
      <div className="editor-footer">
        <div className="form-actions">
          <button onClick={onCancel}>
            Close
          </button>
          
          <button
            className="delete-button"
            onClick={onDelete}
          >
            Delete
          </button>
        </div>
        
        {hasUnsavedChanges && (
          <div className="unsaved-changes-notice">
            <div className="unsaved-icon">💾</div>
            <div className="unsaved-message">
              <strong>Changes ready to save</strong>
              <small>Use the global save button to save all changes</small>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default NodeEditor