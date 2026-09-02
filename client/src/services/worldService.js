import http from './http'

const API_BASE = '/api/worlds'

const worldService = {
  // Get all worlds for current user
  async getWorlds() {
    try {
      const response = await http.get(`${API_BASE}/`)
      return response.data
    } catch (error) {
      throw error.response?.data || { message: 'Failed to fetch worlds' }
    }
  },

  // Get specific world by ID
  async getWorld(id) {
    try {
      const response = await http.get(`${API_BASE}/${id}`)
      return response.data
    } catch (error) {
      throw error.response?.data || { message: 'Failed to fetch world' }
    }
  },

  // Create new world
  async createWorld(worldData) {
    try {
      const response = await http.post(`${API_BASE}/`, worldData)
      return response.data
    } catch (error) {
      throw error.response?.data || { message: 'Failed to create world' }
    }
  },

  // Delete world
  async deleteWorld(id) {
    try {
      const response = await http.delete(`${API_BASE}/${id}`)
      return response.data
    } catch (error) {
      throw error.response?.data || { message: 'Failed to delete world' }
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
  },

  // Last map the user had open — "/" resumes there on the next visit
  getLastLocation() {
    try {
      const loc = JSON.parse(localStorage.getItem('atlas_last_location'))
      return loc && loc.worldId && loc.mapId ? loc : null
    } catch (error) {
      return null
    }
  },

  setLastLocation(worldId, mapId) {
    try {
      localStorage.setItem('atlas_last_location', JSON.stringify({ worldId, mapId }))
    } catch (error) {
      // storage unavailable — resuming is a convenience, not a requirement
    }
  },

  clearLastLocation(worldId) {
    const loc = this.getLastLocation()
    if (loc && String(loc.worldId) === String(worldId)) {
      localStorage.removeItem('atlas_last_location')
    }
  }
}

export default worldService