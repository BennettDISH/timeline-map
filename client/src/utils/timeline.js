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
