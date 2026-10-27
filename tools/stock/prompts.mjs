// The stock library's subjects and the words they were painted from. One style for all of them,
// and one style anchor: the knight is painted first with no reference, and every other picture is
// painted with the knight beside the prompt, so the 36 read as one hand (the Forge does the same
// per world with a world's first painting).
//
// Tokens are cut-outs for pins: painted on flat magenta, which finish.mjs keys out to transparency.
// Portraits keep their painted background: they are read at the size of the reader's picture.

export const MODEL = 'gemini-2.5-flash-image';

// the line the picker shows under the library (and every copy's caption in the Archive)
export const CREDIT = 'Painted for the Atlas with Google Gemini 2.5 Flash Image, October 2026. Free to use in any world.';

export const STYLE = [
  'Hand-painted storybook illustration, like a plate from an old illustrated fantasy atlas:',
  'confident dark-brown ink outlines, painterly gouache colour with visible brush texture,',
  'a muted earthy palette (moss green, ochre, slate blue, rust, bone) with warm gold highlights,',
  'soft light from the upper left, a clear silhouette that still reads when shown very small.',
  'Not photorealistic, not a 3D render, not anime, not pixel art.',
].join(' ');

export const ANCHOR = 'knight';

export const MATCH = 'Match the artistic style, palette, line work and rendering technique of the reference image exactly. Do not copy its subject, pose or content.';

const token = (subject) => [
  `Paint one token for a fantasy map: ${subject}.`,
  'Seen from the front at a slightly high angle, the whole subject inside the frame with a clear margin on every side, centred.',
  'Isolated on a perfectly flat, uniform pure magenta (#FF00FF) background: no gradient, no floor, no cast shadow, no border, no circle, no frame.',
  'No text, no letters, no watermark.',
].join(' ');

const portrait = (subject) => [
  `Paint a head-and-shoulders portrait of ${subject}, turned slightly to one side, eyes on the viewer.`,
  'Behind them a soft painted background in muted tones with a gentle vignette.',
  'No text, no letters, no border, no frame, no watermark.',
].join(' ');

// group: what the picker files a token under (creatures, people, places)
export const TOKENS = [
  // creatures
  { name: 'wolf', title: 'Wolf', group: 'creatures', subject: 'a grey wolf mid-stride, hackles raised, teeth bared' },
  { name: 'goblin', title: 'Goblin', group: 'creatures', subject: 'a wiry green-skinned goblin in a ragged hood with a notched short blade' },
  { name: 'orc', title: 'Orc', group: 'creatures', subject: 'a hulking tusked orc warrior in hide armour with a crude iron axe' },
  { name: 'skeleton', title: 'Skeleton', group: 'creatures', subject: 'a skeleton warrior made of bare yellowed bones, ribs and empty eye sockets showing, a rusted iron helm, a torn loincloth and a notched sword, no tabard and no shield' },
  { name: 'troll', title: 'Troll', group: 'creatures', subject: 'a lanky moss-covered troll with long arms, dragging a driftwood club' },
  { name: 'dragon', title: 'Dragon', group: 'creatures', subject: 'a red dragon, the whole body visible, wings half spread, coiled and snarling' },
  { name: 'spider', title: 'Giant spider', group: 'creatures', subject: 'a giant black spider with amber markings, legs spread wide' },
  { name: 'wraith', title: 'Wraith', group: 'creatures', subject: 'a hooded wraith of tattered pale grey-green ghostly cloth with cold blue light for eyes and long bony hands, drifting, no legs' },
  { name: 'bear', title: 'Bear', group: 'creatures', subject: 'a great brown bear on all fours, head low' },
  { name: 'griffon', title: 'Griffon', group: 'creatures', subject: 'a griffon with an eagle head and a lion body, wings raised' },
  { name: 'sea-serpent', title: 'Sea serpent', group: 'creatures', subject: 'a green-scaled sea serpent rising in coils from a small splash of water' },
  // people
  { name: 'knight', title: 'Knight', group: 'people', subject: 'a weathered human knight in a dented steel breastplate and a faded blue tabard, longsword held low, round shield on one arm' },
  { name: 'wizard', title: 'Wizard', group: 'people', subject: 'an old wizard in a deep green robe with a gnarled staff topped by a glowing crystal' },
  { name: 'rogue', title: 'Rogue', group: 'people', subject: 'a hooded rogue in dark leathers holding twin daggers, crouched and ready' },
  { name: 'cleric', title: 'Cleric', group: 'people', subject: 'a cleric in white and gold vestments holding a mace and a sun symbol' },
  { name: 'ranger', title: 'Ranger', group: 'people', subject: 'an elf ranger in a forest-green cloak with a drawn longbow' },
  { name: 'merchant', title: 'Merchant', group: 'people', subject: 'a stout travelling merchant with a huge pack on his back and a lantern' },
  { name: 'guard', title: 'Guard', group: 'people', subject: 'a town guard in a padded gambeson and a kettle helm, holding a spear upright' },
  { name: 'noble', title: 'Noble', group: 'people', subject: 'a noblewoman in a burgundy gown with a gold circlet and a folded fan' },
  // places and things
  { name: 'camp', title: 'Camp', group: 'places', subject: 'a small campfire with two bedrolls and a canvas lean-to, seen from above at an angle' },
  { name: 'treasure', title: 'Treasure', group: 'places', subject: 'an open wooden treasure chest spilling gold coins and a jewelled goblet' },
  { name: 'ship', title: 'Ship', group: 'places', subject: 'a single-masted wooden sailing ship with a weathered, patched cream-coloured sail, on a small patch of waves' },
  { name: 'tower', title: 'Tower', group: 'places', subject: 'a lone stone watchtower with a crooked wooden roof on a grassy knoll' },
  { name: 'portal', title: 'Portal', group: 'places', subject: 'a ring of old standing stones around a swirling blue-green portal' },
].map((t) => ({ ...t, kind: 'token', prompt: token(t.subject) }));

export const PORTRAITS = [
  { name: 'dwarf-smith', title: 'Dwarf smith', subject: 'a grizzled dwarf blacksmith with a braided grey beard, soot on his cheeks and a leather apron' },
  { name: 'elf-archivist', title: 'Elf archivist', subject: 'an elven archivist woman with silver hair, round spectacles and ink-stained fingers at her chin' },
  { name: 'queen', title: 'Queen', subject: 'a stern middle-aged queen with dark brown skin, a simple gold crown and a fur-trimmed mantle' },
  { name: 'mercenary', title: 'Mercenary', subject: 'a scarred half-orc mercenary woman with a shaved head, small tusks and a chipped steel pauldron' },
  { name: 'hedge-witch', title: 'Hedge witch', subject: 'an old hedge witch with wild white hair, a crooked smile and dried herbs tucked in her hat' },
  { name: 'squire', title: 'Squire', subject: 'a young freckled squire with a wary look and a dented helmet under one arm' },
  { name: 'pirate-captain', title: 'Pirate captain', subject: 'a weathered pirate captain with a tricorn hat, a gold earring and a salt-white beard' },
  { name: 'spy', title: 'Spy', subject: 'a hooded spy, a sharp-eyed woman with half of her face in shadow' },
  { name: 'priest', title: 'Priest', subject: 'a gentle elderly priest with tan skin, a shaved head and wooden prayer beads' },
  { name: 'innkeeper', title: 'Innkeeper', subject: 'a cheerful halfling innkeeper with rosy cheeks and a dish towel over one shoulder' },
  { name: 'warlord', title: 'Warlord', subject: 'a cold-eyed warlord in black lacquered armour with a scar across one eye' },
  { name: 'caravan-trader', title: 'Caravan trader', subject: 'a desert caravan trader with a deep brown complexion, an indigo head wrap and gold rings' },
].map((p) => ({ ...p, kind: 'portrait', group: 'portraits', prompt: portrait(p.subject) }));

export const ALL = [...TOKENS, ...PORTRAITS];

// what goes to the model: the house style, the anchor line (every picture but the anchor), the subject
export const fullPrompt = (item) => [STYLE, item.name !== ANCHOR && MATCH, item.prompt].filter(Boolean).join('\n\n');
