import axios from 'axios'

const API_BASE = '/api/images'

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

const imageService = {
  // Upload image with progress tracking
  async uploadImage(file, altText = '', tags = '', onProgress = null) {
    try {
      const api = createAuthAPI()
      const formData = new FormData()
      formData.append('image', file)
      if (altText) formData.append('alt_text', altText)
      if (tags) formData.append('tags', tags)

      const response = await api.post('/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          if (onProgress) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total)
            onProgress(percentCompleted)
          }
        }
      })

      return response.data
    } catch (error) {
      console.error('Upload error:', error)
      throw error.response?.data || { message: 'Upload failed' }
    }
  },

  // Get all images with optional filtering
  async getImages(options = {}) {
    try {
      const api = createAuthAPI()
      const { tags, search, limit = 50, offset = 0 } = options
      
      const params = new URLSearchParams()
      if (tags) params.append('tags', tags)
      if (search) params.append('search', search)
      params.append('limit', limit)
      params.append('offset', offset)

      const response = await api.get(`/?${params}`)
      return response.data
    } catch (error) {
      console.error('Get images error:', error)
      throw error.response?.data || { message: 'Failed to fetch images' }
    }
  },

  // Get single image by ID
  async getImage(id) {
    try {
      const api = createAuthAPI()
      const response = await api.get(`/${id}`)
      return response.data
    } catch (error) {
      console.error('Get image error:', error)
      throw error.response?.data || { message: 'Failed to fetch image' }
    }
  },

  // Delete image
  async deleteImage(id) {
    try {
      const api = createAuthAPI()
      const response = await api.delete(`/${id}`)
      return response.data
    } catch (error) {
      console.error('Delete image error:', error)
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

export default imageService