import React, { useState, useRef } from 'react'
import imageServiceBase64 from '../services/imageServiceBase64'

function ImageUpload({ worldId, onUploadSuccess, onUploadError, multiple = false, accept = "image/*" }) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)

  const handleFileSelect = (files) => {
    if (!files || files.length === 0) return

    const file = files[0] // For now, handle single file
    uploadFile(file)
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
      const result = await imageServiceBase64.uploadImage(
        file, 
        worldId,
        '', // altText - can be added later
        '', // tags - can be added later
        (progressPercent) => setProgress(progressPercent)
      )

      if (onUploadSuccess) onUploadSuccess(result.image)
      
    } catch (error) {
      console.error('Upload failed:', error)
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
            <div className="progress-text">Uploading... {progress}%</div>
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
              PNG, JPG, GIF, WebP up to 10MB
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ImageUpload