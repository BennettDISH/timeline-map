// A moment on the world clock, read the way a table reads it: "Session 3 · footstep 7"
// when the moment falls inside a named era (the era's short name, before any dash, and
// the position within it), the raw number otherwise.
// One hue per session, in era order, so a footstep's age reads at a glance.
export const SESSION_COLORS = ['#38b6a3', '#d9a441', '#b07bd0', '#5b9bd5', '#d05b5b', '#4f9f6f', '#e0968f', '#c9c3ae']
export const sessionColor = (idx) => SESSION_COLORS[((idx % SESSION_COLORS.length) + SESSION_COLORS.length) % SESSION_COLORS.length]

// Which era (session) a moment falls in, and the footstep within it — or null outside all.
export function sessionOf(t, eras) {
  const sorted = [...(eras || [])].sort((a, b) => a.start - b.start)
  const idx = sorted.findIndex((e) => t >= e.start && t <= e.end)
  return idx < 0 ? null : { idx, era: sorted[idx], step: t - sorted[idx].start + 1 }
}

// The party's live footstep at a moment, across the whole world (deepest map wins).
export function partyWhere(trail, t) {
  const at = (v) => (v == null ? -Infinity : v)
  const alive = (trail || []).filter((s) => at(s.start) <= t && (s.end == null || t <= s.end))
  if (!alive.length) return null
  alive.sort((a, b) => (b.interior ? 1 : 0) - (a.interior ? 1 : 0) || at(b.start) - at(a.start))
  return alive[0]
}

// After the party left THIS map (its last footstep here ended before t), the first footstep
// elsewhere — the deepest map among ties — so a trail can say where they went.
export function partyNextFrom(trail, mapId, t) {
  const at = (v) => (v == null ? -Infinity : v)
  const here = (trail || []).filter((s) => String(s.mapId) === String(mapId) && at(s.start) <= t)
  if (!here.length) return null
  here.sort((a, b) => at(b.start) - at(a.start))
  const last = here[0]
  if (last.end == null || t <= last.end) return null
  const after = (trail || []).filter((s) => String(s.mapId) !== String(mapId) && s.start != null && s.start > last.end)
  if (!after.length) return null
  after.sort((a, b) => a.start - b.start || (b.interior ? 1 : 0) - (a.interior ? 1 : 0))
  return after[0]
}

// The footstep before and after the party's current one (deepest map among ties), so the
// Party's own text can say where they came from and where they went next.
export function partyNeighbors(trail, t) {
  const at = (v) => (v == null ? -Infinity : v)
  const deep = (list, dir) => {
    if (!list.length) return null
    list.sort((a, b) => dir * (at(a.start) - at(b.start)) || (b.interior ? 1 : 0) - (a.interior ? 1 : 0))
    return list[0]
  }
  const cur = partyWhere(trail, t)
  if (!cur) return { prev: null, next: null }
  const prev = deep((trail || []).filter((s) => s.end != null && s.end < at(cur.start)), -1)
  const next = cur.end == null ? null : deep((trail || []).filter((s) => s.start != null && s.start > cur.end), 1)
  return { prev, next }
}

export function momentLabel(t, eras, unit) {
  const e = (eras || []).find((x) => t >= x.start && t <= x.end)
  if (!e) return `${t}${unit ? ` ${unit}` : ''}`
  const short = String(e.name).split(/\s+[—–-]\s+/)[0]
  const one = unit ? `${unit.replace(/s$/i, '')} ` : ''
  return `${short} · ${one}${t - e.start + 1}`
}
