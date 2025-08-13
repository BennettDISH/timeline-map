import React, { useState, useEffect } from 'react'
import imageServiceBase64 from '../services/imageServiceBase64'

function ImageGallery({ worldId, onImageSelect, selectedImageId = null, showUpload = false, selectedFolder = null, onBulkAction = null, customFolders = [] }) {
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selectedTags, setSelectedTags] = useState('')
  const [selectedImages, setSelectedImages] = useState(new Set())
  const [bulkMode, setBulkMode] = useState(false)

  useEffect(() => {
    loadImages()
  }, [worldId, search, selectedTags, selectedFolder])

  const loadImages = async () => {
    try {
      setLoading(true)
      
      // Build search parameters
      let searchParams = {
        worldId: worldId || undefined,
        search: search || undefined,
        limit: 50
      }
      
      // Handle custom folder filtering
      if (selectedFolder) {
        searchParams.folderId = selectedFolder.id
      } else if (selectedTags) {
        searchParams.tags = selectedTags
      }

      const result = await imageServiceBase64.getImages(searchParams)
      setImages(result.images)
      setError('')
    } catch (err) {
      setError(err.message || 'Failed to load images')
    } finally {
      setLoading(false)
    }
  }

  const handleImageClick = (image, e) => {
    if (bulkMode) {
      e.preventDefault()
      toggleImageSelection(image.id)
    } else {
      if (onImageSelect) {
        onImageSelect(image)
      }
    }
  }

  const toggleImageSelection = (imageId) => {
    const newSelection = new Set(selectedImages)
    if (newSelection.has(imageId)) {
      newSelection.delete(imageId)
    } else {
      newSelection.add(imageId)
    }
    setSelectedImages(newSelection)
  }

  const selectAllImages = () => {
    setSelectedImages(new Set(images.map(img => img.id)))
  }

  const clearSelection = () => {
    setSelectedImages(new Set())
  }

  const toggleBulkMode = () => {
    setBulkMode(!bulkMode)
    if (bulkMode) {
      clearSelection()
    }
  }

  const handleBulkFolderMove = async (folderId) => {
    if (selectedImages.size === 0) return
    
    try {
      const imageIds = Array.from(selectedImages)
      if (onBulkAction) {
        await onBulkAction('move', { imageIds, folderId })
        // Reload images to show changes
        await loadImages()
        clearSelection()
      }
    } catch (error) {
      setError(`Failed to move images: ${error.message}`)
    }
  }

  const renderCustomFolderButton = (folder, depth = 0) => {
    const hasChildren = folder.children && folder.children.length > 0
    
    return (
      <React.Fragment key={folder.id}>
        <button
          onClick={() => handleBulkFolderMove(folder.id)}
          className="bulk-folder-btn custom-folder-btn"
          style={{ marginLeft: `${depth * 0.5}rem` }}
          title={`Move ${selectedImages.size} images to ${folder.name}`}
        >
          {folder.icon} {folder.name}
        </button>
        {hasChildren && folder.children.map(child => renderCustomFolderButton(child, depth + 1))}
      </React.Fragment>
    )
  }

  const handleDelete = async (imageId, e) => {
    e.stopPropagation() // Prevent image selection
    
    if (!confirm('Are you sure you want to delete this image?')) {
      return
    }

    try {
      await imageServiceBase64.deleteImage(imageId)
      setImages(images.filter(img => img.id !== imageId))
    } catch (err) {
      setError(err.message || 'Failed to delete image')
    }
  }

  if (loading) {
    return <div className="image-gallery-loading">Loading images...</div>
  }

  return (
    <div className="image-gallery">
      <div className="gallery-header">
        <div className="gallery-controls">
          <input
            type="text"
            placeholder="Search images..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-input"
          />
          <input
            type="text"
            placeholder="Filter by tags..."
            value={selectedTags}
            onChange={(e) => setSelectedTags(e.target.value)}
            className="tags-input"
          />
          <button onClick={loadImages} className="refresh-button">
            🔄 Refresh
          </button>
          <button 
            onClick={toggleBulkMode} 
            className={`bulk-mode-button ${bulkMode ? 'active' : ''}`}
          >
            {bulkMode ? '✅ Bulk Mode' : '☑️ Select Multiple'}
          </button>
        </div>
        
        {bulkMode && (
          <div className="bulk-controls">
            <div className="bulk-selection-info">
              {selectedImages.size > 0 ? (
                <span>{selectedImages.size} image{selectedImages.size !== 1 ? 's' : ''} selected</span>
              ) : (
                <span>Click images to select them</span>
              )}
            </div>
            
            <div className="bulk-actions">
              {images.length > 0 && (
                <>
                  <button onClick={selectAllImages} className="bulk-action-btn">
                    Select All ({images.length})
                  </button>
                  {selectedImages.size > 0 && (
                    <button onClick={clearSelection} className="bulk-action-btn">
                      Clear Selection
                    </button>
                  )}
                </>
              )}
              
              {selectedImages.size > 0 && customFolders.length > 0 && (
                <div className="bulk-folder-actions">
                  <span>Move to:</span>
                  
                  {/* Custom Folders */}
                  {customFolders.map(folder => renderCustomFolderButton(folder))}
                  
                  {/* Uncategorized option */}
                  <button
                    onClick={() => handleBulkFolderMove(null)}
                    className="bulk-folder-btn uncategorized-btn"
                    title={`Move ${selectedImages.size} images to uncategorized`}
                  >
                    📄 Uncategorized
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="gallery-error">
          {error}
        </div>
      )}

      <div className="gallery-grid">
        {images.length === 0 ? (
          <div className="no-images">
            <p>No images found. {showUpload ? 'Upload some images to get started!' : ''}</p>
          </div>
        ) : (
          images.map(image => (
            <div 
              key={image.id} 
              className={`gallery-item ${selectedImageId === image.id ? 'selected' : ''} ${bulkMode && selectedImages.has(image.id) ? 'bulk-selected' : ''} ${bulkMode ? 'bulk-mode' : ''}`}
              onClick={(e) => handleImageClick(image, e)}
            >
              {bulkMode && (
                <div className="bulk-checkbox">
                  <input 
                    type="checkbox" 
                    checked={selectedImages.has(image.id)}
                    onChange={() => toggleImageSelection(image.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              )}
              <div className="image-container">
                <img 
                  src={image.url} 
                  alt={image.altText || image.originalName}
                  loading="lazy"
                />
                <div className="image-overlay">
                  {!bulkMode && (
                    <button 
                      className="delete-button"
                      onClick={(e) => handleDelete(image.id, e)}
                      title="Delete image"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
              <div className="image-info">
                <div className="image-name" title={image.originalName}>
                  {image.originalName}
                </div>
                <div className="image-meta">
                  {imageServiceBase64.formatFileSize(image.fileSize)}
                  {image.tags && image.tags.length > 0 && (
                    <div className="image-tags">
                      {image.tags.map(tag => (
                        <span key={tag} className="tag">{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default ImageGallery