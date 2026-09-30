import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Modal from '../Modal'
import { sessionOf } from '../../utils/moment'
import { asHtml, cleanHtml, isBlank, plainToHtml } from '../../utils/richNote'

// The DM's session notes, under the map tree. Every era (a session, usually) keeps two: Prep,
// written before it is played, and Recap, what happened and where things stand after. The box
// follows the timeline: it shows the era under the lens, and the picker looks at any other until
// the lens moves into another era. A note is rich text (bold, italic, headings, lists), stored as
// cleaned HTML (utils/richNote.js), and saves as it goes (a pause in typing, or leaving the box)
// like the rest of the workspace. DM-only: share.js never sends these columns.
const COL = { prep: 'prep_note', recap: 'recap_note' }
const FIELD = { prep: 'prepNote', recap: 'recapNote' }
const HINT = {
  prep: 'Before it is played: where everyone is, what could happen, what to remember',
  recap: 'After it is played: what happened, and where things stand',
}

// The editable note. Its HTML is set only when a new note arrives (`v` changes), never from a
// keystroke, so the caret stays put. Toolbar buttons act on mousedown without taking the focus.
function RichNote({ html, v, placeholder, label, onInput, onBlur }) {
  const box = useRef(null)
  const [blank, setBlank] = useState(isBlank(html))
  useLayoutEffect(() => { if (box.current) box.current.innerHTML = html; setBlank(isBlank(html)) }, [v]) // eslint-disable-line react-hooks/exhaustive-deps
  const changed = () => { const h = box.current.innerHTML; setBlank(isBlank(h)); onInput(h) }
  const act = (cmd, arg) => (e) => {
    if (e.type === 'click' && e.detail !== 0) return // a mouse press already acted on mousedown
    e.preventDefault()
    box.current.focus()
    if (cmd === 'heading') {
      for (const l of ['insertOrderedList', 'insertUnorderedList']) if (document.queryCommandState(l)) document.execCommand(l) // a heading leaves the list first
      const inHeading = /^h[34]$/i.test(document.queryCommandValue('formatBlock') || '')
      document.execCommand('formatBlock', false, inHeading ? '<p>' : '<h4>')
    } else document.execCommand(cmd, false, arg)
    changed()
  }
  // pasted text keeps its bold and lists, and nothing else: no styles, links, images or scripts
  const paste = (e) => {
    e.preventDefault()
    const h = e.clipboardData.getData('text/html')
    document.execCommand('insertHTML', false, h ? cleanHtml(h) : plainToHtml(e.clipboardData.getData('text/plain')))
    changed()
  }
  const tool = (cmd, arg, title, face) => (
    <button type="button" title={title} aria-label={title.replace(/ \(.*\)$/, '')} onMouseDown={act(cmd, arg)} onClick={act(cmd, arg)}>{face}</button>
  )
  return (
    <div className="snrich">
      <div className="sntools" role="toolbar" aria-label="Formatting">
        {tool('bold', null, 'Bold (Ctrl+B)', <b>B</b>)}
        {tool('italic', null, 'Italic (Ctrl+I)', <i>I</i>)}
        {tool('heading', null, 'Heading', 'H')}
        {tool('insertUnorderedList', null, 'Bullets', '•')}
        {tool('insertOrderedList', null, 'Numbered list', '1.')}
      </div>
      <div ref={box} className={`sntext${blank ? ' blank' : ''}`} contentEditable suppressContentEditableWarning
        role="textbox" aria-multiline="true" aria-label={label} data-ph={placeholder}
        onInput={changed} onBlur={onBlur} onPaste={paste}
        onFocus={() => document.execCommand('defaultParagraphSeparator', false, 'p')} />
    </div>
  )
}

export default function SessionNotes({ eras, lens, canon, onSave }) {
  const list = [...(eras || [])].sort((a, b) => a.start - b.start || a.id - b.id)
  const atLens = sessionOf(lens, list)?.era || null
  // a pick from the list holds until the lens moves into another era (store what a render saw)
  const [pick, setPick] = useState(null)
  const [seen, setSeen] = useState(atLens?.id ?? null)
  if ((atLens?.id ?? null) !== seen) { setSeen(atLens?.id ?? null); setPick(null) }
  const era = list.find((e) => e.id === pick) || atLens || list[list.length - 1] || null
  // an era still to be played opens on its prep, one already played on its recap
  const [chosen, setChosen] = useState({ id: null, tab: null })
  const tab = chosen.id === era?.id && chosen.tab ? chosen.tab : (era && canon != null && era.start > canon ? 'prep' : 'recap')
  const [wide, setWide] = useState(false)

  // the draft is the note being edited (HTML); `base` is the stored text it started from, so a
  // note that changed elsewhere (another tab, a reload of the world) replaces a draft nobody has
  // touched — never one being typed or on its way to the server. `v` counts fresh loads.
  const key = era ? `${era.id}:${tab}` : ''
  const stored = era ? era[FIELD[tab]] || '' : ''
  const [draft, setDraft] = useState({ key, text: asHtml(stored), base: stored, dirty: false, sending: false, v: 0 })
  if (draft.key !== key || (!draft.dirty && !draft.sending && stored !== draft.base)) {
    setDraft({ key, text: asHtml(stored), base: stored, dirty: false, sending: false, v: draft.v + 1 })
  }
  const draftRef = useRef(draft)
  draftRef.current = draft
  const saveRef = useRef(onSave)
  saveRef.current = onSave
  const timer = useRef(null)

  const save = () => {
    clearTimeout(timer.current)
    const d = draftRef.current
    if (!d.dirty || !d.key) return
    const [id, t] = d.key.split(':')
    const clean = isBlank(d.text) ? '' : cleanHtml(d.text)
    setDraft((x) => (x.key === d.key ? { ...x, dirty: false, sending: true } : x))
    Promise.resolve(saveRef.current(Number(id), { [COL[t]]: clean }))
      .then((ok) => setDraft((x) => (x.key !== d.key ? x
        : ok === false ? { ...x, dirty: true, sending: false } : { ...x, base: clean, sending: false })))
  }
  useEffect(() => () => save(), []) // eslint-disable-line react-hooks/exhaustive-deps -- leaving the workspace keeps what was typed

  if (!era) {
    return (
      <section className="snotes" aria-label="Session notes">
        <div className="snhead"><div className="tsect">Session notes</div></div>
        <p className="muted esmall">Notes live on the sessions: ＋ Next session in the timeline's ⚙ starts one</p>
      </section>
    )
  }
  const typed = (html) => {
    setDraft((x) => ({ ...x, text: html, dirty: true }))
    clearTimeout(timer.current)
    timer.current = setTimeout(save, 1200)
  }
  const tabs = (
    <div className="sntabs" role="tablist" aria-label="Before or after the session">
      {['prep', 'recap'].map((t) => (
        <button key={t} type="button" role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''}
          onClick={() => { save(); setChosen({ id: era.id, tab: t }) }}>{t === 'prep' ? 'Prep' : 'Recap'}</button>
      ))}
    </div>
  )
  const editor = (
    <RichNote html={draft.text} v={draft.v} placeholder={HINT[tab]} onInput={typed} onBlur={save}
      label={`${era.name}: ${tab === 'prep' ? 'prep' : 'recap'}`} />
  )
  return (
    <section className="snotes" aria-label="Session notes">
      <div className="snhead">
        <div className="tsect">Session notes</div>
        <button type="button" className="snwide" title="Open the notes wide" aria-label="Open the notes wide" onClick={() => setWide(true)}>⤢</button>
      </div>
      <select className="snpick" value={era.id} aria-label="Which session's notes"
        onChange={(e) => { save(); setPick(Number(e.target.value)) }}>
        {list.map((e) => <option key={e.id} value={e.id}>{e.name}{e.id === atLens?.id ? ' · at the lens' : ''}</option>)}
      </select>
      {!atLens && <p className="muted esmall">The lens is outside every session: ＋ Next session in ⚙ starts the next one</p>}
      {tabs}
      {!wide && editor}
      {wide && (
        <Modal title={`${era.name}: ${tab === 'prep' ? 'prep' : 'recap'}`} className="snmodal" onClose={() => { save(); setWide(false) }}>
          {tabs}
          {editor}
        </Modal>
      )}
    </section>
  )
}
