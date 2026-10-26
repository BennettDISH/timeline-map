// Every sound the Atlas asks for. The manifest (client/public/audio/manifest.json) may name no
// others; server/test/sound.test.js holds the two together. Plain data, no imports, so a test
// can read it.

/** The ambience beds: long seamless loops of a kind of place (see beds.js for which map gets which). */
export const BEDS = Object.freeze(['amb.wilds', 'amb.forest', 'amb.town', 'amb.sea', 'amb.dungeon', 'amb.mountain', 'amb.storm'])

/** The Player View's cues: something new on the map, the era bar moving, an era crossed, back to now. */
export const CUES = Object.freeze(['ui.reveal', 'ui.scrub', 'ui.era', 'ui.now'])

export const SOUND_NAMES = Object.freeze([...BEDS, ...CUES])
