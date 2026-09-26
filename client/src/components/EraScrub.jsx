import { momentLabel, sessionNum } from '../utils/moment'
import React, { useState, useEffect, useMemo } from 'react'

// The player's window into the past: a scrubber whose reachable range is the union of the
// DM's player-visible eras, hard-stopped at the canon moment. Dragging snaps to the nearest
// revealed stretch and commits on every step; the parent filters locally (value=null means
// "now"). The server re-validates every requested moment — this bar is UX, not the
// security boundary.
export default function EraScrub({ tl, eras, value, onChange, win = null }) {
  const canon = tl?.current ?? 0
  // a map's focus period narrows the TRACK to its stretch of history (same one clock)
  // a window that leaves no stretch of history to scrub (an instant, or one entirely outside
  // the revealed range) is treated as no window at all, never as an empty bar
  const useWin = win && (win.min == null || win.max == null || win.min < win.max)
  const wLo = useWin && win.min != null ? win.min : -Infinity
  const wHi = Math.min(canon, useWin && win.max != null ? win.max : canon)
  const segs = useMemo(() => (
    (eras || [])
      .map((e) => ({ name: e.name, s: Math.max(e.start, wLo === -Infinity ? e.start : wLo), en: Math.min(e.end, wHi) }))
      .filter((e) => e.s <= e.en)
      .sort((a, b) => a.s - b.s)
  ), [eras, wLo, wHi])

  const lo = segs.length ? segs[0].s : wHi
  const hi = wHi
  const span = Math.max(1, hi - lo)
  const [dv, setDv] = useState(value == null ? canon : value)
  const [typed, setTyped] = useState(null) // string while typing an exact moment
  const unitOne = tl?.unit ? tl.unit.replace(/s$/i, '') : 'moment'
  useEffect(() => { setDv(value == null ? canon : value) }, [value, canon])

  if (!tl?.enabled) return null
  if (segs.length === 0 || hi <= lo) {
    // nothing left to scrub — but a view still in the past always has a way back to now
    if (value == null) return null
    return (
      <div className="erabar">
        <div className="ezone">
          <span className="einfo">that stretch of the past isn't open any more</span>
          <button className="tool enow" title="Back to the present" onClick={() => onChange(null)}>⦿ Now</button>
        </div>
      </div>
    )
  }

  const snap = (t) => {
    if (t >= canon) return canon
    let best = canon; let bd = Infinity
    for (const g of segs) {
      if (t >= g.s && t <= g.en) return t
      const edge = t < g.s ? g.s : g.en
      const d = Math.abs(edge - t)
      if (d < bd) { bd = d; best = edge }
    }
    return best
  }
  const commit = (t) => onChange(t >= canon ? null : t)
  const move = (raw) => {
    const r = Number(raw)
    let t = snap(r)
    // a one-step move (arrow keys) that leaves a revealed stretch crosses the gap in the
    // direction pressed, instead of snapping back to the edge it just left
    if (t !== r && r < canon) {
      if (r > dv) { const nxt = segs.find((g) => g.s > dv); if (nxt) t = nxt.s }
      else if (r < dv) { const prv = [...segs].reverse().find((g) => g.en < dv); if (prv) t = prv.en }
    }
    setDv(t)
    commit(t)
  }
  const pct = (t) => `${((t - lo) / span) * 100}%`
  const cur = segs.find((g) => dv >= g.s && dv <= g.en)

  return (
    <div className="erabar">
      <div className="etrack">
        {segs.map((g, i) => {
          // a crowded bar prints the short form (S12) so every session stays named
          const n = sessionNum(g); const compact = segs.length > 12 && n != null
          return (
            <span key={i} className="eseg" title={g.name} style={{ left: pct(g.s), width: `${((g.en - g.s) / span) * 100}%` }}>
              <em>{compact ? `S${n}` : g.name}</em>
            </span>
          )
        })}
        <input
          type="range" min={lo} max={hi} value={Math.min(Math.max(dv, lo), hi)}
          onChange={(e) => move(e.target.value)}
        />
      </div>
      <div className="ezone">
        {typed != null ? (
          <input className="tnowedit" autoFocus type="number" value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const raw = String(typed ?? '').trim(); const v = Number(raw); setTyped(null)
                if (raw !== '' && Number.isFinite(v)) { const t = snap(Math.round(v)); setDv(t); commit(t) } // blank = no change
              } else if (e.key === 'Escape') setTyped(null)
            }}
            onBlur={() => {
              if (typed == null) return
              const raw = String(typed ?? '').trim(); const v = Number(raw); setTyped(null)
              if (raw !== '' && Number.isFinite(v)) { const t = snap(Math.round(v)); setDv(t); commit(t) }
            }} />
        ) : (
          <button className="einfo einfobtn" title={`Click to type a ${unitOne} number — it snaps into the revealed past`}
            onClick={() => setTyped(String(dv >= canon ? canon : dv))}>
            {dv >= canon ? `now · ${momentLabel(canon, eras, tl.unit)}` : momentLabel(dv, eras, tl.unit)}
          </button>
        )}
        <button className="tool enow" style={value == null ? { visibility: 'hidden' } : undefined}
          title="Back to the present" onClick={() => { setDv(canon); onChange(null) }}>⦿ Now</button>
      </div>
    </div>
  )
}
