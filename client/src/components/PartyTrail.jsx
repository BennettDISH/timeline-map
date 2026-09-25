import React from 'react'
import { sessionOf, sessionColor } from '../utils/moment'

// Where the party has BEEN on this map, up to the moment shown: every past footstep as a
// ghost print (older = fainter, colored by session), joined in order by a dotted path. A
// footstep alive at the moment is drawn as the real pin elsewhere, so it is left out here —
// but only when it really is alive; a newest step the party has since walked away from
// stays a print. Where they went next is told in the Party's own text, not on the map.
export default function PartyTrail({ placements, t, eras, onStep }) {
  const at = (v) => (v == null ? -Infinity : v)
  const steps = (placements || [])
    .filter((p) => p.node?.category === 'party' && at(p.start) <= t)
    .sort((a, b) => at(a.start) - at(b.start) || a.id - b.id)
  if (!steps.length) return null
  const last = steps[steps.length - 1]
  const lastAlive = at(last.start) <= t && (last.end == null || t <= last.end)
  const prints = lastAlive ? steps.slice(0, -1) : steps
  const pts = steps.map((p) => `${p.x},${p.y}`).join(' ')
  return (
    <>
      {steps.length > 1 && (
        <svg className="ftrail" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polyline points={pts} fill="none" stroke="#ffffff66" strokeWidth="1.5" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      {prints.map((p, i) => {
        const s = sessionOf(at(p.start) === -Infinity ? t : p.start, eras)
        const label = s ? `Session ${s.idx + 1} · footstep ${s.step}` : `footstep ${p.start ?? '…'}`
        return (
          <button key={p.id} type="button" className="fstep"
            style={{ left: `${p.x}%`, top: `${p.y}%`, '--sc': sessionColor(s ? s.idx : 0), opacity: 0.4 + 0.5 * ((i + 1) / prints.length) }}
            title={onStep ? `${label} — click to look at this moment` : label}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); if (onStep && p.start != null) onStep(p.start) }} />
        )
      })}
    </>
  )
}
