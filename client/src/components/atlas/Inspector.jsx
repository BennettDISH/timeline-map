import React, { useState, useRef, useEffect } from 'react'
import AudioClip from '../AudioClip'
import { STYLE_KEYS, STYLE_LABELS } from '../Regions'
import { CATS, cat } from '../../utils/categories'
import { spanLabel } from '../../utils/moment'
import { wholeOr, REVERSED, coveringFact, periodBlur } from './helpers'

// The editor (the right-hand panel in Edit posture): one selected placement and its node.
// Every save goes through the callbacks the workspace passes in; this file holds no service calls.

export default function Inspector({ p, stray, partyExists, voicesErr, onVoicesRetry, onSave, onCat, onClaim, autoFocusTitle, onTitleFocused, onOpen, onCreate, onRemoveInterior, onImage, onRemoveImage, timeline, eras, onLifespan, facts, nowT, nowLabel, hiddenHere, onHideHere, onFootstep, onFactAdd, onFactPatch, onFactDelete, links, onLink, onUnlink, onLabel, onJump, onVis, onRemoveHere, onPlaceHere, onDelete, spotlit, onSpotlight, onStance, voiceOn, voices, voiceMeta, onVoice, onSay, onClearLine, onReveal, hasOutline, onOutline, onClearOutline, outlineKind, onOutlineKind, outlineStyle, onOutlineStyle }) {
  const seedOf = (pp) => ({ title: pp.node.title, body: pp.node.body || '', note: pp.node.dmNote || '', line: pp.node.voiceLine || '', vstyle: pp.node.voiceStyle || '', start: pp.start ?? '', end: pp.end ?? '' })
  const [title, setTitle] = useState(p.node.title)
  const [body, setBody] = useState(p.node.body || '')
  const [note, setNote] = useState(p.node.dmNote || '')
  const [line, setLine] = useState(p.node.voiceLine || '')
  const [vstyle, setVstyle] = useState(p.node.voiceStyle || '')
  const [vbusy, setVbusy] = useState(false)
  const [start, setStart] = useState(p.start ?? '')
  const titleRef = useRef(null)
  const fid = React.useId() // the fields' labels name them
  // a just-dropped node: its title is focused with 'New entry' selected, ready to be typed over
  useEffect(() => { if (autoFocusTitle && titleRef.current) { titleRef.current.focus(); titleRef.current.select(); onTitleFocused?.() } }, []) // eslint-disable-line
  const [factHint, setFactHint] = useState(null) // a period row whose bounds are reversed (held, not saved)
  const [factVer, setFactVer] = useState(0) // remounts the period rows to their stored bounds after a refused save
  const [end, setEnd] = useState(p.end ?? '')
  const [labelEdit, setLabelEdit] = useState(null) // link id whose label is being edited
  const [factsOpen, setFactsOpen] = useState(false) // every period shown, not just the one at the lens
  const labelCancel = useRef(false) // Esc must beat the blur the unmount fires
  const seeded = useRef(seedOf(p))
  // The server's copy changed under the inspector (a Forge turn, an Allow, another tab, a
  // background refresh): every box the DM is not typing in takes the new value; the one in
  // focus keeps their keystrokes. Whatever is typed next builds on current text, never on
  // what the box showed when it opened.
  useEffect(() => {
    const fresh = seedOf(p)
    const setters = { title: setTitle, body: setBody, note: setNote, line: setLine, vstyle: setVstyle, start: setStart, end: setEnd }
    const focused = document.activeElement?.dataset?.fld
    for (const k of Object.keys(fresh)) {
      if (fresh[k] === seeded.current[k]) continue
      seeded.current[k] = fresh[k]
      if (focused !== k) setters[k](fresh[k])
    }
  }, [p.node.title, p.node.body, p.node.dmNote, p.node.voiceLine, p.node.voiceStyle, p.start, p.end]) // eslint-disable-line
  const n = p.node
  const providerName = voiceMeta?.provider ? (({ gemini: 'Gemini', openai: 'OpenAI', elevenlabs: 'ElevenLabs' })[voiceMeta.provider] || voiceMeta.provider) : 'this provider'
  // a saved voice the current provider does not list (it was picked under another one)
  const foreignVoice = !!n.voiceId && (voices || []).length > 0 && !(voices || []).some((v) => v.id === n.voiceId)
  const timeBlock = timeline?.enabled && !stray ? (
    <>
      <div className="isect">{n.category === 'party' ? 'This footstep' : 'Time'}</div>
      <div className="fld"><label>{n.category === 'party' ? 'Footstep — when the party stands here' : "Lifespan — when it's present"}</label>
        <div className="span">
          <input data-fld="start" type="number" step={1} aria-label="Lifespan from" placeholder="from" value={start}
            onChange={(e) => { const v = e.target.value; setStart(v); const n = wholeOr(v); if (n !== undefined) onLifespan('start', n) }} />
          <span>→</span>
          <input data-fld="end" type="number" step={1} aria-label="Lifespan to" placeholder="to" value={end}
            onChange={(e) => { const v = e.target.value; setEnd(v); const n = wholeOr(v); if (n !== undefined) onLifespan('end', n) }} />
        </div>
        {wholeOr(start) != null && wholeOr(end) != null && wholeOr(start) > wholeOr(end)
          ? <div className="muted warn">{REVERSED}</div>
          : <div className="muted">{start === '' && end === ''
            ? 'Blank = always present. Scrub the timeline to see it appear / disappear.'
            : `= ${spanLabel(wholeOr(start) ?? null, wholeOr(end) ?? null, eras, timeline?.unit)}`}</div>}
      </div>
    </>
  ) : null
  return (
    <>
      {stray && <div className="muted esmall strayhint">○ Not on any map — edit it here, place it on this map, or delete it.</div>}
      <div className="fld"><label htmlFor={`${fid}-title`}>Title</label>
        <input id={`${fid}-title`} data-fld="title" ref={titleRef} maxLength={255} value={title} onChange={(e) => { setTitle(e.target.value); onSave(n.id, { title: e.target.value }) }} />
      </div>
      {n.visibility === 'player' && (
        <div className="markerbar">
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>✍ A player placed this{n.author ? `, signed “${n.author}”` : ''} — a self-typed name, not verified.</div>
          <div className="onmaprow">
            <button className="btn primary" title="Make it canon: players keep seeing it, and it becomes yours to edit" onClick={() => onClaim('shared')}>✓ Keep as canon</button>
            <button className="btn" title="Hide it from players — it stays for you" onClick={() => onClaim('dm')}>🔒 Hide</button>
            <button className="btn danger" title="Delete the marker" onClick={onDelete}>Delete</button>
          </div>
        </div>
      )}
      <div className="catrow">
        {Object.entries(CATS).filter(([k]) => k !== 'party' || n.category === 'party' || !partyExists).map(([k, v]) => (
          <button key={k} className={`cdot ${n.category === k ? 'on' : ''}`} title={k === 'party' ? 'The party — one per world' : v.label}
            aria-label={k === 'party' ? 'The party' : v.label} aria-pressed={n.category === k}
            style={{ background: v.c }} onClick={() => onCat(k)}>{v.i}</button>
        ))}
        <span className="catname">{cat(n.category).label}</span>
      </div>
      <div className="primrow">
        {n.hasInterior
          ? (
            <>
              <button className="btn primary grow" onClick={onOpen}>◎ Go inside ▸</button>
              <button className="btn xint" title="Remove the interior map — it is deleted; this entry stays"
                onClick={onRemoveInterior} aria-label="Remove the interior">✕</button>
            </>
          )
          : n.category === 'party' ? (
            onFootstep
              ? <button className="btn primary grow" title="The party takes its next footstep right here: the current one ends at the lens moment and a new one begins" onClick={onFootstep}>👣 Next footstep here</button>
              : <span className="muted esmall grow">The party moves by footsteps — right-click the map where they go.</span>
          ) : (
            <>
              <button className="btn grow" title="Give it a map inside — a place to zoom into" onClick={() => onCreate('map')}>＋ Interior map</button>
              <button className="btn grow" title="Give it a list inside — inventory, notes" onClick={() => onCreate('list')}>＋ List</button>
            </>
          )}
        <div className="visseg" title="Who can see this entry">
          <button className={n.visibility === 'shared' ? 'on' : ''} aria-pressed={n.visibility === 'shared'} title="Everyone can see it" onClick={() => onVis('shared')}>👁 Players</button>
          <button className={n.visibility === 'dm' ? 'on' : ''} aria-pressed={n.visibility === 'dm'} title="DM only — hidden from players" onClick={() => onVis('dm')}>🔒 DM</button>
        </div>
      </div>
      {onSpotlight && n.category !== 'party' && <button className={`btn block ${spotlit ? 'lit' : ''}`}
        title={spotlit ? 'Players see the lantern\'s path leading here — click to put it out'
          : 'Light the lantern here: players see the path to it, one map at a time'}
        onClick={onSpotlight}>
        {spotlit ? '🔦 Put the lantern out' : '🔦 Light the lantern here'}
      </button>}
      {n.category !== 'party' && (
      <div className="strow" title="How they stand toward the party — your eyes only, never shown to players">
        {[['friend', '🟢 Friend'], ['neutral', '⚪ Neutral'], ['foe', '🔴 Foe']].map(([v, l]) => (
          <button key={v} className={n.stance === v ? 'on' : ''} aria-pressed={n.stance === v}
            onClick={() => onStance(n.stance === v ? null : v)}>{l}</button>
        ))}
      </div>
      )}
      {n.category === 'party' && timeBlock}
      <div className="isect">Description</div>
      <div className="fld"><label htmlFor={`${fid}-body`}>Description{timeline?.enabled ? ' — the default, when no period below covers the moment' : ''}</label>
        <textarea id={`${fid}-body`} data-fld="body" rows="4" value={body} onChange={(e) => { setBody(e.target.value); onSave(n.id, { body: e.target.value }) }} />
      </div>
      <div className="fld dmnotes"><label htmlFor={`${fid}-note`}>🔒 DM notes — players never see this</label>
        <textarea id={`${fid}-note`} data-fld="note" rows="3" value={note} placeholder="Only you see this — not players, not the Forge's painter."
          onChange={(e) => { setNote(e.target.value); onSave(n.id, { dm_note: e.target.value }) }} />
        {note.trim() && (() => {
          // players read the period text covering CANON when there is one: the secret goes there
          const covering = timeline?.enabled ? coveringFact(facts, timeline.current) : null
          return (
            <button className="btn block" style={{ marginTop: 5 }}
              title={covering ? 'Moves the note into the period text players read at the canon moment — this is how a secret becomes known'
                : 'Moves the note into the description players read'}
              onClick={async () => {
                const r = await onReveal() // merged on the server against the current text
                if (r) { if (!r.factId && r.body != null) setBody(r.body); setNote('') }
              }}>
              👁 Reveal — {covering ? `into the text for ${spanLabel(covering.start, covering.end, eras, timeline?.unit)}` : 'move into the description'}
            </button>
          )
        })()}
      </div>
      {timeline?.enabled && (
        <div className="fld"><label>The story by period — what this reads as at different times</label>
          {(() => {
            // the period at the lens stays open; the rest fold behind a count (a Party carries one per footstep)
            const all = facts || []
            const live = all.filter((f) => (f.start == null || f.start <= nowT) && (f.end == null || f.end >= nowT))
            const shown = factsOpen || all.length <= 4 ? all : (live.length ? live : all.slice(-1))
            const hidden = all.length - shown.length
            return (
              <>
                {hidden > 0 && <button className="btn block" onClick={() => setFactsOpen(true)}>Show {hidden} other {hidden === 1 ? 'period' : 'periods'}</button>}
                {shown.map((f) => (
            <div key={f.id} className="factrow">
              <div className="factspan">
                <input key={`s${f.start ?? ''}:${factVer}`} type="number" step={1} defaultValue={f.start ?? ''} placeholder={String(timeline.min)} title="From"
                  onBlur={(e) => periodBlur(e, f, f.id, { hint: setFactHint, bump: () => setFactVer((v) => v + 1), send: (d) => onFactPatch(f.id, d) })} />
                <span>–</span>
                <input key={`e${f.end ?? ''}:${factVer}`} type="number" step={1} defaultValue={f.end ?? ''} placeholder="…" title="To"
                  onBlur={(e) => periodBlur(e, f, f.id, { hint: setFactHint, bump: () => setFactVer((v) => v + 1), send: (d) => onFactPatch(f.id, d) })} />
                <button className="lx" title="Remove this period's text" aria-label="Remove this period's text" onClick={() => onFactDelete(f.id)}>✕</button>
              </div>
              {factHint === f.id && <div className="muted warn">{REVERSED}</div>}
              <textarea key={`b${f.body}`} rows="2" defaultValue={f.body} placeholder="How it reads during this period…"
                onBlur={(e) => { if (e.target.value !== f.body) onFactPatch(f.id, { body: e.target.value }) }} />
            </div>
                ))}
              </>
            )
          })()}
          <button className="btn block" onClick={onFactAdd}>＋ Story for a period (from {nowLabel || nowT})</button>
          <div className="muted">The latest-starting period covering the moment wins; players get only their moment's text.</div>
        </div>
      )}
      <div className="isect">Image</div>
      <div className="fld"><label>Image</label>
        {n.imageUrl ? (
          <div className="nimg">
            <img src={n.imageUrl} alt="" />
            <div className="nimg-actions">
              <button className="btn" onClick={onImage}>Change</button>
              <button className="btn danger" onClick={onRemoveImage}>Remove</button>
            </div>
            <div className="chips" style={{ marginTop: 7 }} title="How it draws on the map">
              <button className={`chip ${n.pin !== 'image' ? 'on' : ''}`} aria-pressed={n.pin !== 'image'} onClick={() => onSave(n.id, { pin: 'chip' })}>Pin: icon + name</button>
              <button className={`chip ${n.pin === 'image' ? 'on' : ''}`} aria-pressed={n.pin === 'image'} onClick={() => onSave(n.id, { pin: 'image' })}>Pin: the image</button>
            </div>
            {n.pin === 'image' && (
              <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
                Size on the map
                {/* pinSize rides along so localPatchNode resizes the pin live; the PATCH whitelist drops it */}
                <input type="range" min="32" max="144" step="8" value={n.pinSize || 64} style={{ flex: 1 }}
                  onChange={(e) => { const v = Number(e.target.value); onSave(n.id, { pin_size: v }) }} />
              </label>
            )}
          </div>
        ) : (
          <button className="btn block" onClick={onImage}>＋ Add image</button>
        )}
      </div>
      {!voiceOn && voiceMeta?.enabled === false && voiceMeta?.storage === false && n.category !== 'party' && (
        <div className="muted esmall">Voice is off: the server has no object storage (R2) to keep audio in.</div>
      )}
      {voiceOn && n.category !== 'party' && (
        <>
          <div className="isect">Voice{voiceMeta?.provider ? <span className="vprov"> · {providerName}</span> : null}</div>
          <div className="fld"><label>Their voice</label>
            {voicesErr && <div className="muted esmall">Couldn't load the voice list. <button type="button" className="lnk" onClick={onVoicesRetry}>Retry</button></div>}
            <select className="vsel" value={n.voiceId || ''}
              onChange={(e) => { const v = voices.find((x) => x.id === e.target.value); onVoice(v ? v.id : null, v ? v.name : null) }}>
              <option value="">— pick a voice —</option>
              {foreignVoice && <option value={n.voiceId} disabled>{n.voiceName || n.voiceId} — not available with {providerName}</option>}
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}{[v.labels?.feel, v.labels?.gender, v.labels?.age, v.labels?.accent].filter(Boolean).map((x) => ` · ${x}`).join('')}
                </option>
              ))}
            </select>
            {foreignVoice && <div className="muted esmall">This voice belongs to another provider — pick one from the list to speak with {providerName}.</div>}
          </div>
          {voiceMeta?.steerable && (
            <div className="fld"><label>How they sound — shapes every line</label>
              <input data-fld="vstyle" className="vstyle" maxLength={400} value={vstyle}
                placeholder="hoarse and exhausted, pipe-smoke rasp, talks like he's already lost the argument"
                onChange={(e) => setVstyle(e.target.value)}
                onBlur={() => { if ((n.voiceStyle || '') !== vstyle.trim()) onVoice(n.voiceId || null, n.voiceName || null, vstyle.trim()) }} />
            </div>
          )}
          <div className="fld"><label>A line in their voice — players hear it on their sheet</label>
            <textarea data-fld="line" rows={2} maxLength={400} value={line} readOnly={!!n.voiceUrl}
              placeholder="“Thirty gold a head, and not a copper more. The light comes first.”"
              onChange={(e) => setLine(e.target.value)} />
            {n.voiceUrl && <div className="muted esmall">This line is recorded. Remove it (✕) to write and record a new one.</div>}
            <div className="vrow">
              <button className="btn" disabled={!n.voiceId || foreignVoice || !line.trim() || vbusy || !!n.voiceUrl}
                title={n.voiceUrl ? 'They already have a line — clear it (✕) to record another' : foreignVoice ? `“${n.voiceName || n.voiceId}” is not a ${providerName} voice — pick one from the list` : (n.voiceId ? 'Generate the line in their voice' : 'Pick a voice first')}
                onClick={() => { setVbusy(true); Promise.resolve(onSay(line.trim(), voiceMeta?.steerable ? vstyle.trim() : undefined)).finally(() => setVbusy(false)) }}>
                {vbusy ? 'Speaking…' : '🔊 Say it'}
              </button>
              {n.voiceUrl && <AudioClip src={n.voiceUrl} />}
              {n.voiceUrl && <button className="lx" title="Remove the line — its audio is deleted; recording again costs a new generation"
                onClick={() => { if (window.confirm('Remove this recorded line? Its audio is deleted, and recording again costs a new generation.')) onClearLine() }}>✕</button>}
            </div>
          </div>
        </>
      )}
      {n.category !== 'party' && timeBlock}
      <div className="isect">Threads</div>
      <div className="fld"><label>Threads — players see them, labels included, between things they can see</label>
        <div className="links">
          {[...(links?.out || []).map((l) => [l, 'out']), ...(links?.in || []).map((l) => [l, 'in'])].map(([l, dir]) => (
            <div key={`${dir}${l.id}`} className={`lrow ${dir}`}>
              {labelEdit === l.id ? (
                <input className="llabel-input" autoFocus defaultValue={l.label || ''}
                  maxLength={255} placeholder="shown to players, e.g. owes money to"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur()
                    else if (e.key === 'Escape') { labelCancel.current = true; setLabelEdit(null) }
                  }}
                  onBlur={(e) => {
                    if (labelCancel.current) { labelCancel.current = false; return }
                    const v = e.target.value.trim()
                    if (v !== (l.label || '')) onLabel(l.id, v || null)
                    setLabelEdit(null)
                  }} />
              ) : (
                <>
                  <button type="button" className="lgo" title={`Open “${l.otherTitle}”`} onClick={() => onJump(l.otherId)}>{dir === 'out' ? '→' : '←'} {l.otherTitle}{l.label ? <span className="llabel"> — {l.label}</span> : null}</button>
                  {dir === 'in' && <span className="lref">Refers here</span>}
                  <button className="lx" title="Label this thread — players read the label" aria-label="Label this thread" onClick={() => setLabelEdit(l.id)}>✎</button>
                  <button className="lx" title="Remove this thread" aria-label="Remove this thread" onClick={() => onUnlink(l.id)}>✕</button>
                </>
              )}
            </div>
          ))}
          {(!links?.out?.length && !links?.in?.length) && <div className="muted">No threads yet.</div>}
        </div>
        <button className="btn block" onClick={onLink}>＋ Thread to another entry</button>
      </div>
      <div className="isect">{stray ? 'Not on any map' : 'On this map'}</div>
      {onOutline && (
        <div className="onmaprow">
          <button className="btn" title="Trace this place on the art — the outline becomes its button on the map" onClick={onOutline}>
            {hasOutline ? '◌ Redraw the outline' : '◌ Outline on the map'}
          </button>
          {hasOutline && <button className="btn" title="Back to a plain pin" onClick={onClearOutline}>✕ Remove outline</button>}
        </div>
      )}
      {onOutline && hasOutline && (
        <div className="fld"><label>Outline style</label>
          <div className="stylerow">
            <span className="kindsel" title="Presets — they reset the toggles">
              <button type="button" className={outlineKind === 'button' ? 'on' : ''} title="A house or landmark: outline, grow, glow, and the art pops" onClick={() => onOutlineKind('button')}>Button</button>
              <button type="button" className={outlineKind === 'area' ? 'on' : ''} title="A district: a faint tint that fades with size" onClick={() => onOutlineKind('area')}>Area</button>
            </span>
            <span className="stoggles">
              {STYLE_KEYS.map((k) => [k, ...STYLE_LABELS[k]]).map(([k, label, tip]) => (
                <button key={k} type="button" className={outlineStyle?.[k] ? 'on' : ''} aria-pressed={!!outlineStyle?.[k]} title={tip} onClick={() => onOutlineStyle(k, !outlineStyle?.[k])}>{label}</button>
              ))}
            </span>
          </div>
        </div>
      )}
      {!stray && onHideHere && n.visibility !== 'dm' && (
        <button className={`btn block ${hiddenHere ? 'lit' : ''}`}
          title={hiddenHere ? 'Players cannot see it on THIS map — click to show it here' : 'Hide it on this map only — the entry stays visible wherever else it is placed'}
          onClick={() => onHideHere(!hiddenHere)}>{hiddenHere ? '🔒 Hidden on this map — show it here' : '👁 Shown on this map — hide it here'}</button>
      )}
      <div className="onmaprow">
        {stray
          ? <button className="btn" title="Give it a spot on the map you are looking at" onClick={onPlaceHere}>⤓ Place on this map</button>
          : <button className="btn" title="Take it off this map only — the entry itself survives" onClick={onRemoveHere}>⤒ Remove from map</button>}
        <button className="btn danger" onClick={onDelete}>🗑 Delete…</button>
      </div>
    </>
  )
}
