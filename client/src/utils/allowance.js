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
