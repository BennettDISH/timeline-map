import http from './http'

// The one image client: upload, list, rename, move and delete through /api/images.
const API_BASE = '/api/images'

const imageService = {
  // Convert file to base64
  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => resolve(reader.result)
      reader.onerror = error => reject(error)
    })
  },

  // Upload an image (the bytes travel base64-encoded in a JSON body). onProgress(0..100)
  // follows the REAL transfer (the browser's upload progress), after a short read of the
  // file; folderId files it in one request.
  async uploadImage(file, worldId, { onProgress = null, folderId = null } = {}) {
    if (onProgress) onProgress(2)
    const base64Data = await this.fileToBase64(file)
    const uploadData = { imageData: base64Data, originalName: file.name, world_id: worldId }
    if (folderId != null) uploadData.folder_id = folderId
    const response = await http.post(`${API_BASE}/upload`, uploadData, {
      timeout: 180000, // a 10 MB image on a slow link
      onUploadProgress: (ev) => { if (onProgress && ev.total) onProgress(Math.max(2, Math.min(99, Math.round((ev.loaded / ev.total) * 100)))) },
    })
    if (onProgress) onProgress(100)
    return response.data
  },
  // many images at once, one request: file them under a folder (null = Unsorted), or delete them
  async moveImages(ids, folderId) {
    const response = await http.put('/api/images/bulk', { ids, folder_id: folderId })
    return response.data
  },
  async deleteImages(ids) {
    const response = await http.delete('/api/images/bulk', { data: { ids } })
    return response.data
  },

  // Get all images with optional filtering
  async getImages(options = {}) {
    try {
      const { worldId, search, limit = 50, offset = 0, folderId, unassigned } = options
      
      const params = new URLSearchParams()
      if (worldId) params.append('world_id', worldId)
      if (search) params.append('search', search)
      if (folderId) params.append('folder_id', folderId)
      if (unassigned) params.append('unassigned', 'true')
      params.append('limit', limit)
      params.append('offset', offset)

      const response = await http.get(`/api/images/?${params}`)
      return response.data
    } catch (error) {
      throw error // the same error shape everywhere: callers show errText(e, fallback)
    }
  },


  // Update image metadata (name, caption, folder)
  async updateImage(id, updateData) {
    const response = await http.put(`/api/images/${id}`, updateData)
    return response.data
  },

  // Delete image
  async deleteImage(id) {
    const response = await http.delete(`/api/images/${id}`)
    return response.data
  },

  // Validate image file
  validateImage(file) {
    const maxSize = 10 * 1024 * 1024 // 10MB
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
    
    if (!file) {
      return { valid: false, error: 'No file selected' }
    }

    if (file.size > maxSize) {
      return { valid: false, error: 'File size must be less than 10MB' }
    }

    if (!allowedTypes.includes(file.type)) {
      return { valid: false, error: 'File must be an image (JPEG, PNG, GIF, WebP)' }
    }

    return { valid: true }
  },

  // Format file size for display
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes'
    
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
}

export default imageService