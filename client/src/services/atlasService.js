import axios from 'axios'

// Client for the redesigned /api/atlas model (nodes / placements / links / nested maps).
const api = () => axios.create({
  baseURL: '/api/atlas',
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
})

const atlasService = {
  getWorld: (worldId) => api().get(`/worlds/${worldId}`).then((r) => r.data.world),
  getMaps: (worldId) => api().get(`/worlds/${worldId}/maps`).then((r) => r.data.maps),
  getNodes: (worldId) => api().get(`/worlds/${worldId}/nodes`).then((r) => r.data.nodes),
  patchWorld: (worldId, data) => api().patch(`/worlds/${worldId}`, data).then((r) => r.data),

  getMap: (mapId) => api().get(`/maps/${mapId}`).then((r) => r.data),
  patchMap: (mapId, data) => api().patch(`/maps/${mapId}`, data).then((r) => r.data),

  addNode: (mapId, data) => api().post(`/maps/${mapId}/nodes`, data).then((r) => r.data),
  placeNode: (mapId, data) => api().post(`/maps/${mapId}/placements`, data).then((r) => r.data),

  getNode: (id) => api().get(`/nodes/${id}`).then((r) => r.data),
  patchNode: (id, data) => api().patch(`/nodes/${id}`, data).then((r) => r.data),
  createInterior: (id, view) => api().post(`/nodes/${id}/interior`, { view }).then((r) => r.data),
  deleteNode: (id) => api().delete(`/nodes/${id}`).then((r) => r.data),

  patchPlacement: (id, data) => api().patch(`/placements/${id}`, data).then((r) => r.data),
  deletePlacement: (id) => api().delete(`/placements/${id}`).then((r) => r.data),

  addLink: (data) => api().post('/links', data).then((r) => r.data),
  deleteLink: (id) => api().delete(`/links/${id}`).then((r) => r.data),
}

export default atlasService
