import React, { useState } from 'react'
import '../styles/imageSelector.scss'

function ImageSelector({ 
  images, 
  selectedImageId, 
  onImageSelect, 
  disabled = false, 
  placeholder = "Choose an image...",
  showPreview = false 
}) {
  const [isOpen, setIsOpen] = useState(false)
  
  const selectedImage = images.find(img => img.id === parseInt(selectedImageId))
  
  const handleImageSelect = (imageId) => {
    onImageSelect(imageId)
    setIsOpen(false)
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
            {images.length === 0 ? (
              <div className="no-images">
                <p>No images available</p>
              </div>
            ) : (
              <div className="image-grid">
                {images.map((image) => (
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