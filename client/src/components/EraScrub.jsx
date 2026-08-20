import React, { useState, useEffect, useMemo } from 'react'

// The player's window into the past: a scrubber whose reachable range is the union of the
// DM's player-visible eras, hard-stopped at the canon moment. Dragging snaps to the nearest
// revealed stretch; the commit only fires when the drag ends (value=null means "now").
// The server re-validates every requested moment — this bar is UX, not the security boundary.
export default function EraScrub({ tl, eras, value, onChange, live = false }) {
  const canon = tl?.current ?? 0
  const segs = useMemo(() => (
    (eras || [])
      .map((e) => ({ name: e.name, s: e.start, en: Math.min(e.end, canon) }))
      .filter((e) => e.s <= e.en && e.s <= canon)
      .sort((a, b) => a.s - b.s)
  ), [eras, canon])

  const lo = segs.length ? Math.min(segs[0].s, canon) : canon
  const span = Math.max(1, canon - lo)
  const [dv, setDv] = useState(value == null ? canon : value)
  useEffect(() => { setDv(value == null ? canon : value) }, [value, canon])

  if (!tl?.enabled || segs.length === 0) return null

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
    const t = snap(Number(raw))
    setDv(t)
    if (live) commit(t)
  }
  const pct = (t) => `${((t - lo) / span) * 100}%`
  const cur = segs.find((g) => dv >= g.s && dv <= g.en)

  return (
    <div className="erabar">
      <div className="etrack">
        {segs.map((g, i) => (
          <span key={i} className="eseg" style={{ left: pct(g.s), width: `${((g.en - g.s) / span) * 100}%` }}>
            <em>{g.name}</em>
          </span>
        ))}
        <input
          type="range" min={lo} max={canon} value={dv}
          onChange={(e) => move(e.target.value)}
          onPointerUp={() => !live && commit(dv)}
          onKeyUp={(e) => { if (!live && (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End')) commit(dv) }}
        />
      </div>
      <span className="einfo">
        {dv >= canon ? `now · ${canon} ${tl.unit}` : `${dv} ${tl.unit}${cur ? ` · ${cur.name}` : ''}`}
      </span>
      {value != null && <button className="tool enow" title="Back to the present" onClick={() => { setDv(canon); onChange(null) }}>⦿ Now</button>}
    </div>
  )
}
