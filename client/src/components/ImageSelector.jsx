import React, { useState, useEffect } from 'react'
import '../styles/imageSelector.scss'
import imageServiceBase64 from '../services/imageServiceBase64'
import imageFolderService from '../services/imageFolderService'

function ImageSelector({ 
  images, 
  selectedImageId, 
  onImageSelect, 
  disabled = false, 
  placeholder = "Choose an image...",
  showPreview = false,
  worldId = null,
  showFolderFilter = false
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [filteredImages, setFilteredImages] = useState(images)
  const [customFolders, setCustomFolders] = useState([])
  const [selectedFolder, setSelectedFolder] = useState(null)
  const [loadingFolders, setLoadingFolders] = useState(false)
  
  const selectedImage = images.find(img => img.id === parseInt(selectedImageId))
  
  // Load custom folders when showFolderFilter is enabled and worldId is provided
  useEffect(() => {
    if (showFolderFilter && worldId) {
      loadCustomFolders()
    }
  }, [showFolderFilter, worldId])

  // Update filtered images when images, selectedFolder changes
  useEffect(() => {
    if (!showFolderFilter || !selectedFolder) {
      setFilteredImages(images)
    } else {
      // Filter images based on selected folder
      if (selectedFolder.id === 'unassigned') {
        setFilteredImages(images.filter(img => !img.folderId))
      } else {
        setFilteredImages(images.filter(img => img.folderId === selectedFolder.id))
      }
    }
  }, [images, selectedFolder, showFolderFilter])

  const loadCustomFolders = async () => {
    try {
      setLoadingFolders(true)
      const result = await imageFolderService.getFolders(worldId)
      
      // Get count of unassigned images
      const unassignedCount = images.filter(img => !img.folderId).length
      
      // Create unassigned folder and combine with custom folders
      const unassignedFolder = {
        id: 'unassigned',
        name: 'Unassigned',
        icon: '📄',
        count: unassignedCount,
        isDefault: true
      }
      
      setCustomFolders([unassignedFolder, ...(result.folders || [])])
    } catch (error) {
      console.error('Failed to load custom folders:', error)
      setCustomFolders([])
    } finally {
      setLoadingFolders(false)
    }
  }
  
  const handleImageSelect = (imageId) => {
    onImageSelect(imageId)
    setIsOpen(false)
  }

  const handleFolderSelect = (folder) => {
    setSelectedFolder(selectedFolder?.id === folder.id ? null : folder)
  }
  
  const handleToggle = () => {
    if (!disabled) {
      setIsOpen(!isOpen)
    }
  }
  
  return (
    <div className={`image-selector ${isOpen ? 'open' : ''} ${disabled ? 'disabled' : ''}`}>
      <div className="image-selector-trigger" onClick={handleToggle}>
        {selectedImage ? (
          <div className="selected-image">
            <img src={selectedImage.url || selectedImage.imageUrl} alt={selectedImage.filename || selectedImage.imageName} />
            <span className="image-name">{selectedImage.filename || selectedImage.imageName}</span>
          </div>
        ) : (
          <div className="placeholder">
            <span>📷 {placeholder}</span>
          </div>
        )}
        <span className="dropdown-arrow">{isOpen ? '▲' : '▼'}</span>
      </div>
      
      {isOpen && (
        <div className="image-selector-dropdown">
          <div className="dropdown-content">
            {showFolderFilter && (
              <div className="folder-filter-section">
                <div className="folder-filter-header">
                  <span>📁 Filter by Folder</span>
                  {selectedFolder && (
                    <button 
                      className="clear-filter-btn"
                      onClick={() => setSelectedFolder(null)}
                      title="Show all images"
                    >
                      ✕ Clear
                    </button>
                  )}
                </div>
                <div className="folder-filter-list">
                  {loadingFolders ? (
                    <div className="loading-folders">Loading folders...</div>
                  ) : (
                    <>
                      <button
                        className={`folder-filter-btn ${!selectedFolder ? 'active' : ''}`}
                        onClick={() => setSelectedFolder(null)}
                      >
                        <span className="folder-icon">🗂️</span>
                        <span className="folder-name">All Images</span>
                        <span className="folder-count">({images.length})</span>
                      </button>
                      {customFolders.map(folder => (
                        <button
                          key={folder.id}
                          className={`folder-filter-btn ${selectedFolder?.id === folder.id ? 'active' : ''} ${folder.isDefault ? 'unassigned-folder' : ''}`}
                          onClick={() => handleFolderSelect(folder)}
                        >
                          <span className="folder-icon">{folder.icon}</span>
                          <span className="folder-name">{folder.name}</span>
                          <span className="folder-count">({folder.count || 0})</span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </div>
            )}
            
            {filteredImages.length === 0 ? (
              <div className="no-images">
                <p>{selectedFolder ? `No images in ${selectedFolder.name}` : 'No images available'}</p>
              </div>
            ) : (
              <div className="image-grid">
                {filteredImages.map((image) => (
                  <div 
                    key={image.id} 
                    className={`image-option ${selectedImageId === image.id.toString() ? 'selected' : ''}`}
                    onClick={() => handleImageSelect(image.id)}
                  >
                    <img src={image.url || image.imageUrl} alt={image.filename || image.imageName} />
                    <span className="image-name">{image.filename || image.imageName}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      
      {showPreview && selectedImage && (
        <div className="image-preview">
          <img src={selectedImage.url || selectedImage.imageUrl} alt={selectedImage.filename || selectedImage.imageName} />
        </div>
      )}
    </div>
  )
}

export default ImageSelector