import React, { useState } from 'react'
import ImageSelector from './ImageSelector'

function NodeEditor({ 
  selectedNode,
  editFormData,
  timelineEnabled,
  timelineSettings,
  availableMaps,
  availableImages,
  onCancel,
  onDelete,
  handleFieldChange,
  hasUnsavedChanges
}) {
  if (!selectedNode) return null

  const [expandedSections, setExpandedSections] = useState({
    nodeType: true,
    content: true,
    image: true,
    link: true,
    timeline: false,
    position: false
  })

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

  return (
    <div className="node-editor">
      <div className="editor-header">
        <div className="header-main">
          <div className="node-type-badge">
            <span className="node-icon">{currentNodeType?.icon}</span>
            <span className="node-type-name">{currentNodeType?.label}</span>
          </div>
          {hasUnsavedChanges && (
            <div className="unsaved-indicator-header">
              <span className="unsaved-dot">●</span>
              <span className="unsaved-text">Unsaved</span>
            </div>
          )}
        </div>
        <div className="header-subtitle">
          {editFormData.title || 'Untitled Node'}
        </div>
      </div>
      
      <div className="editor-content">
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