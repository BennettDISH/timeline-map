import axios from 'axios'

const API_BASE = '/api/worlds'

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

const worldService = {
  // Get all worlds for current user
  async getWorlds() {
    try {
      const api = createAuthAPI()
      const response = await api.get('/')
      return response.data
    } catch (error) {
      console.error('Get worlds error:', error)
      throw error.response?.data || { message: 'Failed to fetch worlds' }
    }
  },

  // Get specific world by ID
  async getWorld(id) {
    try {
      const api = createAuthAPI()
      const response = await api.get(`/${id}`)
      return response.data
    } catch (error) {
      console.error('Get world error:', error)
      throw error.response?.data || { message: 'Failed to fetch world' }
    }
  },

  // Create new world
  async createWorld(worldData) {
    try {
      const api = createAuthAPI()
      const response = await api.post('/', worldData)
      return response.data
    } catch (error) {
      console.error('Create world error:', error)
      throw error.response?.data || { message: 'Failed to create world' }
    }
  },

  // Update world
  async updateWorld(id, worldData) {
    try {
      const api = createAuthAPI()
      const response = await api.put(`/${id}`, worldData)
      return response.data
    } catch (error) {
      console.error('Update world error:', error)
      throw error.response?.data || { message: 'Failed to update world' }
    }
  },

  // Delete world
  async deleteWorld(id) {
    try {
      const api = createAuthAPI()
      const response = await api.delete(`/${id}`)
      return response.data
    } catch (error) {
      console.error('Delete world error:', error)
      throw error.response?.data || { message: 'Failed to delete world' }
    }
  },

  // Duplicate world
  async duplicateWorld(id, newName) {
    try {
      const api = createAuthAPI()
      const response = await api.post(`/${id}/duplicate`, { name: newName })
      return response.data
    } catch (error) {
      console.error('Duplicate world error:', error)
      throw error.response?.data || { message: 'Failed to duplicate world' }
    }
  },

  // Update world timeline settings
  async updateWorldTimeline(id, timelineData) {
    try {
      const api = createAuthAPI()
      const response = await api.put(`/${id}/timeline`, timelineData)
      return response.data
    } catch (error) {
      console.error('Update world timeline error:', error)
      throw error.response?.data || { message: 'Failed to update world timeline settings' }
    }
  },

  // Update world timeline position
  async updateTimelinePosition(id, currentTime) {
    try {
      const api = createAuthAPI()
      const response = await api.post(`/${id}/timeline/time`, { current_time: currentTime })
      return response.data
    } catch (error) {
      console.error('Update timeline position error:', error)
      throw error.response?.data || { message: 'Failed to update timeline position' }
    }
  },

  // Get/Set current world from localStorage
  getCurrentWorldId() {
    return localStorage.getItem('current_world_id')
  },

  setCurrentWorldId(worldId) {
    if (worldId) {
      localStorage.setItem('current_world_id', worldId)
    } else {
      localStorage.removeItem('current_world_id')
    }
  },

  getCurrentWorld() {
    const worldData = localStorage.getItem('current_world')
    return worldData ? JSON.parse(worldData) : null
  },

  setCurrentWorld(world) {
    if (world) {
      localStorage.setItem('current_world', JSON.stringify(world))
      this.setCurrentWorldId(world.id)
    } else {
      localStorage.removeItem('current_world')
      localStorage.removeItem('current_world_id')
    }
  }
}

export default worldService