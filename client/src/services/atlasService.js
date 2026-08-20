import http from './http'

// Client for the redesigned /api/atlas model (nodes / placements / links / nested maps).
// All calls go through the shared http instance: token attached, dead sessions bounced.
const B = '/api/atlas'

const atlasService = {
  getWorld: (worldId) => http.get(`${B}/worlds/${worldId}`).then((r) => r.data.world),
  getMaps: (worldId) => http.get(`${B}/worlds/${worldId}/maps`).then((r) => r.data.maps),
  getNodes: (worldId) => http.get(`${B}/worlds/${worldId}/nodes`).then((r) => r.data.nodes),
  patchWorld: (worldId, data) => http.patch(`${B}/worlds/${worldId}`, data).then((r) => r.data),
  createShare: (worldId) => http.post(`${B}/worlds/${worldId}/share`).then((r) => r.data),
  deleteShare: (worldId) => http.delete(`${B}/worlds/${worldId}/share`).then((r) => r.data),

  getMap: (mapId) => http.get(`${B}/maps/${mapId}`).then((r) => r.data),
  patchMap: (mapId, data) => http.patch(`${B}/maps/${mapId}`, data).then((r) => r.data),

  addNode: (mapId, data) => http.post(`${B}/maps/${mapId}/nodes`, data).then((r) => r.data),
  placeNode: (mapId, data) => http.post(`${B}/maps/${mapId}/placements`, data).then((r) => r.data),

  getNode: (id) => http.get(`${B}/nodes/${id}`).then((r) => r.data),
  locateNode: (id) => http.get(`${B}/nodes/${id}/locate`).then((r) => r.data),
  nodeImpact: (id) => http.get(`${B}/nodes/${id}/impact`).then((r) => r.data),
  patchNode: (id, data) => http.patch(`${B}/nodes/${id}`, data).then((r) => r.data),
  createInterior: (id, view) => http.post(`${B}/nodes/${id}/interior`, { view }).then((r) => r.data),
  deleteNode: (id) => http.delete(`${B}/nodes/${id}`).then((r) => r.data),

  patchPlacement: (id, data) => http.patch(`${B}/placements/${id}`, data).then((r) => r.data),
  deletePlacement: (id) => http.delete(`${B}/placements/${id}`).then((r) => r.data),

  addBackdrop: (mapId, data) => http.post(`${B}/maps/${mapId}/backdrops`, data).then((r) => r.data),
  patchBackdrop: (id, data) => http.patch(`${B}/backdrops/${id}`, data).then((r) => r.data),
  deleteBackdrop: (id) => http.delete(`${B}/backdrops/${id}`).then((r) => r.data),

  addEra: (worldId, data) => http.post(`${B}/worlds/${worldId}/eras`, data).then((r) => r.data),
  patchEra: (id, data) => http.patch(`${B}/eras/${id}`, data).then((r) => r.data),
  deleteEra: (id) => http.delete(`${B}/eras/${id}`).then((r) => r.data),

  addLink: (data) => http.post(`${B}/links`, data).then((r) => r.data),
  deleteLink: (id) => http.delete(`${B}/links/${id}`).then((r) => r.data),
}

export default atlasService
