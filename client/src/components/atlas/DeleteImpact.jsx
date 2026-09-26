import React from 'react'

// What a delete takes with it, in words — shown in the confirm dialogs.

export default function DeleteImpact({ impact, spotlit, party }) {
  if (!impact) return <p className="muted">This removes the entry from every map, along with its threads.{spotlit ? ' The lantern pointing at it goes out.' : ''}</p>
  const bits = []
  if (party) bits.push(`This erases the party's trail: ${party.steps} ${party.steps === 1 ? 'footstep' : 'footsteps'} across ${party.maps} ${party.maps === 1 ? 'map' : 'maps'}${party.first != null ? (party.first === party.last ? `, session ${party.first}` : `, sessions ${party.first}–${party.last}`) : ''} — the timebar ticks and the players' From / Then on to links with it.`)
  if (spotlit) bits.push('The lantern points at it — it goes out (Undo relights it).')
  const maps = impact.maps ?? impact.placements
  if (!party && maps > 1) bits.push(`It sits on ${maps} maps — it disappears from all of them.`)
  if (impact.interiorMaps > 0) {
    bits.push('Its interior is deleted too.')
    if (impact.nodesInside > 0) {
      bits.push(`${impact.nodesInside} ${impact.nodesInside === 1 ? 'entry' : 'entries'} inside will be left unplaced — they still exist (findable with search), but lose their spot.`)
    }
    if (impact.nestedMaps > 0) {
      bits.push(`${impact.nestedMaps} ${impact.nestedMaps === 1 ? 'map' : 'maps'} nested deeper inside stay — their owners keep them, listed under Unplaced in the map tree.`)
    }
  }
  if (bits.length === 0) bits.push('It has no interior and sits only on this map.')
  return (
    <div className="impact">
      {bits.map((b, i) => <p key={i}>{b}</p>)}
      <p className="muted">You'll get an Undo offer for a few seconds afterwards.</p>
    </div>
  )
}
