import axios from 'axios'

const API_BASE = '/api/images-base64'

// Create axios instance with auth headers
const createAuthAPI = () => {
  const token = localStorage.getItem('auth_token')
  return axios.create({
    baseURL: API_BASE,
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
}

const imageServiceBase64 = {
  // Convert file to base64
  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => resolve(reader.result)
      reader.onerror = error => reject(error)
    })
  },

  // Upload image as base64 with progress tracking
  async uploadImage(file, worldId, altText = '', tags = '', onProgress = null) {
    try {
      if (onProgress) onProgress(10) // Converting to base64
      
      const base64Data = await this.fileToBase64(file)
      
      if (onProgress) onProgress(30) // Starting upload
      
      const api = createAuthAPI()
      const uploadData = {
        imageData: base64Data,
        originalName: file.name,
        world_id: worldId
      }
      
      if (altText) uploadData.alt_text = altText
      if (tags) uploadData.tags = tags

      if (onProgress) onProgress(60) // Uploading
      
      const response = await api.post('/upload', uploadData)
      
      if (onProgress) onProgress(100) // Complete
      
      return response.data
    } catch (error) {
      throw error.response?.data || { message: 'Upload failed' }
    }
  },

  // Get all images with optional filtering (reuse from regular image service)
  async getImages(options = {}) {
    try {
      // Use the regular images API for listing, but images will have base64 URLs
      const token = localStorage.getItem('auth_token')
      const api = axios.create({
        baseURL: '/api/images',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      const { worldId, tags, search, limit = 50, offset = 0, folderId, unassigned } = options
      
      const params = new URLSearchParams()
      if (worldId) params.append('world_id', worldId)
      if (tags) params.append('tags', tags)
      if (search) params.append('search', search)
      if (folderId) params.append('folder_id', folderId)
      if (unassigned) params.append('unassigned', 'true')
      params.append('limit', limit)
      params.append('offset', offset)

      const response = await api.get(`/?${params}`)
      return response.data
    } catch (error) {
      throw error.response?.data || { message: 'Failed to fetch images' }
    }
  },

  // Get single image by ID
  async getImage(id) {
    try {
      const token = localStorage.getItem('auth_token')
      const api = axios.create({
        baseURL: '/api/images',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      const response = await api.get(`/${id}`)
      return response.data
    } catch (error) {
      throw error.response?.data || { message: 'Failed to fetch image' }
    }
  },

  // Update image metadata (tags, alt text, etc.)
  async updateImage(id, updateData) {
    try {
      const token = localStorage.getItem('auth_token')
      const api = axios.create({
        baseURL: '/api/images',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      const response = await api.put(`/${id}`, updateData)
      return response.data
    } catch (error) {
      throw error.response?.data || { message: 'Failed to update image' }
    }
  },

  // Delete image
  async deleteImage(id) {
    try {
      const token = localStorage.getItem('auth_token')
      const api = axios.create({
        baseURL: '/api/images',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      const response = await api.delete(`/${id}`)
      return response.data
    } catch (error) {
      throw error.response?.data || { message: 'Failed to delete image' }
    }
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

export default imageServiceBase64