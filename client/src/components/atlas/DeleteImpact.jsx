import React from 'react'

// What a delete takes with it, in words — shown in the confirm dialogs.

// the other entries that lead into a map going away (doors from the rooms beside it): they stay,
// leading nowhere, and Undo points them back
export const doorsLine = (n) =>
  `${n} other ${n === 1 ? 'entry leads' : 'entries lead'} into it — ${n === 1 ? 'it leads' : 'they lead'} nowhere after this, and Undo points ${n === 1 ? 'it' : 'them'} back.`

export default function DeleteImpact({ impact, spotlit, party }) {
  if (!impact) return <p className="muted">This removes the entry from every map, along with its threads.{spotlit ? ' The lantern pointing at it goes out.' : ''}</p>
  const bits = []
  if (party) bits.push(`This erases the party's trail: ${party.steps} ${party.steps === 1 ? 'footstep' : 'footsteps'} across ${party.maps} ${party.maps === 1 ? 'map' : 'maps'}${party.first != null ? (party.first === party.last ? `, session ${party.first}` : `, sessions ${party.first}–${party.last}`) : ''} — the timebar ticks and the players' From / Then on to links with it.`)
  if (spotlit) bits.push('The lantern points at it — it goes out (Undo relights it).')
  const maps = impact.maps ?? impact.placements
  if (!party && maps > 1) bits.push(`It sits on ${maps} maps — it disappears from all of them.`)
  if (impact.interiorMaps > 0) {
    bits.push(impact.interiorMaps === 1 ? 'Its interior is deleted too.' : `The ${impact.interiorMaps} maps it owns (its interior and the maps beside it) are deleted too.`)
    if (impact.nodesInside > 0) {
      bits.push(`${impact.nodesInside} ${impact.nodesInside === 1 ? 'entry' : 'entries'} inside will be left unplaced — they still exist (findable with search), but lose their spot.`)
    }
    if (impact.nestedMaps > 0) {
      bits.push(`${impact.nestedMaps} ${impact.nestedMaps === 1 ? 'map' : 'maps'} nested deeper inside stay — their owners keep them, listed under Unplaced in the map tree.`)
    }
    if (impact.doorsIn > 0) bits.push(doorsLine(impact.doorsIn))
  }
  if (impact.leadsElsewhere) bits.push('The map it leads to is not its own — that map stays.')
  if (bits.length === 0) bits.push('It has no interior and sits only on this map.')
  return (
    <div className="impact">
      {bits.map((b, i) => <p key={i}>{b}</p>)}
      <p className="muted">You can undo it for 24 hours: ↩ Undo on the toast, Ctrl+Z, or Map ▾ → Recently deleted.</p>
    </div>
  )
}
