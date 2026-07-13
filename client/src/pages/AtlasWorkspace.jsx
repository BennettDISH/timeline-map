import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import atlasService from '../services/atlasService'
import imageServiceBase64 from '../services/imageServiceBase64'
import '../styles/atlas.scss'

const CATS = {
  note: { c: 'var(--note)', i: '•', label: 'Note' },
  place: { c: 'var(--place)', i: '▲', label: 'Place' },
  person: { c: 'var(--person)', i: '☻', label: 'Person' },
  item: { c: 'var(--item)', i: '◆', label: 'Item' },
  lore: { c: 'var(--lore)', i: '✦', label: 'Lore' },
  event: { c: 'var(--event)', i: '✷', label: 'Event' },
}
const cat = (k) => CATS[k] || CATS.note
const clamp = (v) => Math.max(0, Math.min(100, v))

function AtlasWorkspace() {
  const { worldId, mapId } = useParams()
  const navigate = useNavigate()

  const [world, setWorld] = useState(null)
  const [tree, setTree] = useState([])
  const [data, setData] = useState(null) // { map, placements, links, breadcrumb }
  const [selId, setSelId] = useState(null) // selected placement id
  const [placing, setPlacing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [savedAt, setSavedAt] = useState(0)
  const [picker, setPicker] = useState(null) // { kind: 'node'|'backdrop', nodeId?, hasCurrent }
  const [now, setNow] = useState(0) // current timeline position (scrub)
  const saveTimer = useRef(null)
  const tlTimer = useRef(null)
  const canvasRef = useRef(null)
  const dragRef = useRef(null)

  const reloadMap = () => (mapId ? atlasService.getMap(mapId).then(setData).catch(() => setData(null)) : Promise.resolve())
  const refreshTree = () => atlasService.getMaps(worldId).then(setTree).catch(() => {})

  // Load the world (ensures a root map) + the map tree; drop onto the root map if none is in the URL.
  useEffect(() => {
    let live = true
    setLoading(true)
    atlasService.getWorld(worldId)
      .then(async (w) => {
        if (!live) return
        setWorld(w)
        setNow(w.timeline?.current ?? 0)
        const maps = await atlasService.getMaps(worldId).catch(() => [])
        if (live) setTree(maps)
        if (!mapId && w.rootMapId) navigate(`/w/${worldId}/m/${w.rootMapId}`, { replace: true })
      })
      .catch(() => {})
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [worldId]) // eslint-disable-line

  useEffect(() => { setSelId(null); if (mapId) reloadMap() }, [mapId]) // eslint-disable-line

  const sel = data?.placements.find((p) => p.id === selId) || null

  // --- node/placement actions ---
  const dropNode = async (x, y) => {
    const r = await atlasService.addNode(mapId, { x, y })
    await reloadMap(); refreshTree(); setSelId(r.placementId); setPlacing(false)
  }
  const localPatchNode = (nodeId, patch) => setData((d) => d && ({
    ...d, placements: d.placements.map((p) => (p.node.id === nodeId ? { ...p, node: { ...p.node, ...patch } } : p)),
  }))
  const saveNode = (nodeId, patch) => {
    localPatchNode(nodeId, patch)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      atlasService.patchNode(nodeId, patch).then(() => setSavedAt(Date.now())).catch(() => {})
    }, 350)
  }
  const openInterior = async (node) => {
    if (node.interiorMapId) return navigate(`/w/${worldId}/m/${node.interiorMapId}`)
    const r = await atlasService.createInterior(node.id, 'map')
    refreshTree(); navigate(`/w/${worldId}/m/${r.mapId}`)
  }
  const createInteriorAs = async (node, view) => {
    const r = await atlasService.createInterior(node.id, view)
    refreshTree(); navigate(`/w/${worldId}/m/${r.mapId}`)
  }
  const removeNode = async (node) => {
    if (!window.confirm(`Delete "${node.title}" everywhere? This removes it from all maps and deletes its interior.`)) return
    await atlasService.deleteNode(node.id); setSelId(null); reloadMap(); refreshTree()
  }

  // --- images (reuse the R2-backed image pipeline) ---
  const setNodeImage = (nodeId, imageId, imageUrl) => {
    localPatchNode(nodeId, { imageUrl: imageUrl || null })
    atlasService.patchNode(nodeId, { image_id: imageId }).then(() => setSavedAt(Date.now())).catch(() => {})
  }
  const setBackdrop = (imageId) => atlasService.patchMap(mapId, { image_id: imageId }).then(reloadMap).catch(() => {})
  const handlePick = (imageId, imageUrl) => {
    const pk = picker; setPicker(null); if (!pk) return
    if (pk.kind === 'backdrop') setBackdrop(imageId)
    else if (pk.nodeId) setNodeImage(pk.nodeId, imageId, imageUrl)
  }

  // --- timeline (world clock + per-placement lifespans) ---
  const tl = world?.timeline
  const present = (p) => (!tl?.enabled ? true : (p.start == null || now >= p.start) && (p.end == null || now <= p.end))
  const scrub = (v) => {
    setNow(v)
    clearTimeout(tlTimer.current)
    tlTimer.current = setTimeout(() => atlasService.patchWorld(worldId, { timeline_current_time: v }).catch(() => {}), 300)
  }
  const enableTimeline = () => {
    setWorld((w) => w && ({ ...w, timeline: { enabled: true, min: 0, max: 100, current: 0, unit: 'days' } }))
    setNow(0)
    atlasService.patchWorld(worldId, {
      timeline_enabled: true, timeline_min_time: 0, timeline_max_time: 100, timeline_current_time: 0, timeline_time_unit: 'days',
    }).catch(() => {})
  }
  const setLifespan = (placementId, start, end) => {
    setData((d) => d && ({ ...d, placements: d.placements.map((pp) => (pp.id === placementId ? { ...pp, start, end } : pp)) }))
    atlasService.patchPlacement(placementId, { start_time: start, end_time: end }).then(() => setSavedAt(Date.now())).catch(() => {})
  }

  // --- drag to reposition a placement (stable handlers read live state from dragRef) ---
  const onDragMove = useCallback((e) => {
    const d = dragRef.current; if (!d) return
    const nx = clamp(d.ox + ((e.clientX - d.sx) / d.rect.width) * 100)
    const ny = clamp(d.oy + ((e.clientY - d.sy) / d.rect.height) * 100)
    d.lastX = nx; d.lastY = ny
    if (Math.abs(e.clientX - d.sx) > 3 || Math.abs(e.clientY - d.sy) > 3) d.moved = true
    setData((prev) => prev && ({ ...prev, placements: prev.placements.map((pp) => (pp.id === d.id ? { ...pp, x: nx, y: ny } : pp)) }))
  }, [])
  const onDragUp = useCallback(() => {
    const d = dragRef.current; dragRef.current = null
    window.removeEventListener('pointermove', onDragMove)
    window.removeEventListener('pointerup', onDragUp)
    if (!d) return
    if (d.moved) atlasService.patchPlacement(d.id, { x: d.lastX, y: d.lastY }).catch(() => {})
    else setSelId(d.id) // a click (no movement) just selects
  }, [onDragMove])
  const onPinDown = (e, p) => {
    if (placing) return // in placing mode, let the press bubble so a click drops a node
    e.stopPropagation()
    const rect = canvasRef.current.getBoundingClientRect()
    dragRef.current = { id: p.id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, rect, moved: false, lastX: p.x, lastY: p.y }
    window.addEventListener('pointermove', onDragMove)
    window.addEventListener('pointerup', onDragUp)
  }

  // --- nesting tree ---
  const rootId = world?.rootMapId
  const childrenOf = (pid) => tree.filter((m) => (m.parentMapId || null) === (pid ?? null) && m.id !== rootId)
  const renderTree = (list, depth) => list.map((m) => (
    <React.Fragment key={m.id}>
      <div className={`trow ${String(m.id) === String(mapId) ? 'on' : ''}`} style={{ paddingLeft: 6 + depth * 14 }}
        onClick={() => navigate(`/w/${worldId}/m/${m.id}`)}>
        <span className="tw">▸</span>{m.title}
      </div>
      {renderTree(childrenOf(m.id), depth + 1)}
    </React.Fragment>
  ))

  if (loading && !world) {
    return <div className="atlas"><div className="loading" style={{ gridRow: '1 / 3' }}>Loading world…</div></div>
  }

  const map = data?.map
  return (
    <div className="atlas">
      <div className="top">
        <span className="brand">🧭 {world?.name}</span>
        <div className="crumbs">
          {(data?.breadcrumb || []).map((b, i, arr) => (
            <React.Fragment key={b.mapId}>
              {i > 0 && <span className="sep">▸</span>}
              {i === arr.length - 1
                ? <span className="here">{b.title}</span>
                : <a onClick={() => navigate(`/w/${worldId}/m/${b.mapId}`)}>{b.title}</a>}
            </React.Fragment>
          ))}
        </div>
        <Link to="/dashboard" className="exit">Exit</Link>
      </div>

      <div className="main">
        <div className="rail">
          <h4>Maps</h4>
          {rootId && (
            <div className={`trow ${String(rootId) === String(mapId) ? 'on' : ''}`}
              onClick={() => navigate(`/w/${worldId}/m/${rootId}`)}>
              <span className="tw">▸</span>{tree.find((m) => m.id === rootId)?.title || 'World map'}
            </div>
          )}
          {renderTree(childrenOf(rootId), 1)}
        </div>

        <div className="stage">
          <div
            ref={canvasRef}
            className={`canvas ${map?.backdropUrl ? '' : 'grid'}`}
            style={map?.backdropUrl ? { backgroundImage: `url(${map.backdropUrl})` } : undefined}
            onPointerDown={() => { if (!placing) setSelId(null) }}
            onClick={(e) => {
              if (!placing) return
              const r = e.currentTarget.getBoundingClientRect()
              dropNode(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100)
            }}
          >
            {(data?.placements || []).map((p) => (
              <div key={p.id}
                className={`pin ${selId === p.id ? 'sel' : ''} ${p.node.hasInterior ? 'open2' : ''} ${tl?.enabled && !present(p) ? 'ghost' : ''}`}
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
                onPointerDown={(e) => onPinDown(e, p)}
                onDoubleClick={(e) => { e.stopPropagation(); openInterior(p.node) }}>
                <span className="ic" style={{ background: cat(p.node.category).c }}>{cat(p.node.category).i}</span>
                <span className="lbl">{p.node.title}</span>
                {p.node.hasInterior && <span className="open">◎</span>}
              </div>
            ))}
            {data && data.placements.length === 0 && !placing && (
              <div className="empty-map">
                <div style={{ fontSize: '2rem' }}>🗺️</div>
                <div>Empty map. Click <b>+ Add node</b>, then click here to drop your first node.</div>
                <div className="muted">Tip: use <b>🖼 Backdrop</b> to drop in a map image first.</div>
              </div>
            )}
          </div>

          <div className="toolbar">
            <button className={`tool ${placing ? 'on' : ''}`} onClick={() => setPlacing((v) => !v)}>＋ Add node</button>
            <button className="tool" onClick={() => setPicker({ kind: 'backdrop', hasCurrent: !!map?.backdropUrl })}>🖼 Backdrop</button>
            {map?.backdropUrl && <button className="tool" onClick={() => setBackdrop(null)}>Remove backdrop</button>}
            {!tl?.enabled && <button className="tool" onClick={enableTimeline}>🕓 Enable timeline</button>}
          </div>
          <div className="hint" style={tl?.enabled ? { bottom: 64 } : undefined}>
            {placing
              ? 'Click the map to drop a node — set its category in the inspector.'
              : 'Click to inspect · drag to move · double-click a ◎ node to zoom in.'}
          </div>
          {tl?.enabled && (
            <div className="timebar">
              <span className="tlabel">{tl.min}</span>
              <input type="range" min={tl.min} max={tl.max} value={now} onChange={(e) => scrub(Number(e.target.value))} />
              <span className="tlabel">{tl.max}</span>
              <span className="tnow">{now}<em> {tl.unit}</em></span>
            </div>
          )}
        </div>

        <div className="insp">
          {!sel ? (
            <div className="empty">Nothing selected.<br /><br />Click a node, or use <b>+ Add node</b> then click the map.</div>
          ) : (
            <Inspector key={sel.node.id} p={sel} onSave={saveNode}
              onCat={(c) => saveNode(sel.node.id, { category: c })}
              onOpen={() => openInterior(sel.node)} onCreate={(v) => createInteriorAs(sel.node, v)}
              onImage={() => setPicker({ kind: 'node', nodeId: sel.node.id, hasCurrent: !!sel.node.imageUrl })}
              onRemoveImage={() => setNodeImage(sel.node.id, null, null)}
              timeline={tl} onLifespan={(s, e) => setLifespan(sel.id, s, e)}
              onDelete={() => removeNode(sel.node)} savedAt={savedAt} />
          )}
        </div>
      </div>

      {picker && (
        <ImagePicker worldId={worldId} hasCurrent={picker.hasCurrent}
          onPick={handlePick} onClose={() => setPicker(null)} />
      )}
    </div>
  )
}

function Inspector({ p, onSave, onCat, onOpen, onCreate, onImage, onRemoveImage, timeline, onLifespan, onDelete, savedAt }) {
  const [title, setTitle] = useState(p.node.title)
  const [body, setBody] = useState(p.node.body || '')
  const [start, setStart] = useState(p.start ?? '')
  const [end, setEnd] = useState(p.end ?? '')
  const n = p.node
  return (
    <>
      <div className="fld"><label>Title</label>
        <input value={title} onChange={(e) => { setTitle(e.target.value); onSave(n.id, { title: e.target.value }) }} />
      </div>
      <div className="fld"><label>Category — a label; swap anytime</label>
        <div className="chips">
          {Object.entries(CATS).map(([k, v]) => (
            <button key={k} className="chip" onClick={() => onCat(k)}
              style={n.category === k ? { background: v.c, color: '#fff', borderColor: v.c } : undefined}>
              <span className="ic" style={{ background: v.c }}>{v.i}</span>{v.label}
            </button>
          ))}
        </div>
      </div>
      <div className="fld"><label>Description</label>
        <textarea rows="4" value={body} onChange={(e) => { setBody(e.target.value); onSave(n.id, { body: e.target.value }) }} />
      </div>
      <div className="fld"><label>Image</label>
        {n.imageUrl ? (
          <div className="nimg">
            <img src={n.imageUrl} alt="" />
            <div className="nimg-actions">
              <button className="btn" onClick={onImage}>Change</button>
              <button className="btn danger" onClick={onRemoveImage}>Remove</button>
            </div>
          </div>
        ) : (
          <button className="btn block" onClick={onImage}>＋ Add image</button>
        )}
      </div>
      {timeline?.enabled && (
        <div className="fld"><label>Lifespan — when it's present</label>
          <div className="span">
            <input type="number" placeholder="from" value={start}
              onChange={(e) => { const v = e.target.value; setStart(v); onLifespan(v === '' ? null : Number(v), end === '' ? null : Number(end)) }} />
            <span>→</span>
            <input type="number" placeholder="to" value={end}
              onChange={(e) => { const v = e.target.value; setEnd(v); onLifespan(start === '' ? null : Number(start), v === '' ? null : Number(v)) }} />
          </div>
          <div className="muted">Blank = always present. Scrub the timeline to see it appear / disappear.</div>
        </div>
      )}
      <hr />
      {n.hasInterior
        ? <button className="btn primary block" onClick={onOpen}>◎ Open interior ▸</button>
        : (
          <>
            <button className="btn block" onClick={() => onCreate('map')}>＋ Give it an interior map (zoom in)</button>
            <button className="btn block" onClick={() => onCreate('list')}>＋ Give it an interior list (inventory / notes)</button>
          </>
        )}
      <hr />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="saved">{savedAt ? '✓ Saved' : ''}</span>
        <button className="btn danger" onClick={onDelete}>🗑 Delete node</button>
      </div>
    </>
  )
}

// Upload a new image (to R2 via the existing pipeline) or pick an existing one from this world.
function ImagePicker({ worldId, hasCurrent, onPick, onClose }) {
  const [images, setImages] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    imageServiceBase64.getImages({ worldId }).then((r) => setImages(r.images || [])).catch(() => {})
  }, [worldId])

  const upload = async (file) => {
    if (!file) return
    setBusy(true); setErr('')
    try {
      const r = await imageServiceBase64.uploadImage(file, worldId)
      onPick(r.image.id, r.image.url) // auto-select the freshly uploaded image
    } catch (e) {
      setBusy(false); setErr(e?.message || 'Upload failed')
    }
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h4>Choose image</h4><button onClick={onClose}>✕</button></div>
        <label className="btn primary block">
          {busy ? 'Uploading…' : '⬆ Upload new image'}
          <input type="file" accept="image/*" hidden disabled={busy} onChange={(e) => upload(e.target.files[0])} />
        </label>
        {hasCurrent && <button className="btn block" onClick={() => onPick(null, null)}>Remove current image</button>}
        {err && <div className="muted" style={{ color: '#ff9b9b' }}>{err}</div>}
        <div className="pick-grid">
          {images.map((im) => (
            <button key={im.id} className="pick" title={im.originalName} onClick={() => onPick(im.id, im.url)}>
              <img src={im.url} alt={im.originalName} loading="lazy" />
            </button>
          ))}
          {images.length === 0 && <div className="muted">No images in this world yet — upload one above.</div>}
        </div>
      </div>
    </div>
  )
}

export default AtlasWorkspace
