import http from './http'

// Client for /api/voice — voices, spoken lines, and ambience. `status` is the one call
// that is always safe; everything else 404s while the voice layer is switched off.
const B = '/api/voice'
const LONG = { timeout: 180000 }

const voiceService = {
  status: () => http.get(`${B}/status`).then((r) => r.data.enabled).catch(() => false),
  voices: () => http.get(`${B}/voices`).then((r) => r.data.voices),
  setVoice: (nodeId, voiceId, voiceName) => http.post(`${B}/nodes/${nodeId}/voice`, { voice_id: voiceId, voice_name: voiceName }).then((r) => r.data),
  sayLine: (nodeId, text) => http.post(`${B}/nodes/${nodeId}/line`, { text }, LONG).then((r) => r.data),
  clearLine: (nodeId) => http.delete(`${B}/nodes/${nodeId}/line`).then((r) => r.data),
  setAmbience: (mapId, prompt) => http.post(`${B}/maps/${mapId}/ambience`, { prompt }, LONG).then((r) => r.data),
  clearAmbience: (mapId) => http.delete(`${B}/maps/${mapId}/ambience`).then((r) => r.data),
}

export default voiceService
