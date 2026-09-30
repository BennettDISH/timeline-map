// Rich session notes: a small HTML vocabulary (bold, italic, underline, strike, headings, lists,
// paragraphs, quotes) and nothing else. Every note is cleaned on its way in (loaded, pasted) and
// on its way out (saved): other tags are unwrapped to their text, scripts and media are dropped
// with their contents, and no element keeps an attribute, so no style, link or handler survives.
const KEEP = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'P', 'DIV', 'BR', 'UL', 'OL', 'LI', 'H3', 'H4', 'BLOCKQUOTE'])
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'MATH', 'HEAD', 'TITLE',
  'META', 'LINK', 'IMG', 'PICTURE', 'VIDEO', 'AUDIO', 'CANVAS', 'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA'])
const BLOCK = new Set(['P', 'DIV', 'UL', 'OL', 'LI', 'H3', 'H4', 'BLOCKQUOTE'])

export function cleanHtml(html) {
  const doc = new DOMParser().parseFromString(`<body>${html || ''}</body>`, 'text/html') // an inert document: nothing in it runs
  const copy = (from, into) => {
    for (const ch of [...from.childNodes]) {
      if (ch.nodeType === 3) { into.appendChild(doc.createTextNode(ch.nodeValue)); continue }
      if (ch.nodeType !== 1 || DROP.has(ch.tagName)) continue
      const tag = ch.tagName
      // not ours, or a heading wrapped around whole blocks (a heading made inside a list): what it holds stays
      if (!KEEP.has(tag) || (/^H[34]$/.test(tag) && [...ch.children].some((c) => BLOCK.has(c.tagName)))) { copy(ch, into); continue }
      const el = doc.createElement(tag.toLowerCase())
      copy(ch, el)
      if ((tag === 'P' || tag === 'DIV') && !el.childNodes.length) continue // an empty paragraph is nothing (a blank line keeps its <br>)
      into.appendChild(el)
    }
  }
  const out = doc.createElement('div')
  copy(doc.body, out)
  // loose text at the top (a first line typed before any Enter) goes into a paragraph, so a saved
  // note always reads back as HTML, never as plain text whose & and < would be escaped twice
  const done = doc.createElement('div')
  let run = null
  for (const n of [...out.childNodes]) {
    if (n.nodeType === 3 || /^(B|STRONG|I|EM|U|S|STRIKE|BR)$/.test(n.nodeName)) {
      if (!run) { run = doc.createElement('p'); done.appendChild(run) }
      run.appendChild(n)
    } else { run = null; done.appendChild(n) }
  }
  for (const p of [...done.children]) if (p.tagName === 'P' && !p.textContent.trim() && !p.querySelector('br')) p.remove()
  return done.innerHTML
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const shouts = (s) => /[A-Z]{3}/.test(s) && !/[a-z]/.test(s)

// A note written as plain text (before the box was rich, or pasted as text) reads as it was
// meant: "· " and "- " lines are bullets, a line in capitals is a heading, a CAPITAL LABEL: opens
// its line in bold, and "12 · …" or "15–17 · …" bolds its footsteps
export function plainToHtml(text) {
  const out = []
  let items = null
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim()
    const item = /^[·•*-]\s+(.*)$/.exec(line)
    if (item) { (items ||= []).push(`<li>${esc(item[1])}</li>`); continue }
    if (items) { out.push(`<ul>${items.join('')}</ul>`); items = null }
    if (!line) continue
    const step = /^(\d+(?:[–-]\d+)?)\s+·\s+(.*)$/.exec(line)
    const label = /^([^:]{3,60}):\s+(.+)$/.exec(line)
    if (step) out.push(`<p><b>${esc(step[1])}</b> · ${esc(step[2])}</p>`)
    else if (label && shouts(label[1])) out.push(`<p><b>${esc(label[1])}:</b> ${esc(label[2])}</p>`)
    else if (line.length <= 80 && shouts(line.replace(/\([^)]*\)/g, ''))) out.push(`<h4>${esc(line)}</h4>`)
    else out.push(`<p>${esc(line)}</p>`)
  }
  if (items) out.push(`<ul>${items.join('')}</ul>`)
  return out.join('')
}

// what the editor shows for a stored note: HTML as cleaned HTML, anything else as plain text
export const asHtml = (stored) => (/<(p|div|br|ul|ol|li|b|strong|i|em|u|h3|h4|blockquote)\b/i.test(stored || '') ? cleanHtml(stored) : plainToHtml(stored))

// no words in it (an emptied editor leaves a <br> or empty paragraphs behind)
export const isBlank = (html) => !String(html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
