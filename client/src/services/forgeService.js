import http from './http'

// Client for /api/forge — the per-world mind. The server answers 404 for everything but
// /status when the Forge is off, so `status` is the one call it is always safe to make.
// Generations paint images and can take minutes; those calls carry long explicit timeouts
// so the browser doesn't give up on a working forge.
const B = '/api/forge'
const LONG = { timeout: 600000 } // a full batch can paint 4 images — never abort a working forge

const forgeService = {
  status: () => http.get(`${B}/status`).then((r) => r.data.enabled).catch(() => false),
  getWorld: (worldId) => http.get(`${B}/worlds/${worldId}`).then((r) => r.data),
  chat: (worldId, message) => http.post(`${B}/worlds/${worldId}/chat`, { message }, LONG).then((r) => r.data),
  keepBatch: (worldId, id) => http.post(`${B}/worlds/${worldId}/batches/${id}/keep`).then((r) => r.data),
  discardBatch: (worldId, id) => http.post(`${B}/worlds/${worldId}/batches/${id}/discard`).then((r) => r.data),
  nodeArt: (nodeId, guidance) => http.post(`${B}/nodes/${nodeId}/art`, { guidance }, LONG).then((r) => r.data),
  mapBackdrop: (mapId, guidance) => http.post(`${B}/maps/${mapId}/backdrop`, { guidance }, LONG).then((r) => r.data),
}

export default forgeService
