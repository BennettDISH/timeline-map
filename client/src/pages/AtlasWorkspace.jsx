import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import atlasService from '../services/atlasService'
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
  const saveTimer = useRef(null)

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

  // --- actions ---
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
            className={`canvas ${map?.backdropUrl ? '' : 'grid'}`}
            style={map?.backdropUrl ? { backgroundImage: `url(${map.backdropUrl})` } : undefined}
            onClick={(e) => {
              if (placing) {
                const r = e.currentTarget.getBoundingClientRect()
                dropNode(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100)
              } else { setSelId(null) }
            }}
          >
            {(data?.placements || []).map((p) => (
              <div key={p.id}
                className={`pin ${selId === p.id ? 'sel' : ''} ${p.node.hasInterior ? 'open2' : ''}`}
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
                onClick={(e) => { e.stopPropagation(); setSelId(p.id) }}
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
              </div>
            )}
          </div>

          <div className="toolbar">
            <button className={`tool ${placing ? 'on' : ''}`} onClick={() => setPlacing((v) => !v)}>＋ Add node</button>
          </div>
          <div className="hint">
            {placing
              ? 'Click the map to drop a node — set its category in the inspector.'
              : 'Click a node to inspect · double-click a ◎ node to zoom in.'}
          </div>
        </div>

        <div className="insp">
          {!sel ? (
            <div className="empty">Nothing selected.<br /><br />Click a node, or use <b>+ Add node</b> then click the map.</div>
          ) : (
            <Inspector key={sel.node.id} p={sel} onSave={saveNode}
              onCat={(c) => saveNode(sel.node.id, { category: c })}
              onOpen={() => openInterior(sel.node)} onCreate={(v) => createInteriorAs(sel.node, v)}
              onDelete={() => removeNode(sel.node)} savedAt={savedAt} />
          )}
        </div>
      </div>
    </div>
  )
}

function Inspector({ p, onSave, onCat, onOpen, onCreate, onDelete, savedAt }) {
  const [title, setTitle] = useState(p.node.title)
  const [body, setBody] = useState(p.node.body || '')
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

export default AtlasWorkspace
