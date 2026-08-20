import axios from 'axios'

// Client for the public Player View API. No auth header on purpose — the token in the
// URL is the whole capability, and the server filters everything before it leaves the DB.
const api = axios.create({ baseURL: '/api/share' })

// t: an optional moment in the revealed past (a player_visible era). The server validates
// it — anything outside a revealed era, or past canon, silently resolves to canon.
const shareService = {
  getWorld: (token) => api.get(`/${token}/world`).then((r) => r.data.world),
  getMap: (token, mapId, t, windowed) => api.get(`/${token}/maps/${mapId}`,
    { params: { ...(t != null ? { t } : {}), ...(windowed ? { window: 1 } : {}) } }).then((r) => r.data),
  getNode: (token, nodeId, t) => api.get(`/${token}/nodes/${nodeId}`, { params: t != null ? { t } : {} }).then((r) => r.data),
  locateNode: (token, nodeId, t) => api.get(`/${token}/nodes/${nodeId}/locate`, { params: t != null ? { t } : {} }).then((r) => r.data),
}

export default shareService
