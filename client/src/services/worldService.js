import http from './http'

const API_BASE = '/api/worlds'

const worldService = {
  // Get all worlds for current user
  async getWorlds() {
    const response = await http.get(`${API_BASE}/`)
    return response.data
  },


  // Create new world
  async createWorld(worldData) {
    const response = await http.post(`${API_BASE}/`, worldData)
    return response.data
  },

  // Delete world
  async deleteWorld(id) {
    const response = await http.delete(`${API_BASE}/${id}`)
    return response.data
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