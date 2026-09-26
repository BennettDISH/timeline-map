import React, { useState } from 'react'
import { sessionNum } from '../../utils/moment'
import { periodBlur, REVERSED } from './helpers'

// The ⚙ timeline settings: the clock's bounds and unit, the eras, ＋ Next session.

export default function TimelineConfig({ tl, eras, onSave, onDisable, onClose, onEraAdd, onEraPatch, onEraDelete, onNextSession }) {
  const [min, setMin] = useState(tl.min)
  const [max, setMax] = useState(tl.max)
  const [unit, setUnit] = useState(tl.unit || 'days')
  const [confirmOff, setConfirmOff] = useState(false)
  const [eraHint, setEraHint] = useState(null) // an era row whose bounds are reversed (held, not saved)
  const [ver, setVer] = useState(0) // remounts the era rows to their stored values after a refused save
  const bad = min === '' || max === '' || !Number.isFinite(Number(min)) || !Number.isFinite(Number(max)) || !(Math.round(Number(min)) < Math.round(Number(max)))
  const eraOpts = (e) => ({ hint: setEraHint, bump: () => setVer((v) => v + 1), send: (d) => onEraPatch(e.id, d), required: true })
  return (
    <div className="tlcfg">
      <label>From <input type="number" step={1} value={min} onChange={(e) => setMin(e.target.value === '' ? '' : Number(e.target.value))} /></label>
      <label>To <input type="number" step={1} value={max} onChange={(e) => setMax(e.target.value === '' ? '' : Number(e.target.value))} /></label>
      <label>Unit <input type="text" maxLength={50} value={unit} placeholder="footsteps (ten a session), days, years…" onChange={(e) => setUnit(e.target.value)} /></label>
      <div className="tlrow">
        <button className="tool on" disabled={bad} title={bad ? 'Start must be before end' : ''}
          onClick={() => onSave(Math.round(Number(min)), Math.round(Number(max)), unit.trim().slice(0, 50) || 'days')}>Save</button>
        <button className="tool" onClick={onClose}>Close</button>
      </div>
      <div className="isect">Eras</div>
      <div className="muted esmall">Eras are named stretches of the clock. 🎭 lets players scrub that stretch of the past, never beyond canon.</div>
      {(tl.unit === 'footsteps' || (eras || []).some((e) => sessionNum(e) != null)) && (eras || []).length > 3 && (
        <div className="tlrow">
          <button className="tool" onClick={onNextSession} title={`Adds the next session as an era of ten ${tl.unit} after the last session, and grows the timeline to hold it`}>＋ Next session</button>
        </div>
      )}
      {(eras || []).map((e) => (
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
        </React.Fragment>
      ))}
      <div className="tlrow">
        {(tl.unit === 'footsteps' || (eras || []).some((e) => sessionNum(e) != null)) && (
          <button className="tool" onClick={onNextSession} title={`Adds the next session as an era of ten ${tl.unit} after the last session, and grows the timeline to hold it`}>＋ Next session</button>
        )}
        <button className="tool" onClick={onEraAdd}>＋ Add an era</button>
      </div>
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
