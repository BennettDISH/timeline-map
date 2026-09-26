import { pickCovering } from '../../utils/timeline'

// Small helpers shared by the workspace and its panels (no React in here).

export const clamp = (v) => Math.max(0, Math.min(100, v))
// a moment typed into a number input: '' = open (null), a decimal rounds, a non-number is undefined (not sent)
export const wholeOr = (v) => { if (v === '' || v == null) return null; const n = Math.round(Number(v)); return Number.isFinite(n) ? n : undefined }
// Both bounds of a period are read together when either input blurs (the two number inputs
// share a parent). A reversed pair is HELD with a hint and never sent — the DM is mid-edit,
// typing the start before the end; a non-number remounts to the stored value; otherwise only
// the bounds that changed travel, and a refused save (a stale tab) remounts to the stored ones.
export function periodBlur(e, cur, id, { hint, bump, send, required = false }) {
  const [si, ei] = e.target.parentElement.querySelectorAll('input[type=number]')
  const st = wholeOr(si.value), en = wholeOr(ei.value)
  if (st === undefined || en === undefined || (required && (st == null || en == null))) { bump(); return }
  if (st != null && en != null && st > en) { hint(id); return }
  hint(null)
  const patch = {}
  if (st !== (cur.start ?? null)) patch.start_time = st
  if (en !== (cur.end ?? null)) patch.end_time = en
  if (Object.keys(patch).length) Promise.resolve(send(patch)).then((ok) => { if (ok === false) bump() })
}
export const REVERSED = '⚠ Ends before it starts — not saved until the bounds are in order.'
// Enter or Space on a link-like control acts like a click
export const keyAct = (fn) => (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn() } }
// pins sharing a spot fan out in a small ring (screen pixels, like the party's footprints) so
// each stays visible and clickable; the first keeps the exact spot
export const stackOffsets = (pins) => {
  const key = (p) => `${Math.round(p.x * 2) / 2},${Math.round(p.y * 2) / 2}`
  const groups = new Map(), out = new Map()
  for (const p of pins) { const g = groups.get(key(p)) || []; g.push(p.id); groups.set(key(p), g) }
  for (const g of groups.values()) g.forEach((id, k) => {
    if (!k) return
    const ring = Math.floor((k - 1) / 6), dy = 27 + 18 * ring, dx = 30 + 18 * ring
    out.set(id, [[0, dy], [0, -dy], [dx, dy], [-dx, dy], [dx, -dy], [-dx, -dy]][(k - 1) % 6])
  })
  return out
}
// the period text that covers moment t (utils/timeline's rule). A blank period is no story yet.
export const coveringFact = (facts, t) => pickCovering((facts || []).filter((f) => f.body?.trim()), t)
export const trunc = (t) => (t && t.length > 18 ? `${t.slice(0, 17)}…` : t)

// a phone: narrow, or a touch-first pointer — editing happens on a PC (CLAUDE.md), so it lands in View
export const isPhone = () => { try { return window.innerWidth <= 700 || window.matchMedia('(pointer:coarse)').matches } catch (e) { return false } }
