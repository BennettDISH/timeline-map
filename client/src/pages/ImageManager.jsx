import React, { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import ImageUpload from '../components/ImageUpload'
import ImageGallery from '../components/ImageGallery'
import WorldSelector from '../components/WorldSelector'
import worldService from '../services/worldService'
import imageServiceBase64 from '../services/imageServiceBase64'

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
      // Get all images to calculate folder counts
      const allImagesResult = await imageServiceBase64.getImages({ worldId, limit: 1000 })
      const allImages = allImagesResult.images || []
      
      // Calculate counts for each folder
      const folderCounts = {
        all: allImages.length,
        characters: 0,
        locations: 0,
        items: 0,
        maps: 0,
        uncategorized: 0
      }
      
      allImages.forEach(image => {
        const tags = image.tags ? image.tags.split(',').map(t => t.trim().toLowerCase()) : []
        let categorized = false
        
        if (tags.includes('characters')) {
          folderCounts.characters++
          categorized = true
        }
        if (tags.includes('locations')) {
          folderCounts.locations++
          categorized = true
        }
        if (tags.includes('items')) {
          folderCounts.items++
          categorized = true
        }
        if (tags.includes('maps')) {
          folderCounts.maps++
          categorized = true
        }
        
        // If image has no folder tags, count as uncategorized
        if (!categorized) {
          folderCounts.uncategorized++
        }
      })
      
      const folders = [
        { id: 'all', name: 'All Images', count: folderCounts.all },
        { id: 'characters', name: 'Characters', count: folderCounts.characters },
        { id: 'locations', name: 'Locations', count: folderCounts.locations },
        { id: 'items', name: 'Items & Objects', count: folderCounts.items },
        { id: 'maps', name: 'Maps', count: folderCounts.maps },
        { id: 'uncategorized', name: 'Uncategorized', count: folderCounts.uncategorized }
      ]
      
      setFolders(folders)
    } catch (error) {
      console.error('Failed to load folders:', error)
      // Fallback to empty folders if API call fails
      const fallbackFolders = [
        { id: 'all', name: 'All Images', count: 0 },
        { id: 'characters', name: 'Characters', count: 0 },
        { id: 'locations', name: 'Locations', count: 0 },
        { id: 'items', name: 'Items & Objects', count: 0 },
        { id: 'maps', name: 'Maps', count: 0 },
        { id: 'uncategorized', name: 'Uncategorized', count: 0 }
      ]
      setFolders(fallbackFolders)
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

  const moveImageToFolder = async (imageId, folderId) => {
    try {
      // Map folder IDs to tags
      const folderTagMap = {
        'characters': 'characters',
        'locations': 'locations', 
        'items': 'items',
        'maps': 'maps',
        'uncategorized': ''
      }
      
      const newTag = folderTagMap[folderId] || folderId
      
      // Get current image to preserve other properties
      const currentImage = await imageServiceBase64.getImage(imageId)
      
      // Update the image's tags, replacing any existing folder tags
      const existingTags = currentImage.tags ? currentImage.tags.split(',').map(t => t.trim()) : []
      
      // Remove existing folder tags
      const nonFolderTags = existingTags.filter(tag => 
        !['characters', 'locations', 'items', 'maps'].includes(tag)
      )
      
      // Add new folder tag if it's not uncategorized
      const updatedTags = newTag ? [...nonFolderTags, newTag] : nonFolderTags
      
      // Update the image with new tags
      await imageServiceBase64.updateImage(imageId, {
        tags: updatedTags.join(', ')
      })
      
      // Update local state to reflect the change
      if (selectedImage && selectedImage.id === imageId) {
        setSelectedImage(prev => ({
          ...prev,
          tags: updatedTags
        }))
      }
      
      // Refresh the gallery to show changes
      setRefreshGallery(prev => prev + 1)
      
      // Update folder counts
      await loadFolders(currentWorld.id)
      
      // Show success message
      const folderName = folders.find(f => f.id === folderId)?.name || 'folder'
      setUploadSuccess(`Image moved to ${folderName}`)
      setTimeout(() => setUploadSuccess(''), 3000)
      
    } catch (error) {
      console.error('Error moving image:', error)
      setUploadError(`Failed to move image: ${error.message}`)
      setTimeout(() => setUploadError(''), 5000)
    }
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
                
                {/* Folder Assignment */}
                <div className="folder-assignment">
                  <p><strong>Move to Folder:</strong></p>
                  <div className="folder-buttons">
                    {folders.filter(f => f.id !== 'all').map(folder => (
                      <button
                        key={folder.id}
                        className="folder-move-btn"
                        onClick={() => moveImageToFolder(selectedImage.id, folder.id)}
                        title={`Move to ${folder.name}`}
                      >
                        <span className="folder-icon">
                          {folder.id === 'characters' ? '👤' :
                           folder.id === 'locations' ? '🗺️' :
                           folder.id === 'items' ? '⚔️' :
                           folder.id === 'maps' ? '🗾' :
                           folder.id === 'uncategorized' ? '📄' : '📁'}
                        </span>
                        {folder.name}
                      </button>
                    ))}
                  </div>
                </div>
                
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