import axios from 'axios'

// Client for the public Player View API. No auth header on purpose — the token in the
// URL is the whole capability, and the server filters everything before it leaves the DB.
const api = axios.create({ baseURL: '/api/share' })

const shareService = {
  getWorld: (token) => api.get(`/${token}/world`).then((r) => r.data.world),
  getMap: (token, mapId) => api.get(`/${token}/maps/${mapId}`).then((r) => r.data),
  getNode: (token, nodeId) => api.get(`/${token}/nodes/${nodeId}`).then((r) => r.data),
  locateNode: (token, nodeId) => api.get(`/${token}/nodes/${nodeId}/locate`).then((r) => r.data),
}

export default shareService
