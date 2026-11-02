import { readPref, writePref } from '../hooks/prefs'
import { GameAudio } from './audio'
import { SOUND_NAMES } from './names'

export { SOUND_NAMES, BEDS, CUES } from './names'
export const MANIFEST_URL = '/audio/manifest.json'

let audio = null
let loading = false

/** The one GameAudio of the page. Asking for it loads nothing and opens no sound: see `loadStock`. */
export function getAudio() {
  if (!audio) {
    audio = new GameAudio({
      names: new Set(SOUND_NAMES),
      prefsKey: 'atlas_audio_prefs',
      read: (key) => readPref(key),
      write: (key, value) => writePref(key, value),
    })
  }
  return audio
}

/**
 * Get the stock sounds ready, once the DM has chosen one: the manifest and the first-gesture
 * listeners. A page that has already had its gesture (a silent map, then a tap to this one) opens
 * the sound at once. A silent page never calls this, so it opens no sound and fetches no file.
 */
export function loadStock() {
  const a = getAudio()
  if (!loading) { loading = true; a.use(MANIFEST_URL) }
  if (typeof navigator !== 'undefined' && navigator.userActivation?.hasBeenActive) a.unlock()
}

/** Play a cue; silent, and harmless, when there is none to play. */
export function cue(name, opts) {
  try { return getAudio().play(name, opts) } catch (e) { return false }
}
