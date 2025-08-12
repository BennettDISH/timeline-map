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
  const [selectedFolder, setSelectedFolder] = useState(null)
  const [folders, setFolders] = useState([])
  const [showNewFolderForm, setShowNewFolderForm] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')

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
      loadFolders(worldId) // Load folders when world is loaded
    } catch (error) {
      // Fallback to stored world or none
      const storedWorld = worldService.getCurrentWorld()
      setCurrentWorld(storedWorld)
      if (storedWorld) {
        loadFolders(storedWorld.id)
      }
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
    setSelectedFolder(null) // Clear folder selection
    setRefreshGallery(prev => prev + 1) // Refresh gallery
    loadFolders(world.id) // Load folders for new world
  }

  const loadFolders = async (worldId) => {
    try {
      // For now, we'll create a simple folder system using tags/categories
      // This could be enhanced with a dedicated folders API later
      const mockFolders = [
        { id: 'all', name: 'All Images', count: 0 },
        { id: 'characters', name: 'Characters', count: 0 },
        { id: 'locations', name: 'Locations', count: 0 },
        { id: 'items', name: 'Items & Objects', count: 0 },
        { id: 'maps', name: 'Maps', count: 0 },
        { id: 'uncategorized', name: 'Uncategorized', count: 0 }
      ]
      setFolders(mockFolders)
    } catch (error) {
      console.error('Failed to load folders:', error)
    }
  }

  const createFolder = async () => {
    if (!newFolderName.trim() || !currentWorld) return
    
    const newFolder = {
      id: newFolderName.toLowerCase().replace(/\s+/g, '-'),
      name: newFolderName,
      count: 0
    }
    
    setFolders(prev => [...prev, newFolder])
    setNewFolderName('')
    setShowNewFolderForm(false)
  }

  const handleFolderSelect = (folder) => {
    setSelectedFolder(folder)
    setSelectedImage(null) // Clear image selection when changing folders
    setRefreshGallery(prev => prev + 1) // Trigger gallery refresh with folder filter
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
          <div className="manager-layout">
            {/* Folders Sidebar */}
            <div className="folders-sidebar">
              <div className="folders-header">
                <h3>📁 Folders</h3>
                <button 
                  className="new-folder-btn"
                  onClick={() => setShowNewFolderForm(true)}
                  title="Create new folder"
                >
                  ➕
                </button>
              </div>

              {showNewFolderForm && (
                <div className="new-folder-form">
                  <input
                    type="text"
                    placeholder="Folder name..."
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && createFolder()}
                    autoFocus
                  />
                  <div className="folder-form-actions">
                    <button onClick={createFolder} className="create-btn">✓</button>
                    <button onClick={() => {setShowNewFolderForm(false); setNewFolderName('')}} className="cancel-btn">✕</button>
                  </div>
                </div>
              )}

              <div className="folders-list">
                {folders.map(folder => (
                  <div 
                    key={folder.id}
                    className={`folder-item ${selectedFolder?.id === folder.id ? 'active' : ''}`}
                    onClick={() => handleFolderSelect(folder)}
                  >
                    <span className="folder-icon">
                      {folder.id === 'all' ? '📁' : 
                       folder.id === 'characters' ? '👤' :
                       folder.id === 'locations' ? '🗺️' :
                       folder.id === 'items' ? '⚔️' :
                       folder.id === 'maps' ? '🗾' :
                       folder.id === 'uncategorized' ? '📄' : '📁'}
                    </span>
                    <span className="folder-name">{folder.name}</span>
                    <span className="folder-count">({folder.count})</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Main Content */}
            <div className="main-content">
              <div className="upload-section">
                <h2>Upload Images to {currentWorld.name}</h2>
                <ImageUpload 
                  worldId={currentWorld.id}
                  onUploadSuccess={handleUploadSuccess}
                  onUploadError={handleUploadError}
                  selectedFolder={selectedFolder}
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
                <h2>
                  Images in {currentWorld.name}
                  {selectedFolder && selectedFolder.id !== 'all' && ` - ${selectedFolder.name}`}
                </h2>
                <ImageGallery 
                  key={`${refreshGallery}-${currentWorld.id}-${selectedFolder?.id}`}
                  worldId={currentWorld.id}
                  onImageSelect={handleImageSelect}
                  selectedImageId={selectedImage?.id}
                  selectedFolder={selectedFolder}
                  showUpload={true}
                />
              </div>
            </div>
          </div>
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