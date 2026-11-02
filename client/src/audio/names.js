// Every sound the Atlas asks for. The manifest (client/public/audio/manifest.json) may name no
// others; server/test/sound.test.js holds the two together, and server/lib/stockBeds.js to BEDS.
// Plain data, no imports, so a test can read it.

/** The ambience beds: long seamless loops of a kind of place, the DM's library for a map. */
export const BEDS = Object.freeze(['amb.wilds', 'amb.forest', 'amb.town', 'amb.sea', 'amb.dungeon', 'amb.mountain', 'amb.storm'])

/** What the DM reads in the library. */
export const BED_LABELS = Object.freeze({
  'amb.wilds': 'Open country', 'amb.forest': 'Forest', 'amb.town': 'Town', 'amb.sea': 'Sea',
  'amb.dungeon': 'Dungeon', 'amb.mountain': 'Mountain', 'amb.storm': 'Storm',
})

/** The Player View's cues: something new on the map, the era bar moving, an era crossed, back to now. */
export const CUES = Object.freeze(['ui.reveal', 'ui.scrub', 'ui.era', 'ui.now'])

export const SOUND_NAMES = Object.freeze([...BEDS, ...CUES])

/**
 * What a player's page may sound like here: only what the DM chose. `url` is the map's own ambience,
 * `bed` a stock bed picked for the map (its own file wins, and an unknown name is silence), `cues`
 * the world's switch for the stock cues. `any` says there is something to load and a speaker to show.
 */
export function chosenSound(map, world) {
  const url = map?.ambienceUrl || null
  const bed = !url && BEDS.includes(map?.ambienceBed) ? map.ambienceBed : null
  const cues = world?.soundCues === true
  return { url, bed, cues, any: !!url || !!bed || cues }
}
