import React, { useRef, useState } from 'react'
import atlasService from '../../services/atlasService'
import { cat } from '../../utils/categories'
import { atQuery, insertMention, mentionToken, mentionsIn, rankEntries } from '../../utils/mentions'
import { useFlag } from '../../hooks/prefs'

// @-mentions (utils/mentions.js has the pattern). MentionBox wraps one textarea of the editor:
// typing @ opens a picker of the world's entries under it (↑ ↓ to choose, Enter or Tab to take,
// Esc to close), and a pick writes the mention where the @ was, with the lens moment when the
// clock is on. A mention is a jump link; "🧵 Also thread them" under the list (off until ticked,
// remembered in this browser) makes the pick a thread too. The DM notes never offer it: a thread
// would show players what the note keeps. MentionChips lists the mentions under a box the DM is typing in, since a textarea
// can't hold a button; MentionText (components/MentionText.jsx) draws them in read text.

// a value set the way typing sets it, so a controlled box's onChange hears it
function typeInto(el, value) {
  const proto = Object.getPrototypeOf(el)
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

const PICK_KEYS = ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape']

export function MentionBox({ worldId, exclude, moment = null, canThread = false, onPicked, children }) {
  const box = useRef(null)
  const [threadToo, setThreadToo] = useFlag('atlas_mention_thread', false)
  const [at, setAt] = useState(null) // { start, query } while an @search is open
  const [nodes, setNodes] = useState(undefined) // the world's entries: undefined until the first @, then loading, a list, or null (failed)
  const [hi, setHi] = useState(0)
  const closed = useRef(null) // the @ that Esc closed: it stays closed until the caret leaves it
  const child = React.Children.only(children)
  const scan = () => {
    const el = box.current
    if (!el) return
    const q = el.selectionStart === el.selectionEnd ? atQuery(el.value, el.selectionStart) : null
    if (!q) closed.current = null
    const open = q && q.start !== closed.current ? q : null
    if (at?.query !== open?.query) setHi(0)
    setAt(open)
    // each new @ reads the entries afresh (one made since shows up); the last list stands meanwhile
    if (open && !at) {
      if (!Array.isArray(nodes)) setNodes('loading')
      atlasService.getNodes(worldId).then(setNodes).catch(() => setNodes((cur) => (Array.isArray(cur) ? cur : null)))
    }
  }
  const list = at && Array.isArray(nodes) ? rankEntries(nodes, at.query, { exclude }) : []
  const pick = (node) => {
    const el = box.current
    if (!el || !at) return
    const r = insertMention(el.value, at.start, el.selectionStart, mentionToken(node.title, node.id, moment))
    typeInto(el, r.text)
    el.setSelectionRange(r.caret, r.caret)
    setAt(null)
    onPicked?.(node, { thread: canThread && threadToo })
  }
  const onKeyDown = (e) => {
    if (at && PICK_KEYS.includes(e.key)) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closed.current = at.start; setAt(null); return }
      if (list.length) {
        e.preventDefault()
        if (e.key === 'ArrowDown') setHi((h) => (h + 1) % list.length)
        else if (e.key === 'ArrowUp') setHi((h) => (h - 1 + list.length) % list.length)
        else pick(list[Math.min(hi, list.length - 1)])
        return
      }
    }
    child.props.onKeyDown?.(e)
  }
  return (
    <div className="mbox">
      {React.cloneElement(child, {
        ref: box,
        onKeyDown,
        onKeyUp: (e) => { if (!(at && PICK_KEYS.includes(e.key))) scan(); child.props.onKeyUp?.(e) },
        onInput: (e) => { scan(); child.props.onInput?.(e) },
        onClick: (e) => { scan(); child.props.onClick?.(e) },
        onBlur: (e) => { setAt(null); child.props.onBlur?.(e) },
      })}
      {at && (
        <div className="mpick" role="listbox" aria-label="Mention an entry">
          {nodes === null ? <div className="muted esmall">Couldn't load the entries</div>
            : !Array.isArray(nodes) ? <div className="muted esmall">Loading…</div>
            : !list.length ? <div className="muted esmall">{at.query ? `No entry named like “${at.query}”` : 'No other entries yet'}</div>
            : list.map((n, i) => (
              // mousedown keeps the caret in the box, so the pick lands where the @ was
              <button key={n.id} type="button" role="option" aria-selected={i === hi} className={i === hi ? 'on' : ''}
                onMouseDown={(e) => { e.preventDefault(); pick(n) }} onMouseEnter={() => setHi(i)}>
                <span className="ic" style={{ background: cat(n.category).c }}>{cat(n.category).i}</span>
                <span className="mname">{n.title}</span>
                {n.visibility === 'dm' && <span className="glock" title="DM only">🔒</span>}
              </button>
            ))}
          {canThread && (
            <button type="button" className={`mthread ${threadToo ? 'on' : ''}`} aria-pressed={threadToo}
              title="Also make a thread between the two entries — players see threads between things they can see"
              onMouseDown={(e) => { e.preventDefault(); setThreadToo((v) => !v) }}>
              {threadToo ? '☑' : '☐'} 🧵 Also thread them
            </button>
          )}
          <div className="mhint muted">↑ ↓ to choose · Enter to mention · Esc to close</div>
        </div>
      )}
    </div>
  )
}

// the mentions in a box's text, as buttons under it; 🕓 marks one that carries a moment
export function MentionChips({ text, onGo, label }) {
  const ms = mentionsIn(text)
  if (!ms.length) return null
  return (
    <div className="mchips">
      {ms.map((m) => (
        <button key={`${m.id}@${m.t}`} type="button" className="chip mchip" title={label ? label(m) : `Go to “${m.name}”`} onClick={() => onGo(m.id, m.t)}>
          ↪ {m.name}{m.t != null && <span className="mwhen" aria-hidden="true"> 🕓</span>}
        </button>
      ))}
    </div>
  )
}
