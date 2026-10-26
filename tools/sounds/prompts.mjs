/**
 * The generated sounds: one prompt per name, for ElevenLabs Sound Effects (tools/sounds/eleven.mjs).
 * Kept in the repo so a sound can be regenerated or re-described later. `seconds` is the requested
 * length, `loop` asks for a seamless loop, `gain` goes into the manifest.
 *
 * The ambience beds are made from two takes each (`amb.<bed>.a`, `.b`: the same place with different
 * detail in the foreground) joined with a crossfade into one longer bed that loops without a seam,
 * so a bed does not repeat itself every twenty seconds. tools/sounds/README.md has the steps.
 */

const calm = (text) => `${text} Natural field recording feel, rich and layered, no music, no melody, no clear speech, steady and even, no sudden loud events, seamless loop.`;
const soft = (text) => `${text} Warm, soft and rounded fantasy tabletop interface sound; not 8-bit, not chiptune, no harsh digital edge, no voices.`;

export const PROMPTS = [
  // --- ambience beds (two takes each)
  { name: 'amb.wilds.a', text: calm('Open grassland on a mild day: a soft steady breeze moving through tall grass, a few distant songbirds, a low insect hum.'), seconds: 22, loop: true, gain: 1 },
  { name: 'amb.wilds.b', text: calm('Open grassland on a mild day: gusts of wind rolling across a wide plain, grass hissing, a far-off crow now and then, faint crickets.'), seconds: 22, loop: true, gain: 1 },
  { name: 'amb.forest.a', text: calm('Deep old forest: layered birdsong, leaves rustling overhead in a gentle breeze, a small stream trickling nearby.'), seconds: 22, loop: true, gain: 1 },
  { name: 'amb.forest.b', text: calm('Deep old forest: wind moving through tall trees with creaking branches, a distant woodpecker, tiny insects, dripping leaves.'), seconds: 22, loop: true, gain: 1 },
  { name: 'amb.town.a', text: calm('A medieval market town: a muffled crowd murmur with no clear words, cart wheels rolling over cobblestones, a distant blacksmith hammer, chickens.'), seconds: 22, loop: true, gain: 1 },
  { name: 'amb.town.b', text: calm('A medieval town at dusk: distant indistinct voices and laughter from a tavern, a far church bell, horses, a wooden shutter creaking.'), seconds: 22, loop: true, gain: 1 },
  { name: 'amb.sea.a', text: calm('A rocky seaside harbour: waves rolling onto shingle, gulls calling, wind, rope and wood creaking from moored ships.'), seconds: 22, loop: true, gain: 1 },
  { name: 'amb.sea.b', text: calm('The open sea from a ship deck: deep water slapping the hull, steady wind in the sails, timber groaning, distant gulls.'), seconds: 22, loop: true, gain: 1 },
  { name: 'amb.dungeon.a', text: calm('A dark stone dungeon: slow water drips echoing in a large chamber, a low cold draught, a faint distant metallic clink.'), seconds: 22, loop: true, gain: 1 },
  { name: 'amb.dungeon.b', text: calm('A deep cavern: a low ominous drone of air in the rock, dripping water, small stones settling, a faint echoing scrape far away.'), seconds: 22, loop: true, gain: 1 },
  { name: 'amb.mountain.a', text: calm('A high mountain pass: thin steady wind whistling across bare rock, a distant eagle cry, small stones shifting.'), seconds: 22, loop: true, gain: 1 },
  { name: 'amb.mountain.b', text: calm('A windswept mountain ridge: long low gusts of wind, a deep hollow resonance between the peaks, distant rockfall, cold and empty.'), seconds: 22, loop: true, gain: 1 },
  { name: 'amb.storm.a', text: calm('A thunderstorm at night: steady heavy rain on leaves and earth, distant rolling thunder, wind in the trees.'), seconds: 22, loop: true, gain: 1 },
  { name: 'amb.storm.b', text: calm('A storm raging over open land: driving rain, wind gusts, long low rumbles of thunder far off, water running in gutters.'), seconds: 22, loop: true, gain: 1 },
  // --- cues for the player's map: a new pin appears, the era bar moves, the way back to now
  { name: 'ui.reveal', text: soft('Something being revealed on an old map: a soft parchment shimmer and one gentle rising chime, a discovery.'), seconds: 1.2, gain: 0.9, variants: 2 },
  { name: 'ui.scrub', text: soft('A single soft wooden tick, like a small bead on a rail, very short and quiet, a dial clicking one notch.'), seconds: 0.5, gain: 0.8, variants: 3 },
  { name: 'ui.era', text: soft('A low gentle bell tone with a long soft decay, a new age beginning, one calm note.'), seconds: 1.6, gain: 0.8 },
  { name: 'ui.now', text: soft('A soft airy rush forward and a gentle settling chime, time returning to the present.'), seconds: 1.1, gain: 0.8 },
];
