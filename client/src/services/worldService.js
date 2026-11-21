import http from './http'
import { isViewing } from './authService'

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


  // Last map the user had open — "/" resumes there on the next visit. It is this browser's
  // account's: while the admin views as someone it is neither read (the dashboard instead) nor
  // written, so Exit finds the admin's own still there.
  getLastLocation() {
    if (isViewing()) return null
    try {
      const loc = JSON.parse(localStorage.getItem('atlas_last_location'))
      return loc && loc.worldId && loc.mapId ? loc : null
    } catch (error) {
      return null
    }
  },

  setLastLocation(worldId, mapId) {
    if (isViewing()) return
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