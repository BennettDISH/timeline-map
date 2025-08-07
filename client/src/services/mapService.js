import axios from 'axios'

const API_BASE = '/api/maps'

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

const mapService = {
  // Get all maps for a world
  async getMaps(worldId, parentMapId = null) {
    try {
      const api = createAuthAPI()
      const params = new URLSearchParams()
      params.append('world_id', worldId)
      if (parentMapId) params.append('parent_map_id', parentMapId)
      
      const response = await api.get(`/?${params}`)
      return response.data
    } catch (error) {
      throw error.response?.data || { message: 'Failed to fetch maps' }
    }
  },

  // Get specific map by ID
  async getMap(id) {
    try {
      const api = createAuthAPI()
      const response = await api.get(`/${id}`)
      return response.data
    } catch (error) {
      throw error.response?.data || { message: 'Failed to fetch map' }
    }
  },

  // Create new map
  async createMap(mapData) {
    try {
      const api = createAuthAPI()
      const response = await api.post('/', mapData)
      return response.data
    } catch (error) {
      throw error.response?.data || { message: 'Failed to create map' }
    }
  },

  // Update map
  async updateMap(id, mapData) {
    try {
      const api = createAuthAPI()
      const response = await api.put(`/${id}`, mapData)
      return response.data
    } catch (error) {
      throw error.response?.data || { message: 'Failed to update map' }
    }
  },

  // Delete map
  async deleteMap(id) {
    try {
      const api = createAuthAPI()
      const response = await api.delete(`/${id}`)
      return response.data
    } catch (error) {
      throw error.response?.data || { message: 'Failed to delete map' }
    }
  }
}

export default mapService