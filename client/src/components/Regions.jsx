import React, { useRef, useState, useEffect, useMemo } from 'react'
import { simplify, polyPoints } from '../utils/geometry'

// Outlines: a placement may cover a REGION of the map art — a polygon in % of the plane
// (the same space pins live in). An outlined place has NO pin: the shape is the button.
// Two kinds: 'area' (a district — a faint wash that fades with size) and 'button' (a
// house — it grows and glows on hover). The name floats at the anchor on hover, always on
// touch screens (no hover there) and when the DM's "labels always" is on. Click reads it,
// double-click steps inside. Regions stack smallest-on-top, so a house inside a district
// is still the one you hit.
//
// A region never stops propagation (a press on it must still pan the map), so the plane's
// pointer capture retargets its clicks: callers resolve taps via regionIdAt() from the
// plane's onWorldClick / onWorldDoubleClick, keyed by the polygon's data-id.
//
// Also hosts the DM's drawing mode: click corners or drag to trace freehand; Enter,
// double-click or a click on the first corner closes; Backspace undoes; Esc cancels;
// Space held lets the map pan underneath. The stroke counter-scales with the zoom via
// --pinscale (non-scaling-stroke alone would still be scaled by the plane's CSS transform).

// the placement id of the region under a plane tap, or null
export const regionIdAt = (e) => {
  const el = document.elementFromPoint(e.clientX, e.clientY)
  const poly = el?.closest?.('.region')
  return poly ? Number(poly.dataset.id) : null
}

// shoelace area in %² — for stacking order and for the tint
const areaOf = (pts) => {
  let a = 0
  for (let i = 0; i < pts.length; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]; a += x0 * y1 - x1 * y0 }
  return Math.abs(a) / 2
}
// a region's tint scales with its size: a single shed reads at full strength, a whole
// district stays a faint wash
const tint = (area) => Math.max(0.035, Math.min(0.12, 0.12 * Math.sqrt(300 / Math.max(area, 300)))).toFixed(3)

export default function Regions({ items, hoverId, onHover, labelsOn = false, inert = false, drawing, onDraw }) {
  const svgRef = useRef(null)
  const [cur, setCur] = useState(null)   // cursor, in plane %
  const [live, setLive] = useState([])   // the freehand segment being traced right now
  const trace = useRef(null)
  const space = useRef(false)
  const pct = (e) => {
    const r = svgRef.current.getBoundingClientRect()
    return [Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)),
      Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100))]
  }
  const on = !!drawing
  useEffect(() => {
    if (!on) { setCur(null); setLive([]); trace.current = null; return }
    const down = (e) => { if (e.code === 'Space' && !/input|textarea/i.test(e.target.tagName)) { space.current = true; e.preventDefault() } }
    const up = (e) => { if (e.code === 'Space') space.current = false }
    window.addEventListener('keydown', down); window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); space.current = false }
  }, [on])

  const onDown = (e) => {
    if (!on || space.current || (e.button !== undefined && e.button !== 0)) return
    e.stopPropagation() // ours, not a pan
    try { svgRef.current.setPointerCapture(e.pointerId) } catch (err) { /* older browsers */ }
    trace.current = { id: e.pointerId, moved: false, pts: [], last: pct(e) }
  }
  const onMove = (e) => {
    if (!on) return
    const p = pct(e)
    setCur(p)
    const t = trace.current
    if (!t || t.id !== e.pointerId) return
    if (Math.hypot(p[0] - t.last[0], p[1] - t.last[1]) >= 0.45) {
      t.moved = true; t.pts.push(p); t.last = p
      setLive(t.pts.slice())
    }
  }
  const onUp = (e) => {
    const t = trace.current
    if (!t || t.id !== e.pointerId) return
    trace.current = null
    setLive([])
    onDraw?.add(t.moved ? simplify(t.pts, 0.2) : [pct(e)])
  }

  // largest first, so the smallest region at any point is on top and takes the tap
  const ordered = useMemo(() => items.map((it) => ({ ...it, area: areaOf(it.pts) })).sort((a, b) => b.area - a.area), [items])

  const pts = drawing?.pts || []
  const preview = on ? [...pts, ...live, ...(cur && !live.length ? [cur] : [])] : []
  return (
    <>
      <svg ref={svgRef} className={`regions${on ? ' drawing' : ''}${inert ? ' inert' : ''}`}
        viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden={on ? undefined : 'true'}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
        onPointerCancel={() => { trace.current = null; setLive([]) }}
        onDoubleClick={on ? (e) => { e.stopPropagation(); onDraw?.finish() } : undefined}>
        {ordered.map((it) => (
          <polygon key={it.id} data-id={it.id} points={polyPoints(it.pts)}
            className={`region k-${it.kind === 'button' ? 'button' : 'area'} ${it.cls || ''}${hoverId === it.id ? ' hov' : ''}`}
            style={{ '--ra': tint(it.area) }}
            onPointerEnter={() => onHover?.(it.id)} onPointerLeave={() => onHover?.(null)}>
            <title>{it.title}</title>
          </polygon>
        ))}
        {on && pts.length > 2 && <polygon className="odraw fill" points={polyPoints(pts)} />}
        {on && preview.length > 1 && <polyline className="odraw" points={polyPoints(preview)} />}
      </svg>
      {ordered.map((it) => (
        <span key={it.id} className={`rlabel${hoverId === it.id || labelsOn || /\bsel\b/.test(it.cls || '') ? ' on' : ''}${/\bghost\b/.test(it.cls || '') ? ' ghost' : ''}`}
          style={{ left: `${it.x}%`, top: `${it.y}%` }}>
          {it.secret && <em className="lock" title="DM only">🔒</em>}
          {it.title}
          {it.hasInterior && <em className="open" title="Has an interior">◎</em>}
        </span>
      ))}
      {on && pts.map(([x, y], i) => (
        <span key={i} className={`ovtx${i === 0 ? ' first' : ''}`} style={{ left: `${x}%`, top: `${y}%` }}
          title={i === 0 && pts.length > 2 ? 'Click to close the outline' : undefined}
          onPointerDown={i === 0 ? (e) => e.stopPropagation() : undefined}
          onClick={i === 0 && pts.length > 2 ? (e) => { e.stopPropagation(); onDraw?.finish() } : undefined} />
      ))}
    </>
  )
}
