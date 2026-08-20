import React, { useState, useEffect, useRef, useCallback } from 'react'

// The shared map surface for the DM workspace and the Player View.
//
// The old canvas drew the backdrop with background-size:cover (cropped to the window's
// shape) and anchored pins to the WINDOW box — so the same pin sat on different map
// features on a laptop vs a phone, and resizing moved everything. Here instead there is
// a fixed-size "world plane" whose shape comes from the backdrop image's real aspect
// ratio (or a constant 16:10 when there's no art yet), letterboxed inside a pan/zoom
// viewport. Pins live in % of the PLANE, so a coordinate is the same point on the map
// art on every screen. Pins counter-scale (--pinscale) so labels stay readable at any zoom.
export const PLANE_W = 1600
const DEFAULT_H = 1000
const MAX_SCALE = 8

export default function MapPlane({
  mapKey,          // change => reset & refit (map navigation)
  backdropUrl,
  worldRef,        // exposed plane element: callers do pointer→% math against its rect
  onWorldClick,    // click on the plane that was NOT a pan (drop-a-node etc.)
  onEmptyPointerDown, // pointerdown on plane/viewport background (deselect etc.)
  controlsOffset = 0, // lift zoom buttons above the timebar when it's shown
  dblZoom = true,     // off while placing nodes, so a fast double-drop doesn't also zoom
  children,
}) {
  const viewportRef = useRef(null)
  const [planeH, setPlaneH] = useState(DEFAULT_H)
  const [view, setView] = useState({ scale: 0.3, tx: 0, ty: 0 })
  const planeHRef = useRef(planeH); planeHRef.current = planeH
  const viewRef = useRef(view); viewRef.current = view
  const touched = useRef(false)   // manual zoom/pan => stop auto-refit on resize
  const moved = useRef(false)     // pan happened => swallow the click
  const pointers = useRef(new Map())
  const gesture = useRef(null)

  const clampView = useCallback((scale, tx, ty) => {
    const vp = viewportRef.current
    if (!vp) return { scale, tx, ty }
    const { width: vw, height: vh } = vp.getBoundingClientRect()
    const keep = 70 // never let the plane leave less than this many px in view
    tx = Math.min(vw - keep, Math.max(keep - PLANE_W * scale, tx))
    ty = Math.min(vh - keep, Math.max(keep - planeHRef.current * scale, ty))
    return { scale, tx, ty }
  }, [])

  const fit = useCallback((h) => {
    const vp = viewportRef.current
    if (!vp) return
    const { width: vw, height: vh } = vp.getBoundingClientRect()
    if (!vw || !vh) return
    const ph = h ?? planeHRef.current
    const scale = Math.min(vw / PLANE_W, vh / ph) * 0.96
    setView({ scale, tx: (vw - PLANE_W * scale) / 2, ty: (vh - ph * scale) / 2 })
  }, [])

  // new map (or backdrop swap): back to the default plane, refit, forget manual zoom
  useEffect(() => {
    touched.current = false
    setPlaneH(DEFAULT_H)
    const t = requestAnimationFrame(() => fit(DEFAULT_H))
    return () => cancelAnimationFrame(t)
  }, [mapKey, backdropUrl, fit])

  // the image reports its true shape: resize the plane to match and refit
  const onImgLoad = (e) => {
    const { naturalWidth: nw, naturalHeight: nh } = e.target
    if (!nw || !nh) return
    const h = Math.round((PLANE_W * nh) / nw)
    setPlaneH(h)
    if (!touched.current) fit(h)
  }

  // window/stage resizes refit only while the user hasn't taken over
  useEffect(() => {
    const vp = viewportRef.current
    if (!vp || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => { if (!touched.current) fit() })
    ro.observe(vp)
    return () => ro.disconnect()
  }, [fit])

  const zoomAt = useCallback((factor, cx, cy) => {
    touched.current = true
    setView((v) => {
      const vp = viewportRef.current
      const rect = vp ? vp.getBoundingClientRect() : { width: 1, height: 1 }
      const minScale = Math.min(rect.width / PLANE_W, rect.height / planeHRef.current) * 0.35
      const s = Math.min(MAX_SCALE, Math.max(minScale, v.scale * factor))
      const k = s / v.scale
      return clampView(s, cx - (cx - v.tx) * k, cy - (cy - v.ty) * k)
    })
  }, [clampView])

  // wheel zoom needs a non-passive listener (React's synthetic wheel can't preventDefault)
  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    const onWheel = (e) => {
      e.preventDefault()
      const r = vp.getBoundingClientRect()
      zoomAt(Math.exp(-e.deltaY * 0.0016), e.clientX - r.left, e.clientY - r.top)
    }
    vp.addEventListener('wheel', onWheel, { passive: false })
    return () => vp.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  // ---- pan (one pointer) & pinch (two pointers). Pins stopPropagation on their own
  // pointerdown, so a gesture reaching the viewport is on empty space / the backdrop.
  const onPointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return
    onEmptyPointerDown?.(e)
    const vp = viewportRef.current
    try { vp.setPointerCapture(e.pointerId) } catch (err) { /* older browsers */ }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pts = [...pointers.current.values()]
    if (pts.length === 1) {
      moved.current = false
      const v = viewRef.current
      gesture.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, tx: v.tx, ty: v.ty }
    } else if (pts.length === 2) {
      const v = viewRef.current
      const r = vp.getBoundingClientRect()
      gesture.current = {
        mode: 'pinch',
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        cx: (pts[0].x + pts[1].x) / 2 - r.left,
        cy: (pts[0].y + pts[1].y) / 2 - r.top,
        scale: v.scale, tx: v.tx, ty: v.ty,
      }
    }
  }
  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (!g) return
    if (g.mode === 'pan' && pointers.current.size === 1) {
      const dx = e.clientX - g.sx
      const dy = e.clientY - g.sy
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) { moved.current = true; touched.current = true }
      if (moved.current) setView((v) => clampView(v.scale, g.tx + dx, g.ty + dy))
    } else if (g.mode === 'pinch' && pointers.current.size === 2) {
      moved.current = true; touched.current = true
      const pts = [...pointers.current.values()]
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      const k = Math.max(0.1, dist / g.dist)
      const vp = viewportRef.current
      const rect = vp ? vp.getBoundingClientRect() : { width: 1, height: 1 }
      const minScale = Math.min(rect.width / PLANE_W, rect.height / planeHRef.current) * 0.35
      const s = Math.min(MAX_SCALE, Math.max(minScale, g.scale * k))
      const kk = s / g.scale
      setView(clampView(s, g.cx - (g.cx - g.tx) * kk, g.cy - (g.cy - g.ty) * kk))
    }
  }
  const endPointer = (e) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size === 0) gesture.current = null
    else if (pointers.current.size === 1) {
      // pinch ended with one finger still down: restart as a pan from here
      const [p] = [...pointers.current.values()]
      const v = viewRef.current
      gesture.current = { mode: 'pan', sx: p.x, sy: p.y, tx: v.tx, ty: v.ty }
    }
  }

  const zoomCenter = (factor) => {
    const vp = viewportRef.current
    if (!vp) return
    const r = vp.getBoundingClientRect()
    zoomAt(factor, r.width / 2, r.height / 2)
  }

  return (
    <div
      ref={viewportRef}
      className="mp-viewport"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onDoubleClick={(e) => {
        if (!dblZoom) return
        const r = viewportRef.current.getBoundingClientRect()
        zoomAt(1.7, e.clientX - r.left, e.clientY - r.top)
      }}
    >
      <div
        ref={worldRef}
        className={`mp-world ${backdropUrl ? '' : 'nobg'}`}
        style={{
          width: PLANE_W,
          height: planeH,
          transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
          '--pinscale': 1 / view.scale,
        }}
        onClick={(e) => { if (!moved.current) onWorldClick?.(e) }}
      >
        {backdropUrl && (
          <img className="mp-backdrop" src={backdropUrl} alt="" draggable={false} onLoad={onImgLoad} />
        )}
        {children}
      </div>
      <div className="mp-controls" style={controlsOffset ? { bottom: controlsOffset } : undefined}>
        <button title="Zoom in" onClick={(e) => { e.stopPropagation(); zoomCenter(1.5) }}
          onPointerDown={(e) => e.stopPropagation()}>＋</button>
        <button title="Zoom out" onClick={(e) => { e.stopPropagation(); zoomCenter(1 / 1.5) }}
          onPointerDown={(e) => e.stopPropagation()}>−</button>
        <button title="Fit the whole map" onClick={(e) => { e.stopPropagation(); touched.current = false; fit() }}
          onPointerDown={(e) => e.stopPropagation()}>⊡</button>
      </div>
    </div>
  )
}
