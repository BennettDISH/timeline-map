import React, { useRef, useState, useEffect } from 'react'
import { simplify, polyPoints } from '../utils/geometry'

// Outlines: a placement may cover a REGION of the map art — a polygon in % of the plane
// (the same space pins live in) drawn as a translucent shape that lights up on hover and
// acts as the node's button: click reads it, double-click steps inside. The pin at the
// anchor point stays as the small handle (links, trails and the lantern still attach there).
// A region never stops propagation (a press on it must still pan the map), so the plane's
// pointer capture retargets its clicks: callers resolve taps via regionAt() from the
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

export default function Regions({ items, hoverId, onHover, inert = false, drawing, onDraw }) {
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

  const pts = drawing?.pts || []
  const preview = on ? [...pts, ...live, ...(cur && !live.length ? [cur] : [])] : []
  return (
    <>
      <svg ref={svgRef} className={`regions${on ? ' drawing' : ''}${inert ? ' inert' : ''}`}
        viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden={on ? undefined : 'true'}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
        onPointerCancel={() => { trace.current = null; setLive([]) }}
        onDoubleClick={on ? (e) => { e.stopPropagation(); onDraw?.finish() } : undefined}>
        {items.map((it) => (
          <polygon key={it.id} data-id={it.id} className={`region ${it.cls || ''}${hoverId === it.id ? ' hov' : ''}`} points={polyPoints(it.pts)}
            onPointerEnter={() => onHover?.(it.id)} onPointerLeave={() => onHover?.(null)}>
            <title>{it.title}</title>
          </polygon>
        ))}
        {on && pts.length > 2 && <polygon className="odraw fill" points={polyPoints(pts)} />}
        {on && preview.length > 1 && <polyline className="odraw" points={polyPoints(preview)} />}
      </svg>
      {on && pts.map(([x, y], i) => (
        <span key={i} className={`ovtx${i === 0 ? ' first' : ''}`} style={{ left: `${x}%`, top: `${y}%` }}
          title={i === 0 && pts.length > 2 ? 'Click to close the outline' : undefined}
          onPointerDown={i === 0 ? (e) => e.stopPropagation() : undefined}
          onClick={i === 0 && pts.length > 2 ? (e) => { e.stopPropagation(); onDraw?.finish() } : undefined} />
      ))}
    </>
  )
}
