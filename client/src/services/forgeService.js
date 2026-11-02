import http from './http'

// Client for /api/forge — the per-world mind. The server answers 404 for everything but
// /status when the Forge is off, so `status` is the one call it is always safe to make.
// Generations paint images and can take minutes; those calls carry long explicit timeouts
// so the browser doesn't give up on a working forge.
const B = '/api/forge'
const LONG = { timeout: 600000 } // a full batch can paint 4 images — never abort a working forge
// each call that can spend a use tells whoever shows the count, once it is over (spent or refused)
const listeners = new Set()
const spends = (call) => call.finally(() => { for (const fn of listeners) fn() })

const forgeService = {
  // { enabled, allowance, perMessage }: allowance is today's for the signed-in account (null on a database blip)
  status: () => http.get(`${B}/status`).then((r) => r.data).catch(() => ({ enabled: false, allowance: null })),
  onSpend: (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
  getWorld: (worldId) => http.get(`${B}/worlds/${worldId}`).then((r) => r.data),
  patchMind: (worldId, data) => http.patch(`${B}/worlds/${worldId}/mind`, data).then((r) => r.data),
  chat: (worldId, message, context) => spends(http.post(`${B}/worlds/${worldId}/chat`, { message, context }, LONG).then((r) => r.data)),
  keepBatch: (worldId, id) => http.post(`${B}/worlds/${worldId}/batches/${id}/keep`).then((r) => r.data),
  discardBatch: (worldId, id) => http.post(`${B}/worlds/${worldId}/batches/${id}/discard`).then((r) => r.data),
  allowAsks: (worldId, id) => http.post(`${B}/worlds/${worldId}/batches/${id}/allow`).then((r) => r.data),
  refuseAsks: (worldId, id) => http.post(`${B}/worlds/${worldId}/batches/${id}/refuse`).then((r) => r.data),
  nodeArt: (nodeId, guidance) => spends(http.post(`${B}/nodes/${nodeId}/art`, { guidance }, LONG).then((r) => r.data)),
  // with startTime the painting becomes a new timed period's art from then on, not the base
  mapBackdrop: (mapId, guidance, startTime) => spends(http.post(`${B}/maps/${mapId}/backdrop`, { guidance, ...(startTime != null ? { start_time: startTime } : {}) }, LONG).then((r) => r.data)),
}

export default forgeService
