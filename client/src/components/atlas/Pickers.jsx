import React, { useState, useRef, useEffect } from 'react'
import Modal from '../Modal'
import atlasService from '../../services/atlasService'
import imageServiceBase64 from '../../services/imageServiceBase64'
import { errText } from '../../services/http'
import { cat } from '../../utils/categories'
import { usesOf, describeUse, ACCEPT } from '../../utils/images'

// Upload a new image (to R2 via the existing pipeline), pick an existing one from this
// world, or — when the Forge is on — paint one for exactly the thing being decorated.
const PICK_PAGE = 60
export function ImagePicker({ worldId, hasCurrent, onPick, onClose, generate, onGenerated, title = 'Choose image', currentId = null, removeLabel = 'Remove current image' }) {
  const [images, setImages] = useState(null) // null = loading
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState('')
  const [needle, setNeedle] = useState('') // debounced search
  const [more, setMore] = useState(false)
  const fileRef = useRef(null)
  const seq = useRef(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [genBusy, setGenBusy] = useState(false)
  const [gGuide, setGGuide] = useState('')
  useEffect(() => { const t = setTimeout(() => setNeedle(q.trim()), 300); return () => clearTimeout(t) }, [q])
  const runGen = () => {
    if (genBusy || busy) return
    setGenBusy(true); setErr('')
    generate.run(gGuide.trim() || undefined)
      .then(() => onGenerated?.())
      .catch((e) => setErr(errText(e, 'Painting failed')))
      .finally(() => setGenBusy(false))
  }
  // every image in the world is reachable: pages of PICK_PAGE, and the same search the Archive has
  const load = (reset) => {
    const my = ++seq.current
    if (reset) setImages(null)
    else setMore(true)
    setErr('')
    imageServiceBase64.getImages({ worldId, limit: PICK_PAGE, offset: reset ? 0 : (images || []).length, search: needle || undefined })
      .then((r) => { if (my !== seq.current) return; setImages((prev) => (reset || !prev ? r.images || [] : [...prev, ...(r.images || [])])); setTotal(r.total ?? (r.images || []).length) })
      .catch((e) => { if (my !== seq.current) return; setImages((prev) => prev || []); setErr(errText(e, "Couldn't load the images")) })
      .finally(() => { if (my === seq.current) setMore(false) })
  }
  useEffect(() => { load(true) }, [worldId, needle]) // eslint-disable-line

  const upload = async (file) => {
    if (!file) return
    const v = imageServiceBase64.validateImage(file) // the same rules as the Archive, said before anything is sent
    if (!v.valid) { setErr(v.error); return }
    setBusy(true); setErr('')
    try {
      const r = await imageServiceBase64.uploadImage(file, worldId)
      onPick(r.image.id, r.image.url)
    } catch (e) {
      setBusy(false); setErr(errText(e, 'Upload failed'))
    }
  }

  return (
    <Modal title={title} onClose={onClose} className="top">
        {generate && (
          <div className="pgen">
            <button className="btn primary block" disabled={genBusy || busy} onClick={runGen}
              title="Paints art in this world's style and attaches it right here">
              {genBusy ? 'Painting… about half a minute' : `✦ ${generate.label}`}
            </button>
            <input value={gGuide} maxLength={480} disabled={genBusy}
              placeholder="Optional direction — “weathered face, storm cloak, one eye”"
              onChange={(e) => setGGuide(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') runGen() }} />
          </div>
        )}
        <button type="button" className="btn block" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? 'Uploading…' : '⬆ Upload new image (PNG, JPEG, GIF or WebP, up to 10 MB)'}</button>
        <input ref={fileRef} type="file" accept={ACCEPT} hidden disabled={busy} onChange={(e) => { upload(e.target.files[0]); e.target.value = '' }} />
        {hasCurrent && <button className="btn block" onClick={() => onPick(null, null)}>{removeLabel}</button>}
        {err && <div className="muted" style={{ color: '#ff9b9b' }}>{err}</div>}
        <input className="nsearch" placeholder="Search the archive…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="pick-grid">
          {images === null && <div className="muted">Loading…</div>}
          {(images || []).map((im) => (
            <button key={im.id} className={`pick${im.id === currentId ? ' current' : ''}`} onClick={() => onPick(im.id, im.url)}
              title={`${im.originalName}${im.id === currentId ? ' — the current image' : ''} — ${describeUse(im)}`}>
              <img src={im.url} alt={im.originalName} loading="lazy" />
              <span className="pname">{im.originalName}</span>
              {usesOf(im) > 0
                ? <span className="puse on" title="In use in your world">◈</span>
                : <span className="puse" title="Not used anywhere yet">○</span>}
            </button>
          ))}
          {images !== null && images.length === 0 && !err && <div className="muted">{needle ? `Nothing named like “${needle}”.` : 'No images in this world yet — upload one above.'}</div>}
        </div>
        {images !== null && images.length < total && (
          <button type="button" className="btn block" disabled={more} onClick={() => load(false)}>{more ? 'Loading…' : `Show more (${total - images.length} remain)`}</button>
        )}
    </Modal>
  )
}

// Pick a node from this world (searchable). onPick gets the id; onPickNode the whole node.
export function NodePicker({ worldId, excludeId, excludeIds, excludedNote, title, unplacedFirst, onPick, onPickNode, onClose }) {
  const [nodes, setNodes] = useState(null) // null = loading
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const load = () => { setErr(''); setNodes(null); atlasService.getNodes(worldId).then((ns) => setNodes(ns || [])).catch((e) => { setNodes([]); setErr(errText(e, "Couldn't load the nodes")) }) }
  useEffect(load, [worldId]) // eslint-disable-line
  const skip = new Set(excludeIds || [])
  if (excludeId != null) skip.add(excludeId)
  const match = (n) => (n.title || '').toLowerCase().includes(q.toLowerCase())
  const list = (nodes || []).filter((n) => !skip.has(n.id) && match(n))
  // what the search finds but the picker leaves out (already here, already threaded) — said, not hidden
  const left = (nodes || []).filter((n) => skip.has(n.id) && n.id !== excludeId && match(n))
  const pick = (n) => (onPickNode ? onPickNode(n) : onPick(n.id))
  // Placing flows float the homeless to the top; the sort is stable, so titles stay ordered within each group.
  if (unplacedFirst) list.sort((a, b) => (a.placed === false ? 0 : 1) - (b.placed === false ? 0 : 1))
  return (
    <Modal title={title} onClose={onClose}>
        <input className="nsearch" autoFocus placeholder="Search entries…" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && list[0]) { e.preventDefault(); pick(list[0]) } }} />
        <div className="nlist">
          {nodes === null && <div className="muted">Loading…</div>}
          {err && <div className="muted">{err} <button type="button" className="lnk" onClick={load}>Retry</button></div>}
          {list.map((n) => (
            <button key={n.id} className="nrow" onClick={() => pick(n)}>
              <span className="ic" style={{ background: cat(n.category).c }}>{cat(n.category).i}</span>
              <span className="lbl">{n.title}</span>
              {n.placed === false && <span className="gorphan">○ Unplaced</span>}
              {n.hasInterior && <span className="open" aria-hidden="true">◎</span>}
            </button>
          ))}
          {nodes !== null && !err && list.length === 0 && left.length === 0 && <div className="muted">No matching nodes.</div>}
          {left.length > 0 && <div className="muted esmall">{excludedNote || 'Left out'}: {left.slice(0, 6).map((n) => n.title).join(', ')}{left.length > 6 ? '…' : ''}</div>}
        </div>
    </Modal>
  )
}
