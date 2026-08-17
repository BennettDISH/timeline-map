// The shared node-category vocabulary (color token + icon + label), used by both the DM
// workspace and the read-only Player View so pins look identical on both sides.
export const CATS = {
  note: { c: 'var(--note)', i: '•', label: 'Note' },
  place: { c: 'var(--place)', i: '▲', label: 'Place' },
  person: { c: 'var(--person)', i: '☻', label: 'Person' },
  item: { c: 'var(--item)', i: '◆', label: 'Item' },
  lore: { c: 'var(--lore)', i: '✦', label: 'Lore' },
  event: { c: 'var(--event)', i: '✷', label: 'Event' },
}

export const cat = (k) => CATS[k] || CATS.note
