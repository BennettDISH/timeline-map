// The shared node-category vocabulary (color token + icon + label), used by both the DM
// workspace and the read-only Player View so pins look identical on both sides.
export const CATS = {
  note: { c: 'var(--note)', i: '•', label: 'Note', plural: 'notes' },
  place: { c: 'var(--place)', i: '▲', label: 'Place', plural: 'places' },
  person: { c: 'var(--person)', i: '☻', label: 'Person', plural: 'people' },
  item: { c: 'var(--item)', i: '◆', label: 'Item', plural: 'items' },
  lore: { c: 'var(--lore)', i: '✦', label: 'Lore', plural: 'lore' },
  event: { c: 'var(--event)', i: '✷', label: 'Event', plural: 'events' },
  // the players themselves — one node that walks the world, footstep by footstep
  party: { c: 'var(--party)', i: '⚑', label: 'The party', plural: 'the party' },
}

// what a player's marker may be: the same six the server accepts (server/lib/vocab.js) —
// never the Party, which is one node per world that only the table's footsteps move
export const MARKABLE = ['note', 'place', 'person', 'item', 'lore', 'event']

export const cat = (k) => CATS[k] || CATS.note
