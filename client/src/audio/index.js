import { readPref, writePref } from '../hooks/prefs'
import { GameAudio } from './audio'
import { SOUND_NAMES } from './names'

export { SOUND_NAMES, BEDS, CUES } from './names'
export const MANIFEST_URL = '/audio/manifest.json'

let audio = null

/** The one GameAudio of the page; it starts listening for the first gesture the first time it is asked for. */
export function getAudio() {
  if (!audio) {
    audio = new GameAudio({
      names: new Set(SOUND_NAMES),
      prefsKey: 'atlas_audio_prefs',
      read: (key) => readPref(key),
      write: (key, value) => writePref(key, value),
    })
    audio.use(MANIFEST_URL)
  }
  return audio
}

/** Play a cue; silent, and harmless, when there is none to play. */
export function cue(name, opts) {
  try { return getAudio().play(name, opts) } catch (e) { return false }
}
