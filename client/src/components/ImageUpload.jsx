import React, { useState, useRef } from 'react'
import imageServiceBase64 from '../services/imageServiceBase64'

function ImageUpload({ worldId, onUploadSuccess, onUploadError, multiple = true, accept = "image/*", selectedFolder = null }) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [uploadQueue, setUploadQueue] = useState([])
  const [currentUpload, setCurrentUpload] = useState(null)
  const fileInputRef = useRef(null)

  const handleFileSelect = (files) => {
    if (!files || files.length === 0) return

    if (multiple) {
      // Handle multiple files
      const validFiles = Array.from(files).filter(file => {
        const validation = imageServiceBase64.validateImage(file)
        if (!validation.valid) {
          if (onUploadError) onUploadError(`${file.name}: ${validation.error}`)
          return false
        }
        return true
      })
      
      if (validFiles.length > 0) {
        uploadMultipleFiles(validFiles)
      }
    } else {
      // Handle single file (original behavior)
      const file = files[0]
      uploadFile(file)
    }
  }

  const uploadMultipleFiles = async (files) => {
    setUploading(true)
    setUploadQueue(files)
    
    let successCount = 0
    let errorCount = 0
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setCurrentUpload({ file: file.name, index: i + 1, total: files.length })
      setProgress(((i) / files.length) * 100)
      
      try {
        await uploadSingleFile(file)
        successCount++
      } catch (error) {
        errorCount++
        if (onUploadError) onUploadError(`${file.name}: ${error.message}`)
      }
    }
    
    setUploading(false)
    setProgress(0)
    setCurrentUpload(null)
    setUploadQueue([])
    
    // Call success callback with summary
    if (onUploadSuccess) {
      onUploadSuccess({
        multiple: true,
        successCount,
        errorCount,
        total: files.length
      })
    }
  }

  const uploadSingleFile = async (file) => {
    // Auto-assign folder tag if a folder is selected
    let folderTag = ''
    if (selectedFolder && selectedFolder.id !== 'all' && selectedFolder.id !== 'uncategorized') {
      const folderTagMap = {
        'characters': 'characters',
        'locations': 'locations', 
        'items': 'items',
        'maps': 'maps'
      }
      folderTag = folderTagMap[selectedFolder.id] || selectedFolder.id
    }
    
    return await imageServiceBase64.uploadImage(
      file, 
      worldId,
      '', // altText - can be added later
      folderTag // auto-assign folder tag
    )
  }

  const uploadFile = async (file) => {
    // Validate file
    const validation = imageServiceBase64.validateImage(file)
    if (!validation.valid) {
      if (onUploadError) onUploadError(validation.error)
      return
    }

    setUploading(true)
    setProgress(0)

    try {
      const result = await uploadSingleFile(file)
      if (onUploadSuccess) onUploadSuccess(result.image)
      
    } catch (error) {
      if (onUploadError) onUploadError(error.message || 'Upload failed')
    } finally {
      setUploading(false)
      setProgress(0)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    
    const files = Array.from(e.dataTransfer.files)
    handleFileSelect(files)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setDragOver(false)
  }

  const handleInputChange = (e) => {
    const files = Array.from(e.target.files)
    handleFileSelect(files)
  }

  const openFileDialog = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="image-upload">
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleInputChange}
        style={{ display: 'none' }}
        disabled={uploading}
      />
      
      <div 
        className={`upload-area ${dragOver ? 'drag-over' : ''} ${uploading ? 'uploading' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={openFileDialog}
      >
        {uploading ? (
          <div className="upload-progress">
            <div className="progress-icon">📤</div>
            {currentUpload ? (
              <>
                <div className="progress-text">
                  Uploading {currentUpload.index} of {currentUpload.total}: {currentUpload.file}
                </div>
                <div className="progress-subtext">
                  {Math.round(progress)}% complete
                </div>
              </>
            ) : (
              <div className="progress-text">Uploading... {Math.round(progress)}%</div>
            )}
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>
        ) : (
          <div className="upload-prompt">
            <div className="upload-icon">🖼️</div>
            <div className="upload-text">
              <strong>Click to upload</strong> or drag and drop
            </div>
            <div className="upload-subtext">
              {multiple ? 'Select multiple images •' : ''} PNG, JPG, GIF, WebP up to 10MB each
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ImageUpload