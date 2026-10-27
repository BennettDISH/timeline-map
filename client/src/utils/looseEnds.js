// The Loose ends list's own rules (components/atlas/LooseEnds.jsx): how long counts as quiet,
// how a quiet spell reads, and the entries the DM set aside for now. The server says when each
// entry last came up (server/lib/looseEnds.js); everything here is the DM's choice and this
// browser's memory, so nothing here is ever sent.

const DAY = 24 * 60 * 60 * 1000
export const QUIET = [
  { days: 7, label: 'a week' },
  { days: 14, label: '2 weeks' },
  { days: 30, label: 'a month' },
  { days: 90, label: '3 months' },
]
export const DEFAULT_DAYS = 14

// "4 days", "3 weeks", "2 months", "a year"
export function quietFor(ms) {
  const d = Math.max(0, Math.floor(ms / DAY))
  if (d < 1) return 'less than a day'
  if (d < 14) return d === 1 ? 'a day' : `${d} days`
  if (d < 60) return `${Math.floor(d / 7)} weeks`
  if (d < 365) return `${Math.floor(d / 30)} months`
  const y = Math.floor(d / 365)
  return y === 1 ? 'a year' : `${y} years`
}

// what a set-aside entry is: { [id]: when it was set aside, ms }. "Not now" holds until the
// entry comes up again, or until it has been quiet for the chosen spell once more.
export function isSetAside(e, aside, { now, days }) {
  const at = aside?.[e.id]
  if (!at) return false
  return at >= Date.parse(e.lastUp) && now - at < days * DAY
}

// the entries quiet for at least `days`, oldest first (the server's order), split into the
// ones to show and the ones set aside
export function quietEntries(entries, { now, days, aside }) {
  const quiet = (entries || []).filter((e) => now - Date.parse(e.lastUp) >= days * DAY)
  const shown = [], hidden = []
  for (const e of quiet) (isSetAside(e, aside, { now, days }) ? hidden : shown).push(e)
  return { shown, hidden }
}

// one line under the title: "quiet 5 weeks · named in Session 4's recap"
export function whyLine(e, now) {
  const parts = [`quiet ${quietFor(now - Date.parse(e.lastUp))}`]
  if (e.named) parts.push(`last named in ${e.named.era}’s ${e.named.note}`)
  if (!e.placed) parts.push('on no map')
  return parts.join(' · ')
}

// this browser's memory, per world; a blocked or broken store is an empty one
const key = (worldId) => `atlas_loose_${worldId}`
export function readAside(worldId) {
  try {
    const v = JSON.parse(localStorage.getItem(key(worldId)) || '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch { return {} }
}
export function writeAside(worldId, aside) {
  try { localStorage.setItem(key(worldId), JSON.stringify(aside)) } catch { /* private window: it lasts the visit */ }
}
export function readDays() {
  try {
    const d = Number(localStorage.getItem('atlas_loose_days'))
    return QUIET.some((q) => q.days === d) ? d : DEFAULT_DAYS
  } catch { return DEFAULT_DAYS }
}
export function writeDays(d) {
  try { localStorage.setItem('atlas_loose_days', String(d)) } catch { /* as above */ }
}
