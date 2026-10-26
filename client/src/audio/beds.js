// Which ambience bed a map gets. A map the DM has not given an ambience of its own is heard as the
// kind of place its name says: the map's own title first, then the titles above it (a room in "The
// Drowned Crypt" is a dungeon whatever the room is called). The first title that names a place wins,
// in the order below (a storm over the sea is a storm); a map that names none gets the open country.
// A heuristic on purpose: no saved map changes, and a DM who wants exact control makes an ambience
// for the map (the inspector's "Make it"), which always wins.

const RULES = [
  ['amb.storm', /\b(storms?|stormy|tempests?|hurricanes?|gales?|typhoons?|thunder(?:storms?)?|squall)\b/i],
  ['amb.sea', /\b(sea|seas|ocean|oceans|coasts?|coastal|shores?|harbou?rs?|ports?|bays?|beach(?:es)?|isles?|islands?|archipelagos?|ships?|docks?|wharf|lighthouse|coves?|straits?|reefs?|lagoons?|marinas?|sailing|tides?)\b/i],
  ['amb.dungeon', /\b(dungeons?|caves?|caverns?|crypts?|tombs?|catacombs?|mines?|underdark|sewers?|vaults?|cellars?|undercroft|labyrinths?|lairs?|prisons?|oubliettes?|depths|barrow|pits?)\b/i],
  ['amb.mountain', /\b(mountains?|peaks?|ranges?|passes|pass|highlands?|hills?|crags?|cliffs?|summits?|ridges?|tors?|alps|glaciers?|volcano(?:es)?|plateau|mesa|canyons?)\b/i],
  ['amb.forest', /\b(forests?|woods?|woodlands?|groves?|jungles?|thickets?|glades?|wildwood|taiga|swamps?|marshes|marsh|fens?|bogs?|mires?|orchards?)\b/i],
  ['amb.town', /\b(towns?|cit(?:y|ies)|villages?|hamlets?|markets?|inns?|taverns?|keeps?|castles?|forts?|fortress(?:es)?|citadels?|capitals?|districts?|quarters?|streets?|squares?|guildhall|temples?|cathedrals?|palaces?|manors?|bazaars?|abbey|monastery|academy|library)\b/i],
]

export const DEFAULT_BED = 'amb.wilds'

/** The bed for a map: `titles` run from the map itself up through its parents (the breadcrumb, reversed). */
export function bedFor(titles) {
  for (const title of titles) {
    if (!title) continue
    for (const [bed, re] of RULES) if (re.test(title)) return bed
  }
  return DEFAULT_BED
}

/** The titles to ask `bedFor` about: the map's own, then each ancestor's, nearest first. */
export function titlesOf(map, breadcrumb) {
  const crumbs = (breadcrumb || []).map((b) => b.title).reverse()
  return [map?.title, ...crumbs]
}
