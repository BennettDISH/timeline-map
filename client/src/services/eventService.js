import axios from 'axios'

const API_BASE = '/api/events'

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

const eventService = {
  // Get all events for a map
  async getEvents(mapId) {
    try {
      const api = createAuthAPI()
      const response = await api.get(`/?mapId=${mapId}`)
      return response.data
    } catch (error) {
      throw error.response?.data || { message: 'Failed to fetch events' }
    }
  },

  // Get specific event by ID
  async getEvent(id) {
    try {
      const api = createAuthAPI()
      const response = await api.get(`/${id}`)
      return response.data
    } catch (error) {
      throw error.response?.data || { message: 'Failed to fetch event' }
    }
  },

  // Create new event/node
  async createEvent(eventData) {
    try {
      const api = createAuthAPI()
      const response = await api.post('/', eventData)
      return response.data
    } catch (error) {
      throw error.response?.data || { message: 'Failed to create event' }
    }
  },

  // Update event
  async updateEvent(id, eventData) {
    try {
      const api = createAuthAPI()
      const response = await api.put(`/${id}`, eventData)
      return response.data
    } catch (error) {
      throw error.response?.data || { message: 'Failed to update event' }
    }
  },

  // Delete event
  async deleteEvent(id) {
    try {
      const api = createAuthAPI()
      const response = await api.delete(`/${id}`)
      return response.data
    } catch (error) {
      throw error.response?.data || { message: 'Failed to delete event' }
    }
  }
}

export default eventService