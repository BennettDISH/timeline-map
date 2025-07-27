import React, { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import ImageUpload from '../components/ImageUpload'
import ImageGallery from '../components/ImageGallery'
import WorldSelector from '../components/WorldSelector'
import worldService from '../services/worldService'

function ImageManager() {
  const [searchParams] = useSearchParams()
  const [selectedImage, setSelectedImage] = useState(null)
  const [uploadSuccess, setUploadSuccess] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [refreshGallery, setRefreshGallery] = useState(0)
  const [currentWorld, setCurrentWorld] = useState(null)

  useEffect(() => {
    // Check for world ID in URL params or localStorage
    const worldIdFromUrl = searchParams.get('world')
    const worldFromStorage = worldService.getCurrentWorld()
    
    if (worldIdFromUrl) {
      // If world ID in URL, try to load that world
      loadWorldById(worldIdFromUrl)
    } else if (worldFromStorage) {
      setCurrentWorld(worldFromStorage)
    }
  }, [searchParams])

  const loadWorldById = async (worldId) => {
    try {
      const result = await worldService.getWorld(worldId)
      setCurrentWorld(result.world)
      worldService.setCurrentWorld(result.world)
    } catch (error) {
      console.error('Failed to load world:', error)
      // Fallback to stored world or none
      setCurrentWorld(worldService.getCurrentWorld())
    }
  }

  const handleUploadSuccess = (image) => {
    setUploadSuccess(`Successfully uploaded: ${image.originalName}`)
    setUploadError('')
    setRefreshGallery(prev => prev + 1) // Trigger gallery refresh
    
    // Clear success message after 3 seconds
    setTimeout(() => setUploadSuccess(''), 3000)
  }

  const handleUploadError = (error) => {
    setUploadError(error)
    setUploadSuccess('')
  }

  const handleWorldSelect = (world) => {
    setCurrentWorld(world)
    setSelectedImage(null) // Clear selection when switching worlds
    setRefreshGallery(prev => prev + 1) // Refresh gallery
  }

  const handleImageSelect = (image) => {
    setSelectedImage(image)
  }

  const copyImageUrl = () => {
    if (selectedImage) {
      navigator.clipboard.writeText(selectedImage.url)
      alert('Image URL copied to clipboard!')
    }
  }

  return (
    <div className="image-manager">
      <div className="page-header">
        <div className="header-content">
          <h1>Image Manager</h1>
          <Link to="/dashboard" className="back-link">← Back to Dashboard</Link>
        </div>
      </div>

      <div className="manager-content">
        <div className="world-section">
          <WorldSelector 
            onWorldSelect={handleWorldSelect}
            currentWorldId={currentWorld?.id}
          />
        </div>

        {currentWorld ? (
          <>
            <div className="upload-section">
              <h2>Upload Images to {currentWorld.name}</h2>
              <ImageUpload 
                worldId={currentWorld.id}
                onUploadSuccess={handleUploadSuccess}
                onUploadError={handleUploadError}
              />
              
              {uploadSuccess && (
                <div className="success-message">
                  ✅ {uploadSuccess}
                </div>
              )}
              
              {uploadError && (
                <div className="error-message">
                  ❌ {uploadError}
                </div>
              )}
            </div>

            <div className="gallery-section">
              <h2>Images in {currentWorld.name}</h2>
              <ImageGallery 
                key={`${refreshGallery}-${currentWorld.id}`} // Force refresh when key changes
                worldId={currentWorld.id}
                onImageSelect={handleImageSelect}
                selectedImageId={selectedImage?.id}
                showUpload={true}
              />
            </div>
          </>
        ) : (
          <div className="no-world-selected">
            <h2>No World Selected</h2>
            <p>Please select a world to manage images, or create a new world to get started.</p>
          </div>
        )}

        {selectedImage && (
          <div className="image-details">
            <h3>Selected Image</h3>
            <div className="details-content">
              <div className="image-preview">
                <img src={selectedImage.url} alt={selectedImage.altText || selectedImage.originalName} />
              </div>
              <div className="image-info">
                <p><strong>Name:</strong> {selectedImage.originalName}</p>
                <p><strong>Size:</strong> {selectedImage.fileSize} bytes</p>
                <p><strong>Type:</strong> {selectedImage.mimeType}</p>
                <p><strong>Uploaded:</strong> {new Date(selectedImage.uploadedAt).toLocaleDateString()}</p>
                {selectedImage.altText && <p><strong>Alt Text:</strong> {selectedImage.altText}</p>}
                {selectedImage.tags && selectedImage.tags.length > 0 && (
                  <p><strong>Tags:</strong> {selectedImage.tags.join(', ')}</p>
                )}
                <div className="image-actions">
                  <button onClick={copyImageUrl} className="copy-url-button">
                    📋 Copy URL
                  </button>
                  <a 
                    href={selectedImage.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="view-button"
                  >
                    👁️ View Full Size
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ImageManager