// The two time rules every surface shares, written once. share.js applies the same two in
// SQL (PRESENT, and ORDER BY start_time DESC NULLS LAST, id DESC) so players see what the DM's
// lens shows.
// A row (placement, backdrop, period text, footstep) is present at moment t when its lifespan
// covers t; an open bound covers everything on that side.
export const isPresent = (row, t) => (row.start == null || row.start <= t) && (row.end == null || t <= row.end)

// Of the rows covering t, the latest-starting one wins and ties go to the newest row. A `rank`
// the server computed (before it snapped starts into the revealed past) beats both. null when
// nothing covers t.
export const pickCovering = (rows, t) => {
  const hit = (rows || []).filter((r) => isPresent(r, t))
  if (!hit.length) return null
  hit.sort((a, b) => (a.rank != null && b.rank != null)
    ? a.rank - b.rank
    : (((b.start ?? -Infinity) - (a.start ?? -Infinity)) || (b.id - a.id)))
  return hit[0]
}

// The period text that covers moment t. A blank period is no story yet: the description stands.
export const coveringFact = (facts, t) => pickCovering((facts || []).filter((f) => f.body?.trim()), t)

// The editor's warning under the description box, or null when no period text hides the
// description at the two moments the DM can look at: the lens (what the reader shows) and canon
// (what players read). A period elsewhere on the clock hides nothing here. `span` words a
// period's bounds. Words only: the text still resolves through coveringFact.
export const descriptionWarning = (facts, lens, canon, span) => {
  const here = coveringFact(facts, lens)
  const there = canon == null ? null : coveringFact(facts, canon)
  if (!here && !there) return null
  const where = here && there && here.id === there.id
    ? `this moment and canon (${span(here)})`
    : [here && `this moment (${span(here)})`, there && `canon (${span(there)})`].filter(Boolean).join(' and ')
  return `⚠ Period text replaces this default at ${where}. Changes here won't show there.`
}
