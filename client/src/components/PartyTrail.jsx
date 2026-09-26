import React from 'react'
import { sessionOf, sessionColor, sessionLabel, latestSession } from '../utils/moment'

// Where the party has BEEN on this map, up to the moment shown: every past footstep as a
// ghost print (older = fainter, colored by session), joined in order by a dotted path. A
// footstep alive at the moment is drawn as the real pin elsewhere, so it is left out here —
// but only when it really is alive; a newest step the party has since walked away from
// stays a print. Where they went next is told in the Party's own text, not on the map.
export default function PartyTrail({ placements, t, eras, unit, onStep }) {
  const at = (v) => (v == null ? -Infinity : v)
  const steps = (placements || [])
    .filter((p) => p.node?.category === 'party' && at(p.start) <= t)
    .sort((a, b) => at(a.start) - at(b.start) || a.id - b.id)
  if (!steps.length) return null
  const last = steps[steps.length - 1]
  const lastAlive = at(last.start) <= t && (last.end == null || t <= last.end)
  const prints = lastAlive ? steps.slice(0, -1) : steps
  // the party comes back to the same places: footsteps sharing a spot fan out in a small
  // ring so each stays clickable. The live pin (or, failing that, the oldest print) keeps
  // the exact spot; later ones step around it.
  const key = (p) => `${Math.round(p.x * 2) / 2},${Math.round(p.y * 2) / 2}`
  const groups = new Map()
  for (const p of (lastAlive ? [last, ...steps.slice(0, -1)] : steps)) {
    const g = groups.get(key(p)) || []
    g.push(p.id); groups.set(key(p), g)
  }
  // the offset is in SCREEN pixels (pins and prints keep their screen size at any zoom),
  // applied through --ox/--oy in the print's transform, counter-scaled like the pin itself
  // (pins are wide, short chips: step below and above first, where a chip never reaches)
  const offset = (p) => {
    const k = groups.get(key(p)).indexOf(p.id)
    if (k <= 0) return [0, 0]
    const ring = Math.floor((k - 1) / 6), dy = 27 + 18 * ring, dx = 30 + 18 * ring
    return [[0, dy], [0, -dy], [dx, dy], [-dx, dy], [dx, -dy], [-dx, -dy]][(k - 1) % 6]
  }
  // one dotted path per VISIT: a gap in time between two prints on this map means the party
  // was elsewhere, so the path breaks there instead of drawing a march they never made
  const runs = []; let run = []
  for (const p of steps) {
    const prev = run[run.length - 1]
    if (prev && prev.end != null && p.start != null && p.start > prev.end + 1) { runs.push(run); run = [] }
    run.push(p)
  }
  if (run.length) runs.push(run)
  const latest = latestSession(eras)
  return (
    <>
      {runs.some((r) => r.length > 1) && (
        <svg className="ftrail" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {runs.filter((r) => r.length > 1).map((r, i) => (
            <polyline key={i} points={r.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#ffffff66" strokeWidth="1.5" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      )}
      {prints.map((p, i) => {
        const s = sessionOf(at(p.start) === -Infinity ? t : p.start, eras)
        const label = s ? sessionLabel(s, unit) : `${unit ? unit.replace(/s$/i, '') : 'moment'} ${p.start ?? '…'}`
        const [ox, oy] = offset(p)
        return (
          <button key={p.id} type="button" className="fstep" onDoubleClick={(e) => e.stopPropagation()}
            style={{ left: `${p.x}%`, top: `${p.y}%`, '--ox': `${ox}px`, '--oy': `${oy}px`, '--sc': sessionColor(s ? s.idx : 0, latest), opacity: 0.4 + 0.5 * ((i + 1) / prints.length) }}
            title={onStep ? `The party was here — ${label} · click to view this moment` : `The party was here — ${label}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); if (onStep && p.start != null) onStep(p.start) }} />
        )
      })}
    </>
  )
}
