// What a DM is told about a daily allowance before it is spent (server/lib/spend.js keeps the
// counts, and its sentence still answers a call it refuses). Pure, so a test reads the same words.
// An allowance is { limit, used, left, resetsAt }: `used` is this account's own and `left` also
// holds everyone's ceiling, so the count shown comes from `used` and the ceiling gets words of its
// own with no number in them. limit and left are null for an admin, who has no limit, and a
// database blip leaves the allowance out: both say nothing, as does a kind that is not running.

const NEAR = 0.8 // the share of the allowance used from which it is worth a word

function line(a, { name, showFrom, most = 1, costs = '' }) {
  if (!a || a.limit == null) return null
  if (a.limit === 0) return { text: `${name} isn't open to this account`, warn: true }
  const own = Math.max(0, a.limit - a.used)
  const count = `${own} of ${a.limit} left today`
  if (own === 0) return { text: `${count}. They come back at midnight UTC.`, warn: true }
  const room = a.left ?? own
  if (room === 0) return { text: `${name} has reached its daily limit for everyone. It opens again at midnight UTC.`, warn: true }
  const crowded = room < own
  const tight = most > room
  const near = a.used >= a.limit * NEAR
  if (!crowded && !tight && a.used < a.limit * showFrom) return null
  const more = [crowded && `${name} is close to its daily limit for everyone, so you may get fewer.`, tight && costs].filter(Boolean)
  return { text: more.length ? `${count}. ${more.join(' ')}` : count, warn: crowded || tight || near }
}

/**
 * The line in the Forge's compose row: from about 80% used, and as soon as one message may cost more
 * than what is left. `perMessage` is the most one message can use: one, plus one per painting.
 */
export const forgeLine = (a, perMessage = 1) => line(a, {
  name: 'The Forge', showFrom: NEAR, most: perMessage,
  costs: `One message can use up to ${perMessage}: one, plus one for each painting.`,
})

/** The line in the editor's voice section: a recording is one use, so the count is always worth showing. */
export const voiceLine = (a) => line(a, { name: 'Voice', showFrom: 0 })

// Kilobytes as a DM reads them, the same as the server's refusal: whole MB from 1 MB, KB under it
const size = (kb) => (kb >= 1024 ? `${Math.round(kb / 1024)} MB` : `${Math.max(1, Math.round(kb))} KB`)

/**
 * The line under the image picker's upload button, counted in KB (GET /api/images/allowance): from
 * about 80% of the day's uploads used, or as soon as everyone's ceiling leaves less than the account's own.
 */
export function uploadLine(a) {
  if (!a || a.limit == null) return null
  if (a.limit === 0) return { text: "Uploading isn't open to this account", warn: true }
  const own = Math.max(0, a.limit - a.used)
  if (own === 0) return { text: `Today's ${size(a.limit)} of uploads are used. They come back at midnight UTC.`, warn: true }
  const room = a.left ?? own
  if (room === 0) return { text: 'Uploading has reached its daily limit for everyone. It opens again at midnight UTC.', warn: true }
  if (room >= own && a.used < a.limit * NEAR) return null
  return { text: `${size(Math.min(own, room))} of today's ${size(a.limit)} of uploads left. They come back at midnight UTC.`, warn: true }
}

/**
 * The Share panel's line on the players' markers (world.playerMarkers, { count, max }): the count from
 * the first marker, a warning from about 80% of the most a world holds, and at the most what it means.
 */
export function markersLine(pm) {
  if (!pm || !pm.count) return null
  if (pm.count >= pm.max) return { text: `Players' markers: ${pm.count} of ${pm.max}, the most a world holds. Players can't add more until you remove some.`, warn: true }
  const near = pm.count >= pm.max * NEAR
  return { text: `Players' markers: ${pm.count} of ${pm.max}${near ? '. Near the most a world holds: remove some to give players room.' : ''}`, warn: near }
}

/**
 * The Dashboard's line on how many worlds the account holds (GET /api/worlds' `limit`, { count, max }):
 * nothing until about 80% of the most, then the count, and at the most what it means.
 */
export function worldsLine(l) {
  if (!l || !l.max || l.count < l.max * NEAR) return null
  if (l.count >= l.max) return { text: `You have ${l.count} of ${l.max} worlds, the most an account holds. Delete one to make room for a new one.`, warn: true }
  return { text: `You have ${l.count} of ${l.max} worlds.`, warn: true }
}

/**
 * The workspace's heads-up on how full the world is (world.room, and the reply to an add that leaves
 * it nearly full: { what, count, max } for its fullest kind, the server's lib/room.js): nothing under
 * about 80% of the most, then the count, and at the most what it means. `short` is the top bar's chip.
 */
export function roomLine(r) {
  if (!r || !r.max || !(r.count >= r.max * NEAR)) return null
  const n = (v) => Number(v).toLocaleString('en-US')
  if (r.count >= r.max) return { text: `This world holds ${n(r.count)} of ${n(r.max)} ${r.what}, the most it can. Delete some to make room for more.`, short: `Full: ${n(r.max)} ${r.what}`, warn: true }
  return { text: `This world holds ${n(r.count)} of ${n(r.max)} ${r.what}, near the most it can.`, short: `${n(r.count)} of ${n(r.max)} ${r.what}`, warn: true }
}
