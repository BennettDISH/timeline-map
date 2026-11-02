import http from './http'

// Client for /api/voice — voices, spoken lines, and ambience. `status` is the one call
// that is always safe; everything else 404s while the voice layer is switched off.
const B = '/api/voice'
const LONG = { timeout: 180000 }
// each call that can spend a use tells whoever shows the count, once it is over (spent or refused)
const listeners = new Set()
const spends = (call) => call.finally(() => { for (const fn of listeners) fn() })

const voiceService = {
  status: () => http.get(`${B}/status`).then((r) => r.data).catch(() => ({ enabled: false })),
  onSpend: (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
  voices: () => http.get(`${B}/voices`).then((r) => r.data.voices),
  setVoice: (nodeId, voiceId, voiceName, voiceStyle) =>
    http.post(`${B}/nodes/${nodeId}/voice`, { voice_id: voiceId, voice_name: voiceName, ...(voiceStyle !== undefined ? { voice_style: voiceStyle } : {}) }).then((r) => r.data),
  sayLine: (nodeId, text, style) => spends(http.post(`${B}/nodes/${nodeId}/line`, { text, ...(style != null ? { voice_style: style } : {}) }, LONG).then((r) => r.data)),
  clearLine: (nodeId) => http.delete(`${B}/nodes/${nodeId}/line`).then((r) => r.data),
  setAmbience: (mapId, prompt) => spends(http.post(`${B}/maps/${mapId}/ambience`, { prompt }, LONG).then((r) => r.data)),
  clearAmbience: (mapId) => http.delete(`${B}/maps/${mapId}/ambience`).then((r) => r.data),
}

export default voiceService
