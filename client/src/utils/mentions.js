// @-mentions in an entry's text. Typing @ in a description, a DM note or a period text opens a
// picker of the world's entries (components/atlas/Mentions.jsx); a pick writes `@[Name](node:12)`,
// with `@37` after the id when the clock is on: the lens moment it was written at, which "go
// there" moves the lens back to. The server keeps the same pattern (server/lib/mentions.js).

const PATTERN = '@\\[([^\\]\\n]{1,255})\\]\\(node:(\\d{1,10})(?:@(-?\\d{1,10}))?\\)'
const re = () => new RegExp(PATTERN, 'g')

// the text in pieces: plain strings and { name, id, t } mentions
export function splitMentions(text) {
  const s = String(text ?? '')
  const out = []
  let at = 0
  for (const m of s.matchAll(re())) {
    if (m.index > at) out.push(s.slice(at, m.index))
    out.push({ name: m[1], id: Number(m[2]), t: m[3] == null ? null : Number(m[3]) })
    at = m.index + m[0].length
  }
  if (at < s.length) out.push(s.slice(at))
  return out
}

// every mention once, in order of first appearance (the same entry at two moments is two)
export function mentionsIn(text) {
  const seen = new Set()
  return splitMentions(text).filter((p) => {
    if (typeof p === 'string' || seen.has(`${p.id}@${p.t}`)) return false
    seen.add(`${p.id}@${p.t}`)
    return true
  })
}

// the names alone: a one-line preview (the list view)
export const plainMentions = (text) => splitMentions(text).map((p) => (typeof p === 'string' ? p : p.name)).join('')

// what a pick writes: a name can't close the brackets or break the line
export function mentionToken(name, id, t = null) {
  const clean = String(name || 'Untitled').replace(/[\]\n\r]+/g, ' ').trim().slice(0, 255) || 'Untitled'
  return `@[${clean}](node:${id}${t == null ? '' : `@${Math.round(t)}`})`
}

// Is the caret just after "@words"? The @ starts the text or follows a space or an opening
// bracket (so mail@host stays text), and what follows it, up to the caret, is the search: a
// name may have spaces in it, but not two in a row, a line break or more than 40 characters.
export function atQuery(text, caret) {
  const before = String(text ?? '').slice(0, caret)
  const at = before.lastIndexOf('@')
  if (at < 0) return null
  if (at > 0 && !/[\s([{"'“‘—–-]/.test(before[at - 1])) return null
  const q = before.slice(at + 1)
  if (q.length > 40 || /\n|\s{2}|^\s|[\]\[()]/.test(q)) return null
  return { start: at, query: q }
}

// the text with the @query from `start` to `caret` replaced by the token and a space after it
export function insertMention(text, start, caret, token) {
  const s = String(text ?? '')
  const after = s.slice(caret)
  const glue = after.startsWith(' ') ? '' : ' '
  const out = `${s.slice(0, start)}${token}${glue}${after}`
  return { text: out, caret: start + token.length + 1 }
}

// the picker's list: names starting with the search first, then names containing it, A–Z (the
// Party too: a mention of it at a moment goes to that footstep)
export function rankEntries(nodes, query, { exclude = null, limit = 8 } = {}) {
  const q = String(query || '').toLowerCase().trim()
  const pool = (nodes || []).filter((n) => n.id !== exclude)
  const starts = [], has = []
  for (const n of pool) {
    const t = String(n.title || '').toLowerCase()
    if (!q || t.startsWith(q)) starts.push(n)
    else if (t.includes(q)) has.push(n)
  }
  const az = (a, b) => String(a.title).localeCompare(String(b.title))
  return [...starts.sort(az), ...has.sort(az)].slice(0, limit)
}
