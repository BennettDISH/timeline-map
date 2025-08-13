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
  const [worldFolders, setWorldFolders] = useState([]) // World-level organization
  const [selectedWorldFolder, setSelectedWorldFolder] = useState(null)
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
      loadCustomFolders(worldFromStorage.id)
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
      
      // Auto-select first world if none is currently selected
      if (!currentWorld && !selectedWorldFolder && result.worlds.length > 0) {
        const firstWorld = result.worlds[0]
        setCurrentWorld(firstWorld)
        setSelectedWorldFolder({ id: firstWorld.id, name: firstWorld.name })
        worldService.setCurrentWorld(firstWorld)
        await loadCustomFolders(firstWorld.id)
      }
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
    setSelectedCustomFolder(null) // Clear custom folder selection
    setSelectedImage(null) // Clear image selection
    
    // Load the world and its custom folders
    await loadWorldById(worldFolder.id)
    setRefreshGallery(prev => prev + 1)
  }

  const loadCustomFolders = async (worldId) => {
    try {
      const result = await imageFolderService.getFolders(worldId)
      
      // Get count of unassigned images
      const allImagesResult = await imageServiceBase64.getImages({ worldId, limit: 1000 })
      const allImages = allImagesResult.images || []
      const unassignedCount = allImages.filter(img => !img.folder_id).length
      
      // Create unassigned folder and combine with custom folders
      const unassignedFolder = {
        id: 'unassigned',
        name: 'Unassigned',
        icon: '📄',
        count: unassignedCount,
        isDefault: true
      }
      
      setCustomFolders([unassignedFolder, ...(result.folders || [])])
      
      // Auto-select unassigned folder if no folder is currently selected
      if (!selectedCustomFolder) {
        setSelectedCustomFolder(unassignedFolder)
      }
    } catch (error) {
      console.error('Failed to load custom folders:', error)
      setCustomFolders([])
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


  const handleCustomFolderSelect = (folder) => {
    setSelectedCustomFolder(folder)
    setSelectedImage(null) // Clear image selection when changing folders
    setRefreshGallery(prev => prev + 1) // Trigger gallery refresh with folder filter
  }

  const handleImageSelect = (image) => {
    setSelectedImage(image)
  }

  const deleteFolder = async (folderId, folderName) => {
    if (!confirm(`Are you sure you want to delete the folder "${folderName}"? All images in this folder will be moved to uncategorized.`)) {
      return
    }
    
    try {
      await imageFolderService.deleteFolder(folderId)
      await loadCustomFolders(currentWorld.id)
      
      // Clear selection if the deleted folder was selected
      if (selectedCustomFolder?.id === folderId) {
        setSelectedCustomFolder(null)
      }
      
      setUploadSuccess(`Folder "${folderName}" deleted successfully`)
      setTimeout(() => setUploadSuccess(''), 3000)
    } catch (error) {
      console.error('Error deleting folder:', error)
      setUploadError(`Failed to delete folder: ${error.message}`)
      setTimeout(() => setUploadError(''), 5000)
    }
  }

  const renderFolderTree = (folder, depth) => {
    const isSelected = selectedCustomFolder?.id === folder.id
    const hasChildren = folder.children && folder.children.length > 0
    const isUnassigned = folder.id === 'unassigned'
    
    return (
      <div key={folder.id} className="folder-tree-item">
        <div 
          className={`custom-folder-item ${isSelected ? 'active' : ''} ${isUnassigned ? 'unassigned-folder' : ''}`}
          style={{ paddingLeft: `${depth * 1.2 + 0.6}rem` }}
        >
          <div className="folder-main" onClick={() => handleCustomFolderSelect(folder)}>
            <span className="folder-icon">{folder.icon}</span>
            <span className="folder-name">{folder.name}</span>
            {hasChildren && <span className="folder-children-count">({folder.children.length})</span>}
            {folder.count !== undefined && !hasChildren && <span className="folder-count">({folder.count})</span>}
          </div>
          
          {!isUnassigned && (
            <div className="folder-actions">
              <button 
                className="folder-action-btn nest-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedCustomFolder(folder)
                  setShowNewFolderForm(true)
                }}
                title={`Create subfolder in ${folder.name}`}
              >
                📁+
              </button>
              <button 
                className="folder-action-btn delete-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  deleteFolder(folder.id, folder.name)
                }}
                title={`Delete ${folder.name}`}
              >
                🗑️
              </button>
            </div>
          )}
        </div>
        
        {hasChildren && (
          <div className="folder-children">
            {folder.children.map(child => renderFolderTree(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }


  const handleBulkAction = async (action, data) => {
    if (action === 'move') {
      const { imageIds, folderId } = data
      
      try {
        let successCount = 0
        let errorCount = 0
        
        for (const imageId of imageIds) {
          try {
            // Use the images API to set folder_id (null for unassigned)
            const folderIdToSet = folderId === 'unassigned' ? null : folderId
            await imageServiceBase64.updateImage(imageId, { folder_id: folderIdToSet })
            successCount++
          } catch (error) {
            errorCount++
            console.error(`Failed to move image ${imageId}:`, error)
          }
        }
        
        // Update folder counts and refresh
        if (currentWorld) {
          await loadCustomFolders(currentWorld.id)
          await loadAllWorlds()
        }
        
        // Find folder name
        let folderName = 'folder'
        if (folderId === 'unassigned') {
          folderName = 'Unassigned'
        } else {
          const findFolderName = (folders) => {
            for (const folder of folders) {
              if (folder.id === folderId) return folder.name
              if (folder.children) {
                const childName = findFolderName(folder.children)
                if (childName) return childName
              }
            }
            return null
          }
          const customFolderTree = imageFolderService.buildFolderTree(customFolders.filter(f => f.id !== 'unassigned'))
          folderName = findFolderName(customFolderTree) || 'folder'
        }
        
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
                  {selectedCustomFolder && (
                    <div className="parent-folder-info">
                      <span>Creating subfolder in: <strong>{selectedCustomFolder.name}</strong></span>
                      <button 
                        className="clear-parent-btn"
                        onClick={() => setSelectedCustomFolder(null)}
                        title="Create root folder instead"
                      >
                        ✕
                      </button>
                    </div>
                  )}
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
                    <button onClick={() => {setShowNewFolderForm(false); setNewFolderName(''); setSelectedCustomFolder(null)}} className="cancel-btn">✕</button>
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
                  {selectedCustomFolder && (
                    <div className="parent-folder-info">
                      <span>Creating subfolder in: <strong>{selectedCustomFolder.name}</strong></span>
                      <button 
                        className="clear-parent-btn"
                        onClick={() => setSelectedCustomFolder(null)}
                        title="Create root folder instead"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                  <input
                    type="text"
                    placeholder={selectedCustomFolder ? `New subfolder in ${selectedCustomFolder.name}...` : 'Folder name...'}
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && createFolder()}
                    autoFocus
                  />
                  <div className="folder-form-actions">
                    <button onClick={createFolder} className="create-btn">✓</button>
                    <button onClick={() => {setShowNewFolderForm(false); setNewFolderName(''); setSelectedCustomFolder(null)}} className="cancel-btn">✕</button>
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
                  selectedFolder={selectedCustomFolder}
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
                  {selectedCustomFolder && ` in ${selectedCustomFolder.name}`}
                </h2>
                <ImageGallery 
                  key={`${refreshGallery}-${selectedWorldFolder.id}-${selectedCustomFolder?.id}`}
                  worldId={selectedWorldFolder.id}
                  onImageSelect={handleImageSelect}
                  selectedImageId={selectedImage?.id}
                  selectedFolder={selectedCustomFolder}
                  showUpload={true}
                  onBulkAction={handleBulkAction}
                  customFolders={imageFolderService.buildFolderTree(customFolders)}
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
                
                {/* Custom Folder Assignment */}
                {customFolders.length > 0 && (
                  <div className="folder-assignment">
                    <p><strong>Move to Folder:</strong></p>
                    <div className="folder-buttons">
                      {imageFolderService.buildFolderTree(customFolders).map(folder => (
                        <button
                          key={folder.id}
                          className="folder-move-btn"
                          onClick={() => handleBulkAction('move', { imageIds: [selectedImage.id], folderId: folder.id })}
                          title={`Move to ${folder.name}`}
                        >
                          <span className="folder-icon">{folder.icon}</span>
                          {folder.name}
                        </button>
                      ))}
                      <button
                        className="folder-move-btn"
                        onClick={() => imageServiceBase64.updateImage(selectedImage.id, { folder_id: null }).then(() => setRefreshGallery(prev => prev + 1))}
                        title="Remove from folder"
                      >
                        <span className="folder-icon">📄</span>
                        Uncategorized
                      </button>
                    </div>
                  </div>
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