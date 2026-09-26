import { useState, useEffect, useRef } from 'react'

// Browser-side preferences (a posture, a folded rail, a column width). Every read and write
// is guarded: a private window or blocked storage makes them defaults, never errors.
export const readPref = (key) => { try { return localStorage.getItem(key) } catch (e) { return null } }
export const writePref = (key, value) => {
  try { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key, String(value)) } catch (e) { /* a convenience, not a requirement */ }
}

// A yes/no preference. Stored as 'on'/'off'; the older 'open'/'closed' spellings still read.
// The setter takes a value or an updater, like useState's.
export function useFlag(key, fallback) {
  const [on, setOn] = useState(() => {
    const v = readPref(key)
    return v === 'on' || v === 'open' ? true : v === 'off' || v === 'closed' ? false : fallback
  })
  const set = (next) => setOn((v) => { const nv = typeof next === 'function' ? next(v) : next; writePref(key, nv ? 'on' : 'off'); return nv })
  return [on, set]
}

// A resizable column: `w` is the width (null = the stylesheet's default until dragged),
// `start` is the edge's pointerdown handler, `reset` puts the default back. The width is
// clamped into [min, max] and to maxFrac of the window; edge 'left' means the column sits
// at the right and grows leftwards. Frames are coalesced with requestAnimationFrame.
export function useColumnResize({ key, min, max, maxFrac, fallback = null, edge = 'left' }) {
  const [w, setW] = useState(() => { const v = parseInt(readPref(key), 10); return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback })
  const cur = useRef(w), raf = useRef(0)
  useEffect(() => { cur.current = w }, [w])
  const start = (e, { offset = 0, from } = {}) => {
    e.preventDefault()
    cur.current = w ?? from ?? fallback ?? min
    const move = (ev) => {
      const raw = edge === 'left' ? window.innerWidth - ev.clientX - offset : ev.clientX
      cur.current = Math.min(Math.max(raw, min), Math.min(max, Math.round(window.innerWidth * maxFrac)))
      if (!raf.current) raf.current = requestAnimationFrame(() => { raf.current = 0; setW(cur.current) })
    }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      writePref(key, cur.current)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  const reset = () => { setW(fallback); writePref(key, fallback) }
  return { w, start, reset }
}

// Close a popover or menu on a press outside it (outside every ref, and outside `keep`,
// a selector for parts that render elsewhere) and, unless told otherwise, on Escape.
export function useDismiss(open, refs, onClose, { escape = true, keep } = {}) {
  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (refs.some((r) => r.current && r.current.contains(e.target))) return
      if (keep && e.target?.closest?.(keep)) return
      onClose()
    }
    const key = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('pointerdown', close); if (escape) document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', close); if (escape) document.removeEventListener('keydown', key) }
  }, [open]) // eslint-disable-line
}
