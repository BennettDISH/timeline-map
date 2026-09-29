import React, { useEffect, useRef, useState } from 'react'
import { momentLabel, sessionNum } from '../../utils/moment'
import { periodBlur, wholeOr, REVERSED } from './helpers'

// The ⚙ timeline settings: the clock's bounds and unit, the eras, ＋ Next session. Everything
// here saves as it goes, the way the eras always did — a box when it is left (Enter leaves it,
// Esc puts it back), a button at once — so closing the panel never loses an edit. The one thing
// held for a second click is a range that leaves canon outside it: the server would move canon
// into it, and what players see moves only when the DM says so.

export default function TimelineConfig({ tl, eras, onClock, onDisable, onClose, onEraAdd, onEraPatch, onEraDelete, onNextSession }) {
  const [confirmOff, setConfirmOff] = useState(false)
  const [eraHint, setEraHint] = useState(null) // an era row whose bounds are reversed (held, not saved)
  const [ver, setVer] = useState(0) // remounts the era rows to their stored values after a refused save
  const [clockVer, setClockVer] = useState(0) // the same for the clock's own boxes
  const [held, setHeld] = useState(null) // a range not saved: { reversed: true }, or { min, max } that would move canon
  useEffect(() => setHeld(null), [tl.min, tl.max]) // the clock changed under the panel (＋ Next session, a grow)
  const fromRef = useRef(null), toRef = useRef(null)
  const eraOpts = (e) => ({ hint: setEraHint, bump: () => setVer((v) => v + 1), send: (d) => onEraPatch(e.id, d), required: true })
  const sessions = tl.unit === 'footsteps' || (eras || []).some((e) => sessionNum(e) != null)
  const label = (t) => momentLabel(t, eras, tl.unit)

  const saveRange = (min, max) => {
    setHeld(null)
    onClock({ ...(min !== tl.min && { timeline_min_time: min }), ...(max !== tl.max && { timeline_max_time: max }) })
      .then((ok) => { if (ok === false) setClockVer((v) => v + 1) })
  }
  // From and To are read together when either is left; only a bound that changed travels
  const rangeBlur = () => {
    const st = wholeOr(fromRef.current?.value), en = wholeOr(toRef.current?.value)
    if (st == null && fromRef.current) fromRef.current.value = tl.min // a blank box means no change
    if (en == null && toRef.current) toRef.current.value = tl.max
    const min = st ?? tl.min, max = en ?? tl.max
    if (!(min < max)) { setHeld({ reversed: true }); return }
    if (min === tl.min && max === tl.max) { setHeld(null); return }
    if (tl.current != null && (tl.current < min || tl.current > max)) { setHeld({ min, max }); return }
    saveRange(min, max)
  }
  const unitBlur = (ev) => {
    const v = ev.target.value.trim().slice(0, 50)
    if (!v) { ev.target.value = tl.unit || ''; return }
    if (v !== tl.unit) onClock({ timeline_time_unit: v }).then((ok) => { if (ok === false) setClockVer((x) => x + 1) })
  }
  // Enter leaves a box, so it saves; Esc puts the box back to what is stored before the panel closes
  const keys = (ev) => {
    if (ev.target.tagName !== 'INPUT') return
    if (ev.key === 'Enter') ev.target.blur()
    else if (ev.key === 'Escape') ev.target.value = ev.target.defaultValue
  }
  // growing the clock to hold an era never moves canon: it was inside the old range
  const grow = (lo, hi) => onClock({ ...(lo !== tl.min && { timeline_min_time: lo }), ...(hi !== tl.max && { timeline_max_time: hi }) })

  return (
    <div className="tlcfg" onKeyDown={keys}>
      <div className="tlhead">
        <h4>🕓 Timeline</h4>
        <button className="tool" onClick={onClose}>Close</button>
      </div>
      <div className="muted esmall">Everything here saves as you go. Esc puts a box back.</div>
      <label>From <input ref={fromRef} key={`min${tl.min}:${clockVer}`} type="number" step={1} defaultValue={tl.min} onBlur={rangeBlur} /></label>
      <label>To <input ref={toRef} key={`max${tl.max}:${clockVer}`} type="number" step={1} defaultValue={tl.max} onBlur={rangeBlur} /></label>
      <label>Unit <input key={`u${tl.unit}:${clockVer}`} type="text" maxLength={50} defaultValue={tl.unit || ''} placeholder="footsteps (ten a session), days, years…" onBlur={unitBlur} /></label>
      {held?.reversed && <div className="muted warn esmall">⚠ From must be before To — not saved until it is.</div>}
      {held?.min != null && (
        <div className="tlrow tlnote">
          <span className="muted warn esmall">⚠ Canon ({label(tl.current)}) is outside {held.min}–{held.max}, so saving moves what players see to {label(Math.min(Math.max(tl.current, held.min), held.max))}.</span>
          <button className="tool danger" onClick={() => saveRange(held.min, held.max)}>Save and move canon</button>
        </div>
      )}
      <div className="isect">Eras</div>
      <div className="muted esmall">Eras are named stretches of the clock. 🎭 lets players scrub that stretch of the past, never beyond canon.</div>
      <div className="tlrow">
        {sessions && (
          <button className="tool" onClick={onNextSession} title={`Adds the next session as an era of ten ${tl.unit} after the last session, and grows the timeline to hold it`}>＋ Next session</button>
        )}
        <button className="tool" onClick={onEraAdd}>＋ Add an era</button>
      </div>
      {(eras || []).map((e) => {
        // an era the clock doesn't cover: the timebar can't draw it and the lens can't reach it,
        // while players can still scrub a revealed stretch before the clock's start
        const before = e.start < tl.min, after = e.end > tl.max
        const whole = e.end < tl.min || e.start > tl.max
        const lo = Math.min(tl.min, e.start), hi = Math.max(tl.max, e.end)
        return (
        <React.Fragment key={e.id}>
        <div className="erarow">
          <input key={`n${e.name}:${ver}`} className="ename" maxLength={120} defaultValue={e.name} title="Era name"
            onBlur={(ev) => { const v = ev.target.value.trim().slice(0, 120); if (v && v !== e.name) onEraPatch(e.id, { name: v }).then((ok) => { if (ok === false) setVer((x) => x + 1) }) }} />
          <input key={`s${e.start}:${ver}`} className="enum" type="number" step={1} defaultValue={e.start} title="From"
            onBlur={(ev) => periodBlur(ev, e, e.id, eraOpts(e))} />
          <span className="edash">–</span>
          <input key={`e${e.end}:${ver}`} className="enum" type="number" step={1} defaultValue={e.end} title="To"
            onBlur={(ev) => periodBlur(ev, e, e.id, eraOpts(e))} />
          <button className={`etoggle ${e.playerVisible ? 'on' : ''}`}
            title={e.playerVisible ? 'Players can scrub this era — click to hide' : 'Hidden from players — click to reveal'}
            aria-label={e.playerVisible ? 'Players can scrub this era' : 'Hidden from players'} aria-pressed={!!e.playerVisible}
            onClick={() => onEraPatch(e.id, { player_visible: !e.playerVisible })}>🎭</button>
          <button className="ex" title="Delete this era" aria-label="Delete this era" onClick={() => onEraDelete(e.id)}>✕</button>
        </div>
        {eraHint === e.id && <div className="muted warn">{REVERSED}</div>}
        {(before || after) && (
          <div className="tlrow tlnote">
            <span className="muted warn esmall">⚠ {whole ? 'Outside' : 'Partly outside'} the clock ({tl.min}–{tl.max}): the timebar can't show {whole ? 'it' : 'all of it'}{e.playerVisible && before ? ', though players can scrub there' : ''}</span>
            <button className="tool" onClick={() => grow(lo, hi)}>Grow the clock to {lo}–{hi}</button>
          </div>
        )}
        </React.Fragment>
        )
      })}
      {confirmOff ? (
        <div className="tlrow tloff">
          <span className="muted esmall">Players will see every moment at once — including the future and everything that has ended.</span>
          <button className="tool danger" onClick={() => { setConfirmOff(false); onDisable() }}>Yes, disable</button>
          <button className="tool" onClick={() => setConfirmOff(false)}>Keep it</button>
        </div>
      ) : (
        <button className="tool danger" onClick={() => setConfirmOff(true)}>Disable timeline…</button>
      )}
    </div>
  )
}
