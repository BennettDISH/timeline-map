import React from 'react'
import ImageSelector from './ImageSelector'

function NodeEditor({ 
  selectedNode,
  editFormData,
  setEditFormData,
  hasUnsavedChanges,
  setHasUnsavedChanges,
  timelineEnabled,
  timelineSettings,
  availableMaps,
  availableImages,
  saving,
  onSave,
  onCancel,
  onDelete
}) {
  if (!selectedNode) return null

  const handleFieldChange = (field, value) => {
    setEditFormData({...editFormData, [field]: value})
    setHasUnsavedChanges(true)
  }

  return (
    <div className="node-editor">
      <h3>Edit Node</h3>
      
      <div className="form-group">
        <label>Node Type</label>
        <select
          value={editFormData.nodeType || 'info'}
          onChange={(e) => handleFieldChange('nodeType', e.target.value)}
        >
          <option value="info">Info Node</option>
          <option value="map_link">Map Link Node</option>
          <option value="background_map">Background Map Node</option>
        </select>
      </div>
      
      <div className="form-group">
        <label>Title</label>
        <input
          type="text"
          value={editFormData.title}
          onChange={(e) => handleFieldChange('title', e.target.value)}
          placeholder="Node title"
        />
      </div>
      
      <div className="form-group">
        <label>Description</label>
        <textarea
          value={editFormData.description}
          onChange={(e) => handleFieldChange('description', e.target.value)}
          placeholder="Brief description"
          rows="3"
        />
      </div>
      
      <div className="form-group">
        <label>Content</label>
        <textarea
          value={editFormData.content}
          onChange={(e) => handleFieldChange('content', e.target.value)}
          placeholder="Detailed content"
          rows="4"
        />
      </div>
      
      {/* Show image selector for info and background map nodes */}
      {(editFormData.nodeType === 'background_map' || editFormData.nodeType === 'info') && (
        <div className="form-group">
          <label>Node Image (optional)</label>
          <ImageSelector
            images={availableImages}
            selectedImageId={editFormData.imageId}
            onImageSelect={(imageId) => handleFieldChange('imageId', imageId)}
            placeholder="No image selected"
            showPreview={false}
          />
        </div>
      )}
      
      {/* Image scaling for info nodes */}
      {editFormData.nodeType === 'info' && editFormData.imageId && (
        <>
          <div className="form-group">
            <label>Image Width: {editFormData.width}px</label>
            <input
              type="range"
              min="50"
              max="500"
              value={editFormData.width}
              onChange={(e) => handleFieldChange('width', parseInt(e.target.value))}
            />
          </div>
          
          <div className="form-group">
            <label>Image Height: {editFormData.height}px</label>
            <input
              type="range"
              min="50"
              max="500"
              value={editFormData.height}
              onChange={(e) => handleFieldChange('height', parseInt(e.target.value))}
            />
          </div>
        </>
      )}
      
      {/* Background map dimensions */}
      {editFormData.nodeType === 'background_map' && editFormData.imageId && (
        <>
          <div className="form-group">
            <label>Width: {editFormData.width}px</label>
            <input
              type="range"
              min="100"
              max="1000"
              value={editFormData.width}
              onChange={(e) => handleFieldChange('width', parseInt(e.target.value))}
            />
          </div>
          
          <div className="form-group">
            <label>Height: {editFormData.height}px</label>
            <input
              type="range"
              min="100"
              max="1000"
              value={editFormData.height}
              onChange={(e) => handleFieldChange('height', parseInt(e.target.value))}
            />
          </div>
        </>
      )}
      
      {/* Map link selector */}
      {editFormData.nodeType === 'map_link' && (
        <div className="form-group">
          <label>Linked Map</label>
          <select
            value={editFormData.linkToMapId || ''}
            onChange={(e) => handleFieldChange('linkToMapId', e.target.value || null)}
          >
            <option value="">Select a map...</option>
            {availableMaps.map(map => (
              <option key={map.id} value={map.id}>{map.title}</option>
            ))}
          </select>
        </div>
      )}
      
      {timelineEnabled && (
        <>
          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={editFormData.timelineEnabled}
                onChange={(e) => handleFieldChange('timelineEnabled', e.target.checked)}
              />
              Enable for Timeline
            </label>
          </div>
          
          {editFormData.timelineEnabled && (
            <>
              <div className="form-group">
                <label>Start Time: {editFormData.startTime}</label>
                <input
                  type="range"
                  min={timelineSettings.minTime}
                  max={timelineSettings.maxTime}
                  value={editFormData.startTime}
                  onChange={(e) => handleFieldChange('startTime', parseInt(e.target.value))}
                />
              </div>
              
              <div className="form-group">
                <label>End Time: {editFormData.endTime}</label>
                <input
                  type="range"
                  min={timelineSettings.minTime}
                  max={timelineSettings.maxTime}
                  value={editFormData.endTime}
                  onChange={(e) => handleFieldChange('endTime', parseInt(e.target.value))}
                />
              </div>
            </>
          )}
        </>
      )}
      
      <div className="form-actions">
        <button onClick={onCancel}>
          Cancel
        </button>
        
        <button
          className="save-button"
          disabled={saving}
          onClick={onSave}
        >
          {saving ? 'Saving...' : 'Save'}
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
          <small>You have unsaved changes</small>
        </div>
      )}
    </div>
  )
}

export default NodeEditor