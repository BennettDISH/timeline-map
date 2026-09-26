import React, { useState, useRef, useEffect, useCallback } from 'react'
import forgeService from '../../services/forgeService'
import { errText } from '../../services/http'
import { ImagePicker } from './Pickers'
import { trunc } from './helpers'

// ---- The Forge: the world's mind, as a conversation ------------------------------
// One box, no modes: the mind reads what the DM wants — a question, a session recap, a
// build, a painting — from the words and the standing context (current map + selected
// node, shown as a chip). Whatever it makes lands as a card threaded under the reply that
// made it, keep/unmake-able; privileged acts wait behind Allow.
// plain words for what a creation made, singular and plural
const COUNT_WORDS = {
  images: ['painting', 'paintings'], nodes: ['new entry', 'new entries'], maps: ['new map', 'new maps'],
  placements: ['spot on a map', 'spots on maps'], links: ['thread', 'threads'], eras: ['era', 'eras'],
  backdrops: ['timed backdrop', 'timed backdrops'], facts: ['period text', 'period texts'],
  enrichedBodies: ['description filled', 'descriptions filled'], enrichedNotes: ['note filled', 'notes filled'],
  enrichedImages: ['piece of art attached', 'pieces of art attached'], noteAppends: ['note extended', 'notes extended'],
  stanceChanges: ['stance set', 'stances set'], mapNoteAppends: ['map note extended', 'map notes extended'], mapBases: ['backdrop set', 'backdrops set'],
}
const countLabel = (k, v) => `${v} ${(COUNT_WORDS[k] || [k, k])[v === 1 ? 0 : 1]}`

export default function ForgePanel({ worldId, map, sel, onFlash, onRefresh, onClose }) {
  const [msgs, setMsgs] = useState(null) // null while the history loads
  const [batches, setBatches] = useState([]) // pending cards
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(null) // null | 'chat' | { id, act } for a batch card action
  const [savingMind, setSavingMind] = useState(false)
  const [loadErr, setLoadErr] = useState(false)
  const [view, setView] = useState('chat') // 'chat' | 'mind' (the mind's settings partition)
  const [mind, setMind] = useState({ artStyle: '', lore: '', bible: '', genSize: 'medium', styleImage: null })
  const base = useRef(null) // the mind as last loaded or saved: only fields that differ are ever saved
  const MIND_FIELDS = ['artStyle', 'lore', 'bible', 'genSize']
  const dirty = base.current ? MIND_FIELDS.filter((k) => mind[k] !== base.current[k]) : []
  const [anchorPick, setAnchorPick] = useState(false)
  const [omitSel, setOmitSel] = useState(false) // the DM cleared the selection chip for this message
  const bibleRef = useRef(null)
  const logRef = useRef(null)
  useEffect(() => { setOmitSel(false) }, [sel?.node?.id])

  const fromServer = (d) => ({ artStyle: d.artStyle || '', lore: d.lore || '', bible: d.bible || '', genSize: d.genSize || 'medium', styleImage: d.styleImage || null })
  // the mind's state is refreshed after every reply (a recap appends memory): fields the DM
  // has not touched take the server's value, fields mid-edit keep the DM's text
  const refreshMind = useCallback((withHistory) => forgeService.getWorld(worldId).then((d) => {
    const fresh = fromServer(d)
    const prevBase = base.current || fresh
    setMind((m) => { const next = { ...m }; for (const k of Object.keys(fresh)) if (m[k] === prevBase[k]) next[k] = fresh[k]; return next })
    base.current = fresh
    setBatches(d.batches)
    if (withHistory) setMsgs(d.messages)
    setLoadErr(false)
  }), [worldId])
  useEffect(() => {
    let live = true
    setLoadErr(false)
    forgeService.getWorld(worldId)
      .then((d) => {
        if (!live) return
        setMsgs(d.messages); setBatches(d.batches)
        const m = fromServer(d); base.current = m; setMind(m)
      })
      .catch(() => { if (live) { setLoadErr(true); setMsgs((m) => m || []) } }) // a load error says so — and nothing saves until it loads
    return () => { live = false }
  }, [worldId])

  const saveMind = () => {
    if (!base.current || !dirty.length) return
    const body = {}
    if (dirty.includes('artStyle')) body.art_style = mind.artStyle
    if (dirty.includes('lore')) body.lore = mind.lore
    if (dirty.includes('bible')) body.bible = mind.bible
    if (dirty.includes('genSize')) body.gen_size = mind.genSize
    setSavingMind(true)
    forgeService.patchMind(worldId, body) // only what changed: memory the mind wrote meanwhile is never overwritten
      .then(() => { base.current = { ...base.current, ...Object.fromEntries(dirty.map((k) => [k, mind[k]])) }; onFlash({ kind: 'ok', text: 'Settings saved' }) })
      .catch((e) => onFlash({ kind: 'err', text: errText(e, "Couldn't save") }))
      .finally(() => setSavingMind(false))
  }
  const setAnchor = (imageId, url) => {
    setAnchorPick(false)
    forgeService.patchMind(worldId, { style_image_id: imageId })
      .then(() => setMind((m) => ({ ...m, styleImage: imageId == null ? null : { id: imageId, url } })))
      .catch((e) => onFlash({ kind: 'err', text: errText(e, "Couldn't change the anchor") }))
  }
  const loadBibleFile = (e) => {
    const f = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!f) return
    const r = new FileReader()
    r.onload = () => {
      const full = String(r.result || '')
      setMind((m) => ({ ...m, bible: full.slice(0, 100000) }))
      onFlash({ kind: 'info', text: full.length > 100000 ? 'Loaded and trimmed to 100,000 characters — Save settings to keep it' : 'Loaded — Save settings to keep it' })
    }
    r.readAsText(f)
  }

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [msgs, batches, busy])

  const send = () => {
    const message = text.trim()
    if (!message || busy) return
    setText('')
    setView('chat')
    setMsgs((m) => [...(m || []), { role: 'user', content: message }])
    setBusy('chat')
    const nodeId = sel && !omitSel ? sel.node.id : undefined
    forgeService.chat(worldId, message, { mapId: map?.id, nodeId })
      .then((r) => {
        const content = r.batch ? `${r.say}\n⚒ ${r.batch.summary}` : r.applyError ? `${r.say}\n⚠ Nothing was changed: ${r.applyError}` : r.say
        setMsgs((m) => [...m, { role: 'mind', content, batchId: r.batch?.batchId || null }])
        if (r.batch) {
          if (!r.batch.askCount) setBatches((b) => [{ id: r.batch.batchId, summary: r.batch.summary, counts: r.batch.counts, asksState: 'none', asksText: [] }, ...b])
          onRefresh()
        }
        refreshMind(false).catch(() => {}) // memory and cards as the server now holds them
        if (r.applyError) onFlash({ kind: 'err', text: `The mind spoke, but the creation failed: ${r.applyError}` })
        else if (r.digestNote) onFlash({ kind: 'info', text: `The world outgrew the mind's view: ${r.digestNote}` })
      })
      .catch((e) => {
        // the words come back to the box and the bubble says they never arrived
        setText((t) => t || message)
        setMsgs((m) => m.map((x, i) => (i === m.length - 1 && x.role === 'user' && x.content === message ? { ...x, failed: true } : x)))
        onFlash({ kind: 'err', text: e?.response ? errText(e, 'The Forge did not answer') : 'No connection — your message is back in the box' })
      })
      .finally(() => setBusy(null))
  }

  const isBusy = (b, act) => !!busy && typeof busy === 'object' && busy.id === b.id && busy.act === act
  const askAct = (b, allow) => {
    if (busy) return
    setBusy({ id: b.id, act: allow ? 'allow' : 'refuse' })
    ;(allow ? forgeService.allowAsks(worldId, b.id) : forgeService.refuseAsks(worldId, b.id))
      .then((r) => {
        setBatches((list) => list.map((x) => x.id === b.id ? { ...x, asksState: allow ? 'allowed' : 'refused' } : x))
        if (allow) {
          const n = r.granted ?? 0, m = r.requested ?? n
          const text = n === m ? `Granted — ${n} act${n === 1 ? '' : 's'} done`
            : `Granted — ${n} of ${m} done; ${m - n} no longer possible (the target is gone)`
          onFlash({ kind: n ? 'ok' : 'info', text }); onRefresh()
        }
      })
      .catch((e) => onFlash({ kind: 'err', text: errText(e, "Couldn't do that") }))
      .finally(() => setBusy(null))
  }
  const batchAct = (b, keep) => {
    if (busy) return
    if (!keep) {
      const what = Object.entries(b.counts || {}).map(([k, v]) => countLabel(k, v)).join(', ')
      if (!window.confirm(`Unmake this creation? It removes ${what || 'what it made'}. Anything you edited since stays as you left it.`)) return
    }
    setBusy({ id: b.id, act: keep ? 'keep' : 'unmake' })
    ;(keep ? forgeService.keepBatch(worldId, b.id) : forgeService.discardBatch(worldId, b.id))
      .then((r) => {
        setBatches((list) => list.filter((x) => x.id !== b.id))
        if (keep && b.asksState === 'pending') onFlash({ kind: 'info', text: 'Kept — its request for permission was declined' })
        if (!keep) {
          const extra = [
            r?.keptImages ? `${countLabel('images', r.keptImages)} you use elsewhere ${r.keptImages === 1 ? 'was' : 'were'} kept` : '',
            ...(r?.skipped || []),
          ].filter(Boolean)
          onFlash({ kind: 'info', text: `Unmade — what that creation added is gone; your later edits stay${extra.length ? '. ' + extra.join('; ') : ''}` })
          refreshMind(true).catch(() => {}); onRefresh()
        }
      })
      .catch((e) => {
        const bl = e?.response?.status === 409 && e.response.data?.blocked
        if (bl) {
          // the DM built on this creation: nothing was touched — name what stands in the way
          const names = [...(bl.placements || []).map((p) => `${p.title} (in ${p.map})`), ...(bl.maps || []).map((t) => `the map “${t}”`)]
          onFlash({ kind: 'err', text: `Unmake stopped — you built on this creation. Move these out or remove them first: ${names.slice(0, 6).join(', ')}${names.length > 6 ? ` and ${names.length - 6} more` : ''}` })
        } else if (e?.response?.status === 404) {
          setBatches((list) => list.filter((x) => x.id !== b.id))
          onFlash({ kind: 'info', text: 'That card was already settled (in another tab, perhaps)' })
        } else onFlash({ kind: 'err', text: errText(e, "Couldn't do that") })
      })
      .finally(() => setBusy(null))
  }

  const card = (b) => {
    const counts = Object.entries(b.counts || {})
    const meta = counts.map(([k, v]) => countLabel(k, v)).join(' · ') || 'nothing new'
    const madeThings = (b.counts?.nodes || 0) + (b.counts?.maps || 0) > 0
    return (
    <div key={`b${b.id}`} className="fbatch">
      <div className="fbsum">{b.summary && b.summary !== 'A generation' ? b.summary : (meta[0].toUpperCase() + meta.slice(1))}</div>
      <div className="fbmeta">{meta} — players see none of this until you keep it{madeThings ? '; new things then stay DM-only until you reveal them' : ''}</div>
      {b.asksState === 'pending' && (b.asksText || []).length > 0 && (
        <div className="fasks">
          <div className="faskhead">It asks permission to:</div>
          {b.asksText.map((t, i) => <div key={i} className={`fask${/^✕ /.test(t) ? ' gone' : ''}`}>• {t}</div>)}
          <div className="fbrow">
            {b.asksLive !== 0 && <button className="tool on" disabled={!!busy} onClick={() => askAct(b, true)}>{isBusy(b, 'allow') ? '…' : (b.asksLive != null && b.asksLive < b.asksText.length ? `Allow what remains (${b.asksLive})` : 'Allow')}</button>}
            <button className="tool" disabled={!!busy} onClick={() => askAct(b, false)}>{isBusy(b, 'refuse') ? '…' : (b.asksLive === 0 ? 'Dismiss' : 'Refuse')}</button>
          </div>
        </div>
      )}
      {b.asksState === 'allowed' && <div className="fbmeta">✓ permission granted — Unmake reverts it all</div>}
      <div className="fbrow">
        <button className="tool on" disabled={!!busy} title={b.asksState === 'pending' ? 'Keep the creation — its request for permission is declined' : 'Keep the creation'}
          onClick={() => batchAct(b, true)}>{isBusy(b, 'keep') ? '…' : (b.asksState === 'pending' ? 'Keep (decline the request)' : 'Keep')}</button>
        <button className="tool danger" disabled={!!busy} onClick={() => batchAct(b, false)}>{isBusy(b, 'unmake') ? '…' : 'Unmake'}</button>
      </div>
    </div>
    )
  }
  const pendingById = new Map(batches.map((b) => [b.id, b]))
  const threaded = new Set()

  return (
    <div className="forge">
      <div className="fhead">
        <h4>✦ The Forge</h4>
        <div className="fhbtns">
          <button className={`gear ${view === 'mind' ? 'on' : ''}${dirty.length ? ' dirty' : ''}`} onClick={() => setView(view === 'mind' ? 'chat' : 'mind')}
            title={dirty.length ? 'The mind has unsaved settings' : 'The mind itself — bible, art style, anchor, memory, creation size'}>⚙{dirty.length ? '•' : ''}</button>
          <button className="x" title="Close the Forge"
            onClick={() => { if (dirty.length && !window.confirm('The mind has unsaved settings. Close and discard them?')) return; onClose() }}>✕</button>
        </div>
      </div>
      {view === 'mind' && (
        <div className="fmind">
          <div className="fsect">Campaign bible</div>
          <div className="fhint">Your own document — the mind reads all of it (up to 100,000 characters) as canon on every turn. Paste it, or load a .md file.</div>
          <textarea rows={7} value={mind.bible} placeholder="Nothing here yet — paste your campaign bible, or load the file."
            onChange={(e) => setMind((m) => ({ ...m, bible: e.target.value }))} />
          <div className="fbrow">
            <button type="button" className="tool" onClick={() => bibleRef.current?.click()}>Load a .md file…</button>
            <input ref={bibleRef} type="file" accept=".md,.markdown,.txt" hidden onChange={(e) => { loadBibleFile(e); e.target.value = '' }} />
            {mind.bible ? <span className="fhint">{mind.bible.length.toLocaleString()} characters</span> : null}
          </div>
          <div className="fsect">Art style</div>
          <div className="fhint">Every painting obeys this. The mind writes one with its first painting if you leave it empty — tweak it anytime.</div>
          <textarea rows={4} value={mind.artStyle} placeholder="e.g. Aged ink and gold-leaf cartography, muted parchment tones, soft candlelit shading."
            onChange={(e) => setMind((m) => ({ ...m, artStyle: e.target.value }))} />
          <div className="fsect">Style anchor</div>
          <div className="fhint">A reference image every painting must match. The first painting becomes it automatically; swap or clear it here.</div>
          {mind.styleImage ? (
            <div className="fanchor">
              <img src={mind.styleImage.url} alt="Style anchor" />
              <div className="fbrow">
                <button className="tool" onClick={() => setAnchorPick(true)}>Change…</button>
                <button className="tool" onClick={() => setAnchor(null)} title="The next painting becomes the new anchor">Clear</button>
              </div>
            </div>
          ) : (
            <div className="fbrow">
              <button className="tool" onClick={() => setAnchorPick(true)}>Choose an image…</button>
            </div>
          )}
          <div className="fsect">Creation size</div>
          <div className="fhint">How many new things a build request (“fill out this map”) aims for at once.</div>
          <select value={mind.genSize} onChange={(e) => setMind((m) => ({ ...m, genSize: e.target.value }))}>
            <option value="small">Small (3–6 entries)</option>
            <option value="medium">Medium (8–14 entries)</option>
            <option value="large">Large (18–35 entries)</option>
          </select>
          <div className="fsect">The mind's memory</div>
          <div className="fhint">Threads, secrets, and session summaries it keeps between sessions. It reads the latest 20,000 characters every turn — edit freely.</div>
          <textarea rows={8} value={mind.lore} placeholder="Nothing remembered yet."
            onChange={(e) => setMind((m) => ({ ...m, lore: e.target.value }))} />
          <button className="tool on" disabled={savingMind || !base.current || !dirty.length} onClick={saveMind}
            title={!base.current ? 'The mind has not loaded yet' : dirty.length ? `Saves ${dirty.length} changed ${dirty.length === 1 ? 'field' : 'fields'}` : 'Nothing changed'}>
            {savingMind ? 'Saving…' : dirty.length ? 'Save settings' : 'Saved'}</button>
        </div>
      )}
      {view === 'chat' && (<>
      <div className="flog" ref={logRef}>
        {msgs === null && <div className="fintro">Loading…</div>}
        {loadErr && (
          <div className="fintro">Couldn't load the Forge's conversation and settings.
            <div className="fbrow"><button className="tool" onClick={() => refreshMind(true).catch(() => setLoadErr(true))}>Retry</button></div></div>
        )}
        {msgs !== null && msgs.length === 0 && !loadErr && (
          <div className="fintro">
            Ask what anyone knows, tell it what happened last session, or say what to build
            or paint. It knows what you have selected and which map you are on.
          </div>
        )}
        {(msgs || []).map((m, i) => {
          const b = m.role === 'mind' && m.batchId ? pendingById.get(m.batchId) : null
          if (b) threaded.add(b.id)
          return (
            <React.Fragment key={i}>
              <div className={`fmsg ${m.role === 'user' ? 'me' : 'mind'}${m.failed ? ' failed' : ''}`}>{m.content}{m.failed && <div className="ffail">⚠ Not sent — your words are back in the box</div>}</div>
              {b && card(b)}
            </React.Fragment>
          )
        })}
        {batches.filter((b) => !threaded.has(b.id)).map(card)}
        {busy === 'chat' && <div className="fmsg mind fwait">Working… paintings take a minute.</div>}
      </div>
      <div className="fcompose">
        <div className="fctx">
          {sel && !omitSel && (
            <span className="fchip" title="The mind sees this entry in full — its description, notes, threads">
              ↳ {trunc(sel.node.title)}
              <button onClick={() => setOmitSel(true)} title="Leave this entry out of the message" aria-label="Leave this entry out of the message">✕</button>
            </span>
          )}
          {map && <span className="fchip dim">in {trunc(map.title)}</span>}
        </div>
        <div className="fsend">
          <textarea rows={2} value={text} maxLength={12000}
            placeholder="Ask, recap, or ask for something — “paint him”, “what does Ren know?”, “last night the party…”"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
          <button className="tool on" disabled={!!busy || !text.trim()} onClick={send}>Send</button>
          {text.length > 9000 && <span className="fcount">{text.length.toLocaleString()} / 12,000</span>}
        </div>
      </div>
      </>)}
      {anchorPick && (
        <ImagePicker worldId={worldId} hasCurrent={!!mind.styleImage}
          onPick={(id, url) => setAnchor(id, url)} onClose={() => setAnchorPick(false)} />
      )}
    </div>
  )
}
