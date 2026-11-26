// Which name a band on the players' era bar prints (components/EraScrub.jsx): the longest form
// that fits the band's RENDERED width, so a phone goes short early and a desktop keeps whole
// names. From longest: the whole name ("Session 7 — The Drowned Bell"), the name before its
// subtitle ("Session 7"), S7; then, with the side padding pared to 2px, S7 and the bare 7. A lore
// era (no session number) whose name does not fit shows its start with an ellipsis while three
// letters fit, and nothing below that. A band with no label still keeps its tooltip, and the
// readout under the bar names the moment either way.
// The sizes mirror `.etrack .eseg` in styles/atlas/_timebar.scss: keep them in step.
export const BAND_BORDER = 2 // 1px each side, inside the band's width (border-box)
export const BAND_PAD = 7 // the label's side padding
export const BAND_PAD_TIGHT = 2 // `em.tight`
const SLACK = 1 // a label that only just fits must not tip into an ellipsis on subpixel rounding

// name: the era's name; num: its session number (sessionNum) or null; width: the band's width
// in px; measure(text) → the text's width in px in the band's font. Returns { text, tight } or
// null for no label. A width not measured yet (0) prints the whole name, as the bar always did.
export function bandLabel(name, num, width, measure) {
  const full = String(name || '')
  if (!(width > 0)) return full ? { text: full, tight: false } : null
  const head = full.split(/\s+[—–-]\s+/)[0] // the same split as the readout's short name (moment.js)
  const short = num != null ? `S${num}` : null
  const fits = (text, pad) => measure(text) + SLACK <= width - BAND_BORDER - 2 * pad
  for (const text of [full, head, short]) if (text && fits(text, BAND_PAD)) return { text, tight: false }
  if (num != null) {
    for (const text of [short, String(num)]) if (fits(text, BAND_PAD_TIGHT)) return { text, tight: true }
    return null
  }
  return head && fits(`${head.slice(0, 3)}…`, BAND_PAD) ? { text: head, tight: false } : null
}

// The font a band's label is drawn in, read from the rendered element.
export function fontOf(el) {
  const cs = getComputedStyle(el)
  return { font: `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`, ls: parseFloat(cs.letterSpacing) || 0, size: parseFloat(cs.fontSize) || 10.5 }
}

// A text's width in that font, measured on a canvas (nothing on the page reflows).
let ctx2d
export function textWidth(text, f) {
  if (ctx2d === undefined) ctx2d = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null
  const ls = f?.ls || 0
  if (!ctx2d || !f?.font) return text.length * ((f?.size || 10.5) * 0.62 + ls) // no canvas: a generous estimate
  ctx2d.font = f.font
  return ctx2d.measureText(text).width + ls * text.length
}
