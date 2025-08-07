import React, { useState, useEffect } from 'react'
import imageServiceBase64 from '../services/imageServiceBase64'

function ImageGallery({ worldId, onImageSelect, selectedImageId = null, showUpload = false }) {
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selectedTags, setSelectedTags] = useState('')

  useEffect(() => {
    loadImages()
  }, [worldId, search, selectedTags])

  const loadImages = async () => {
    try {
      setLoading(true)
      const result = await imageServiceBase64.getImages({
        worldId: worldId || undefined,
        search: search || undefined,
        tags: selectedTags || undefined,
        limit: 50
      })
      setImages(result.images)
      setError('')
    } catch (err) {
      setError(err.message || 'Failed to load images')
    } finally {
      setLoading(false)
    }
  }

  const handleImageClick = (image) => {
    if (onImageSelect) {
      onImageSelect(image)
    }
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
        </div>
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
              className={`gallery-item ${selectedImageId === image.id ? 'selected' : ''}`}
              onClick={() => handleImageClick(image)}
            >
              <div className="image-container">
                <img 
                  src={image.url} 
                  alt={image.altText || image.originalName}
                  loading="lazy"
                />
                <div className="image-overlay">
                  <button 
                    className="delete-button"
                    onClick={(e) => handleDelete(image.id, e)}
                    title="Delete image"
                  >
                    🗑️
                  </button>
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