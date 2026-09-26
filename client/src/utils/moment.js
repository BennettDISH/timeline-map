// One hue per session for the most recent eight; older sessions go quiet grey, so the
// colours keep telling recent sessions apart at campaign length instead of repeating.
const SESSION_COLORS = ['#38b6a3', '#d9a441', '#b07bd0', '#5b9bd5', '#d05b5b', '#4f9f6f', '#e0968f', '#c9c3ae']
export const OLD_SESSION_COLOR = '#8b909a'
export const sessionColor = (idx, latest = null) => {
  if (latest != null && latest - idx >= SESSION_COLORS.length) return OLD_SESSION_COLOR
  return SESSION_COLORS[((idx % SESSION_COLORS.length) + SESSION_COLORS.length) % SESSION_COLORS.length]
}
// the newest session's colour index (null when no era is a session)
export const latestSession = (eras) => { let m = -1; for (const e of eras || []) { const n = sessionNum(e); if (n != null && n - 1 > m) m = n - 1 } return m < 0 ? null : m }

// A session era is one NAMED "Session N": its number is read from the name, never from its
// position among the eras (DM-only lore eras and overlaps would shift it).
export const sessionNum = (era) => { const m = /^session\s+(\d+)/i.exec(era?.name || ''); return m ? Number(m[1]) : null }
const shortName = (era) => String(era?.name || '').split(/\s+[—–-]\s+/)[0]
// Among the eras containing a moment, a session era wins; otherwise the narrowest one.
const eraAt = (t, eras) => {
  const inside = (eras || []).filter((e) => t >= e.start && t <= e.end)
  if (!inside.length) return null
  return inside.find((e) => sessionNum(e) != null) || inside.slice().sort((a, b) => (a.end - a.start) - (b.end - b.start))[0]
}

// Which era (session) a moment falls in, and the footstep within it — or null outside all.
// idx drives the colour: session N is hue N-1 on every screen, DM and players alike.
export function sessionOf(t, eras) {
  const era = eraAt(t, eras)
  if (!era) return null
  const num = sessionNum(era)
  const sorted = [...(eras || [])].sort((a, b) => a.start - b.start)
  const idx = num != null ? num - 1 : sorted.indexOf(era)
  return { idx, num, era, short: shortName(era), step: t - era.start + 1 }
}
// the tag on the party's pin: S3·7 in a session, the era's name otherwise
export const stepTag = (so) => (so.num != null ? `S${so.num}·${so.step}` : `${so.short}·${so.step}`)
// the same moment in words: "Session 3 · footstep 7"
export const sessionLabel = (so, unit) => {
  const one = unit ? `${unit.replace(/s$/i, '')} ` : ''
  return `${so.num != null ? `Session ${so.num}` : so.short} · ${one}${so.step}`
}

// The party's live footstep at a moment, across the whole world (deepest map wins).
function partyWhere(trail, t) {
  const at = (v) => (v == null ? -Infinity : v)
  const alive = (trail || []).filter((s) => at(s.start) <= t && (s.end == null || t <= s.end))
  if (!alive.length) return null
  alive.sort((a, b) => (b.interior ? 1 : 0) - (a.interior ? 1 : 0) || at(b.start) - at(a.start))
  return alive[0]
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

// A moment on the world clock, read the way a table reads it: "Session 3 · footstep 7"
// when the moment falls inside a named era (the era's short name, before any dash, and
// the position within it), the raw number otherwise.
export function momentLabel(t, eras, unit) {
  const e = eraAt(t, eras)
  if (!e) return `${t}${unit ? ` ${unit}` : ''}`
  const one = unit ? `${unit.replace(/s$/i, '')} ` : ''
  return `${shortName(e)} · ${one}${t - e.start + 1}`
}
// a lifespan in words: "from …", "until …", or "… – …" — never a substituted clock minimum
export function spanLabel(start, end, eras, unit) {
  if (start == null && end == null) return 'always'
  if (start == null) return `until ${momentLabel(end, eras, unit)}`
  if (end == null) return `from ${momentLabel(start, eras, unit)}`
  return `${momentLabel(start, eras, unit)} – ${momentLabel(end, eras, unit)}`
}
