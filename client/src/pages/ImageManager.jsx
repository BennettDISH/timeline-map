import React, { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import ImageUpload from '../components/ImageUpload'
import ImageGallery from '../components/ImageGallery'
import worldService from '../services/worldService'
import imageServiceBase64 from '../services/imageServiceBase64'
import imageFolderService from '../services/imageFolderService'

function ImageManager() {
  const [searchParams] = useSearchParams()
  const [selectedImage, setSelectedImage] = useState(null)
  const [uploadSuccess, setUploadSuccess] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [refreshGallery, setRefreshGallery] = useState(0)
  const [currentWorld, setCurrentWorld] = useState(null)
  const [selectedFolder, setSelectedFolder] = useState(null)
  const [worldFolders, setWorldFolders] = useState([]) // World-level organization
  const [selectedWorldFolder, setSelectedWorldFolder] = useState(null)
  const [categoryFolders, setCategoryFolders] = useState([]) // Category sub-folders
  const [showNewFolderForm, setShowNewFolderForm] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [allWorlds, setAllWorlds] = useState([])
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [customFolders, setCustomFolders] = useState([])
  const [selectedCustomFolder, setSelectedCustomFolder] = useState(null)

  useEffect(() => {
    loadAllWorlds()
    // Auto-select world from URL or storage
    const worldIdFromUrl = searchParams.get('world')
    const worldFromStorage = worldService.getCurrentWorld()
    
    if (worldIdFromUrl) {
      loadWorldById(worldIdFromUrl)
    } else if (worldFromStorage) {
      setCurrentWorld(worldFromStorage)
      setSelectedWorldFolder({ id: worldFromStorage.id, name: worldFromStorage.name })
    }
  }, [searchParams])

  const loadAllWorlds = async () => {
    try {
      const result = await worldService.getWorlds()
      setAllWorlds(result.worlds)
      
      // Create world folders with image counts
      const worldFoldersWithCounts = await Promise.all(
        result.worlds.map(async (world) => {
          try {
            const imagesResult = await imageServiceBase64.getImages({ worldId: world.id, limit: 1000 })
            return {
              id: world.id,
              name: world.name,
              count: imagesResult.images?.length || 0,
              type: 'world'
            }
          } catch (error) {
            return {
              id: world.id,
              name: world.name,
              count: 0,
              type: 'world'
            }
          }
        })
      )
      
      setWorldFolders(worldFoldersWithCounts)
    } catch (error) {
      console.error('Failed to load worlds:', error)
    }
  }

  const loadWorldById = async (worldId) => {
    try {
      const result = await worldService.getWorld(worldId)
      setCurrentWorld(result.world)
      worldService.setCurrentWorld(result.world)
      setSelectedWorldFolder({ id: result.world.id, name: result.world.name })
      await loadCategoryFolders(worldId)
      await loadCustomFolders(worldId)
    } catch (error) {
      console.error('Failed to load world:', error)
    }
  }

  const handleUploadSuccess = (result) => {
    if (result.multiple) {
      // Handle multiple upload result
      const { successCount, errorCount, total } = result
      if (errorCount === 0) {
        setUploadSuccess(`Successfully uploaded all ${successCount} images!`)
      } else {
        setUploadSuccess(`Uploaded ${successCount} of ${total} images (${errorCount} failed)`)
      }
    } else {
      // Handle single upload result  
      setUploadSuccess(`Successfully uploaded: ${result.originalName}`)
    }
    
    setUploadError('')
    setRefreshGallery(prev => prev + 1) // Trigger gallery refresh
    
    // Clear success message after 5 seconds for multiple uploads
    setTimeout(() => setUploadSuccess(''), result.multiple ? 5000 : 3000)
  }

  const handleUploadError = (error) => {
    setUploadError(error)
    setUploadSuccess('')
  }

  const handleWorldFolderSelect = async (worldFolder) => {
    setSelectedWorldFolder(worldFolder)
    setSelectedFolder(null) // Clear category folder selection
    setSelectedImage(null) // Clear image selection
    
    // Load the world and its category folders
    await loadWorldById(worldFolder.id)
    setRefreshGallery(prev => prev + 1)
  }

  const loadCustomFolders = async (worldId) => {
    try {
      const result = await imageFolderService.getFolders(worldId)
      setCustomFolders(result.folders || [])
    } catch (error) {
      console.error('Failed to load custom folders:', error)
      setCustomFolders([])
    }
  }

  const loadCategoryFolders = async (worldId) => {
    try {
      // Get all images for this world to calculate folder counts
      const allImagesResult = await imageServiceBase64.getImages({ worldId, limit: 1000 })
      const allImages = allImagesResult.images || []
      
      // Calculate counts for each category folder
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
      
      const categoryFolders = [
        { id: 'all', name: 'All Images', count: folderCounts.all, type: 'category' },
        { id: 'characters', name: 'Characters', count: folderCounts.characters, type: 'category' },
        { id: 'locations', name: 'Locations', count: folderCounts.locations, type: 'category' },
        { id: 'items', name: 'Items & Objects', count: folderCounts.items, type: 'category' },
        { id: 'maps', name: 'Maps', count: folderCounts.maps, type: 'category' },
        { id: 'uncategorized', name: 'Uncategorized', count: folderCounts.uncategorized, type: 'category' }
      ]
      
      setCategoryFolders(categoryFolders)
      
      // Auto-select "All Images" if no folder is selected
      if (!selectedFolder) {
        setSelectedFolder(categoryFolders[0])
      }
    } catch (error) {
      console.error('Failed to load category folders:', error)
      // Fallback to empty folders if API call fails
      const fallbackFolders = [
        { id: 'all', name: 'All Images', count: 0, type: 'category' },
        { id: 'characters', name: 'Characters', count: 0, type: 'category' },
        { id: 'locations', name: 'Locations', count: 0, type: 'category' },
        { id: 'items', name: 'Items & Objects', count: 0, type: 'category' },
        { id: 'maps', name: 'Maps', count: 0, type: 'category' },
        { id: 'uncategorized', name: 'Uncategorized', count: 0, type: 'category' }
      ]
      setCategoryFolders(fallbackFolders)
    }
  }

  const createFolder = async () => {
    if (!newFolderName.trim() || !currentWorld) return
    
    try {
      const folderData = {
        name: newFolderName.trim(),
        world_id: currentWorld.id,
        parent_id: selectedCustomFolder?.id || null,
        icon: '📁',
        color: '#4CAF50'
      }
      
      await imageFolderService.createFolder(folderData)
      await loadCustomFolders(currentWorld.id)
      
      setNewFolderName('')
      setShowNewFolderForm(false)
      setUploadSuccess(`Folder "${newFolderName}" created successfully`)
      setTimeout(() => setUploadSuccess(''), 3000)
    } catch (error) {
      console.error('Error creating folder:', error)
      setUploadError(`Failed to create folder: ${error.message}`)
      setTimeout(() => setUploadError(''), 5000)
    }
  }

  const handleCategoryFolderSelect = (folder) => {
    setSelectedFolder(folder)
    setSelectedCustomFolder(null) // Clear custom folder selection
    setSelectedImage(null) // Clear image selection when changing folders
    setRefreshGallery(prev => prev + 1) // Trigger gallery refresh with folder filter
  }

  const handleCustomFolderSelect = (folder) => {
    setSelectedCustomFolder(folder)
    setSelectedFolder(null) // Clear category folder selection
    setSelectedImage(null) // Clear image selection when changing folders
    setRefreshGallery(prev => prev + 1) // Trigger gallery refresh with folder filter
  }

  const handleImageSelect = (image) => {
    setSelectedImage(image)
  }

  const renderFolderTree = (folder, depth) => {
    const isSelected = selectedCustomFolder?.id === folder.id
    const hasChildren = folder.children && folder.children.length > 0
    
    return (
      <div key={folder.id} className="folder-tree-item">
        <div 
          className={`custom-folder-item ${isSelected ? 'active' : ''}`}
          style={{ paddingLeft: `${depth * 1.2 + 0.6}rem` }}
          onClick={() => handleCustomFolderSelect(folder)}
        >
          <span className="folder-icon">{folder.icon}</span>
          <span className="folder-name">{folder.name}</span>
          {hasChildren && <span className="folder-children-count">({folder.children.length})</span>}
        </div>
        
        {hasChildren && (
          <div className="folder-children">
            {folder.children.map(child => renderFolderTree(child, depth + 1))}
          </div>
        )}
      </div>
    )
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
      
      // Update folder counts for current world
      if (currentWorld) {
        await loadCategoryFolders(currentWorld.id)
        await loadAllWorlds() // Update world folder counts too
      }
      
      // Show success message
      const folderName = categoryFolders.find(f => f.id === folderId)?.name || 'folder'
      setUploadSuccess(`Image moved to ${folderName}`)
      setTimeout(() => setUploadSuccess(''), 3000)
      
    } catch (error) {
      console.error('Error moving image:', error)
      setUploadError(`Failed to move image: ${error.message}`)
      setTimeout(() => setUploadError(''), 5000)
    }
  }

  const handleBulkAction = async (action, data) => {
    if (action === 'move') {
      const { imageIds, folderId } = data
      
      try {
        let successCount = 0
        let errorCount = 0
        
        for (const imageId of imageIds) {
          try {
            await moveImageToFolder(imageId, folderId)
            successCount++
          } catch (error) {
            errorCount++
            console.error(`Failed to move image ${imageId}:`, error)
          }
        }
        
        // Update folder counts
        if (currentWorld) {
          await loadCategoryFolders(currentWorld.id)
          await loadAllWorlds()
        }
        
        // Show success message
        const folderName = categoryFolders.find(f => f.id === folderId)?.name || 'folder'
        if (errorCount === 0) {
          setUploadSuccess(`Successfully moved ${successCount} images to ${folderName}`)
        } else {
          setUploadSuccess(`Moved ${successCount} of ${imageIds.length} images to ${folderName} (${errorCount} failed)`)
        }
        setTimeout(() => setUploadSuccess(''), 5000)
        
      } catch (error) {
        setUploadError(`Bulk move failed: ${error.message}`)
        setTimeout(() => setUploadError(''), 5000)
      }
    }
  }

  const copyImageUrl = () => {
    if (selectedImage) {
      navigator.clipboard.writeText(selectedImage.url)
      alert('Image URL copied to clipboard!')
    }
  }

  return (
    <div className="image-manager-new">
      <div className="page-header">
        <div className="header-content">
          <h1>📁 Image Library</h1>
          <Link to="/dashboard" className="back-link">← Back to Dashboard</Link>
        </div>
      </div>

      <div className="library-layout">
        {/* Sidebar with world folders and category folders */}
        <div className={`library-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
          {/* Sidebar Toggle */}
          <div className="sidebar-toggle">
            <button 
              className="toggle-btn"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? '▶️' : '◀️'}
            </button>
          </div>

          {!sidebarCollapsed && (
            <>
              {/* World Folders */}
              <div className="world-folders-section">
                <h3>🌍 Worlds</h3>
                <div className="world-folders-list">
                  {worldFolders.map(worldFolder => (
                    <div 
                      key={worldFolder.id}
                      className={`world-folder-item ${selectedWorldFolder?.id === worldFolder.id ? 'active' : ''}`}
                      onClick={() => handleWorldFolderSelect(worldFolder)}
                    >
                      <span className="world-icon">🌍</span>
                      <span className="world-name">{worldFolder.name}</span>
                      <span className="world-count">({worldFolder.count})</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Category Folders (only show when a world is selected and sidebar not collapsed) */}
          {selectedWorldFolder && !sidebarCollapsed && (
            <div className="category-folders-section">
              <h4>📂 Categories</h4>
              <div className="category-folders-list">
                {categoryFolders.map(folder => (
                  <div 
                    key={folder.id}
                    className={`category-folder-item ${selectedFolder?.id === folder.id ? 'active' : ''}`}
                    onClick={() => handleCategoryFolderSelect(folder)}
                  >
                    <span className="category-icon">
                      {folder.id === 'all' ? '📁' : 
                       folder.id === 'characters' ? '👤' :
                       folder.id === 'locations' ? '🗺️' :
                       folder.id === 'items' ? '⚔️' :
                       folder.id === 'maps' ? '🗾' :
                       folder.id === 'uncategorized' ? '📄' : '📁'}
                    </span>
                    <span className="category-name">{folder.name}</span>
                    <span className="category-count">({folder.count})</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Custom Folders (only show when a world is selected and sidebar not collapsed) */}
          {selectedWorldFolder && !sidebarCollapsed && customFolders.length > 0 && (
            <div className="custom-folders-section">
              <div className="custom-folders-header">
                <h4>🗂️ Custom Folders</h4>
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
                    placeholder={selectedCustomFolder ? `New subfolder in ${selectedCustomFolder.name}...` : 'New folder name...'}
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

              <div className="custom-folders-list">
                {imageFolderService.buildFolderTree(customFolders).map(folder => 
                  renderFolderTree(folder, 0)
                )}
              </div>
            </div>
          )}

          {/* Add New Folder Button (when no custom folders exist) */}
          {selectedWorldFolder && !sidebarCollapsed && customFolders.length === 0 && (
            <div className="empty-custom-folders">
              <button 
                className="create-first-folder-btn"
                onClick={() => setShowNewFolderForm(true)}
              >
                ➕ Create Your First Folder
              </button>
              
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
            </div>
          )}
        </div>

        {/* Main Content Area */}
        <div className="library-main">
          {selectedWorldFolder ? (
            <>
              {/* Upload Section */}
              <div className="upload-section">
                <h2>📤 Upload to {selectedWorldFolder.name}</h2>
                <ImageUpload 
                  worldId={selectedWorldFolder.id}
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

              {/* Gallery Section */}
              <div className="gallery-section">
                <h2>
                  🖼️ Images 
                  {selectedFolder && selectedFolder.id !== 'all' && ` in ${selectedFolder.name}`}
                </h2>
                <ImageGallery 
                  key={`${refreshGallery}-${selectedWorldFolder.id}-${selectedFolder?.id}`}
                  worldId={selectedWorldFolder.id}
                  onImageSelect={handleImageSelect}
                  selectedImageId={selectedImage?.id}
                  selectedFolder={selectedFolder}
                  showUpload={true}
                  onBulkAction={handleBulkAction}
                  categoryFolders={categoryFolders}
                />
              </div>
            </>
          ) : (
            <div className="no-world-selected">
              <h2>Select a World</h2>
              <p>Choose a world from the sidebar to view and manage its images.</p>
            </div>
          )}
        </div>

        {/* Image Details Panel (when image is selected) */}
        {selectedImage && (
          <div className="image-details-panel">
            <div className="panel-header">
              <h3>🖼️ Image Details</h3>
              <button 
                className="close-panel-btn"
                onClick={() => setSelectedImage(null)}
                title="Close panel"
              >
                ✕
              </button>
            </div>
            
            <div className="panel-content">
              <div className="image-preview">
                <img src={selectedImage.url} alt={selectedImage.altText || selectedImage.originalName} />
              </div>
              
              <div className="image-info">
                <p><strong>Name:</strong> {selectedImage.originalName}</p>
                <p><strong>Size:</strong> {imageServiceBase64.formatFileSize(selectedImage.fileSize)}</p>
                <p><strong>Type:</strong> {selectedImage.mimeType}</p>
                <p><strong>Uploaded:</strong> {new Date(selectedImage.uploadedAt).toLocaleDateString()}</p>
                {selectedImage.altText && <p><strong>Alt Text:</strong> {selectedImage.altText}</p>}
                {selectedImage.tags && selectedImage.tags.length > 0 && (
                  <p><strong>Tags:</strong> {Array.isArray(selectedImage.tags) ? selectedImage.tags.join(', ') : selectedImage.tags}</p>
                )}
                
                {/* Folder Assignment */}
                <div className="folder-assignment">
                  <p><strong>Move to Category:</strong></p>
                  <div className="folder-buttons">
                    {categoryFolders.filter(f => f.id !== 'all').map(folder => (
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