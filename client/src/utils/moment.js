// A moment on the world clock, read the way a table reads it: "Session 3 · footstep 7"
// when the moment falls inside a named era (the era's short name, before any dash, and
// the position within it), the raw number otherwise.
export function momentLabel(t, eras, unit) {
  const e = (eras || []).find((x) => t >= x.start && t <= x.end)
  if (!e) return `${t}${unit ? ` ${unit}` : ''}`
  const short = String(e.name).split(/\s+[—–-]\s+/)[0]
  const one = unit ? `${unit.replace(/s$/i, '')} ` : ''
  return `${short} · ${one}${t - e.start + 1}`
}
