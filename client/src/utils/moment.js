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

export function momentLabel(t, eras, unit) {
  const e = (eras || []).find((x) => t >= x.start && t <= x.end)
  if (!e) return `${t}${unit ? ` ${unit}` : ''}`
  const short = String(e.name).split(/\s+[—–-]\s+/)[0]
  const one = unit ? `${unit.replace(/s$/i, '')} ` : ''
  return `${short} · ${one}${t - e.start + 1}`
}
