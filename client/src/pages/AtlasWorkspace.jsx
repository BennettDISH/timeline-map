import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import atlasService from '../services/atlasService'
import imageServiceBase64 from '../services/imageServiceBase64'
import MapPlane from '../components/MapPlane'
import { CATS, cat } from '../utils/categories'
import '../styles/atlas.scss'

const clamp = (v) => Math.max(0, Math.min(100, v))
const errText = (e, fallback) => e?.response?.data?.message || e?.message || fallback

function AtlasWorkspace() {
  const { worldId, mapId } = useParams()
  const navigate = useNavigate()

  const [world, setWorld] = useState(null)
  const [tree, setTree] = useState([])
  const [data, setData] = useState(null) // { map, placements, links, breadcrumb }
  const [loadState, setLoadState] = useState('loading') // loading | ok | err
  const [selId, setSelId] = useState(null) // selected placement id
  const [placing, setPlacing] = useState(null) // null | {kind:'new'} | {kind:'existing', node}
  const [loading, setLoading] = useState(true)
  const [save, setSave] = useState('idle') // idle | saving | saved | err
  const [flash, setFlash] = useState(null) // { kind: 'ok'|'err'|'info', text }
  const [picker, setPicker] = useState(null) // { kind: 'node'|'backdrop', nodeId?, hasCurrent }
  const [now, setNow] = useState(0) // the DM's viewing moment (local lens — NOT what players see)
  const [tlEdit, setTlEdit] = useState(false)
  const [sharePop, setSharePop] = useState(false)
  const [copied, setCopied] = useState(false)
  const [mode, setMode] = useState(() => localStorage.getItem('atlas_mode') || 'dm')
  const [nodeLinks, setNodeLinks] = useState({ out: [], in: [] })
  const [nodePicker, setNodePicker] = useState(null) // 'link' | 'place'
  const [hiddenCats, setHiddenCats] = useState(() => new Set())
  const [q, setQ] = useState('') // global node search
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchIndex, setSearchIndex] = useState([])
  const [confirmDel, setConfirmDel] = useState(null) // { node, impact }

  const saveTimer = useRef(null)
  const pendingPatch = useRef({ nodeId: null, patch: {} })
  const inflight = useRef(0)
  const worldRef = useRef(null)
  const dragRef = useRef(null)
  const pendingSelect = useRef(null)
  const shareRef = useRef(null)
  const searchRef = useRef(null)

  // ---- save tracking: every write goes through track(), so the header chip is honest
  // and failures surface as a toast instead of vanishing into an empty catch.
  const track = useCallback((promise, failMsg) => {
    inflight.current += 1
    setSave('saving')
    return promise
      .then((r) => { if ((inflight.current -= 1) === 0) setSave('saved'); return r })
      .catch((e) => {
        inflight.current -= 1
        setSave('err')
        setFlash({ kind: 'err', text: errText(e, failMsg || "Couldn't save — check your connection") })
        throw e
      })
  }, [])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 4000)
    return () => clearTimeout(t)
  }, [flash])

  // ---- loading the world + map --------------------------------------------------
  const refreshTree = () => atlasService.getMaps(worldId).then(setTree).catch(() => {})
  const loadMap = useCallback((blank) => {
    if (!mapId) return Promise.resolve()
    if (blank) { setData(null); setLoadState('loading') }
    return atlasService.getMap(mapId)
      .then((d) => { setData(d); setLoadState('ok') })
      .catch((e) => {
        if (blank) setLoadState('err')
        else setFlash({ kind: 'err', text: errText(e, "Couldn't refresh the map") })
      })
  }, [mapId])
  const refreshMap = () => loadMap(false) // background refresh: keeps the canvas up while fetching

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
      .catch((e) => { if (live) setFlash({ kind: 'err', text: errText(e, "Couldn't load this world") }) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [worldId]) // eslint-disable-line

  useEffect(() => {
    setSelId(null)
    setPlacing(null)
    loadMap(true).then(() => {
      if (pendingSelect.current) { setSelId(pendingSelect.current); pendingSelect.current = null }
    })
  }, [mapId]) // eslint-disable-line

  const sel = data?.placements.find((p) => p.id === selId) || null
  const map = data?.map
  const isList = map?.view === 'list'

  // ---- links ---------------------------------------------------------------------
  const reloadLinks = (nodeId) =>
    atlasService.getNode(nodeId).then((d) => setNodeLinks({ out: d.links, in: d.backlinks })).catch(() => {})
  useEffect(() => {
    if (!sel) { setNodeLinks({ out: [], in: [] }); return }
    let live = true
    atlasService.getNode(sel.node.id).then((d) => { if (live) setNodeLinks({ out: d.links, in: d.backlinks }) }).catch(() => {})
    return () => { live = false }
  }, [selId]) // eslint-disable-line
  const addLink = async (toId) => {
    setNodePicker(null)
    if (!sel) return
    await track(atlasService.addLink({ from_node_id: sel.node.id, to_node_id: toId }), "Couldn't link").catch(() => {})
    reloadLinks(sel.node.id)
  }
  const removeLink = async (id) => {
    await track(atlasService.deleteLink(id), "Couldn't remove the link").catch(() => {})
    if (sel) reloadLinks(sel.node.id)
  }
  const jump = async (nodeId) => {
    const loc = await atlasService.locateNode(nodeId).catch(() => null)
    if (!loc || !loc.mapId) {
      setFlash({ kind: 'info', text: "That node isn't placed on any map — use ⤓ Place existing to put it somewhere." })
      return
    }
    if (String(loc.mapId) === String(mapId)) { if (loc.placementId) setSelId(loc.placementId); return }
    if (loc.placementId) pendingSelect.current = loc.placementId
    navigate(`/w/${worldId}/m/${loc.mapId}`)
  }

  // ---- node & placement actions ----------------------------------------------------
  const dropNode = async (x, y) => {
    const r = await track(atlasService.addNode(mapId, { x, y }), "Couldn't add the node").catch(() => null)
    if (!r) return
    await refreshMap(); refreshTree(); setSelId(r.placementId); setPlacing(null)
  }
  const placeExisting = async (node, x, y) => {
    const r = await track(atlasService.placeNode(mapId, { node_id: node.id, x, y }), "Couldn't place it").catch(() => null)
    setPlacing(null)
    if (!r) return
    await refreshMap(); setSelId(r.placementId)
    setFlash({ kind: 'ok', text: `"${node.title}" placed here — same node, new spot.` })
  }
  const localPatchNode = (nodeId, patch) => setData((d) => d && ({
    ...d, placements: d.placements.map((p) => (p.node.id === nodeId ? { ...p, node: { ...p.node, ...patch } } : p)),
  }))

  // Debounced autosave with a MERGED pending patch: rapid edits to two fields used to
  // overwrite each other's timer payload, silently dropping the first field's save.
  const flushSave = useCallback(() => {
    const { nodeId, patch } = pendingPatch.current
    if (nodeId == null) return
    pendingPatch.current = { nodeId: null, patch: {} }
    track(atlasService.patchNode(nodeId, patch)).catch(() => {})
  }, [track])
  const saveNode = (nodeId, patch) => {
    localPatchNode(nodeId, patch)
    if (pendingPatch.current.nodeId != null && pendingPatch.current.nodeId !== nodeId) flushSave()
    pendingPatch.current = { nodeId, patch: { ...pendingPatch.current.patch, ...patch } }
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(flushSave, 500)
  }
  useEffect(() => () => { clearTimeout(saveTimer.current); flushSave() }, [flushSave]) // flush on unmount

  const openInterior = async (node) => {
    flushSave()
    if (node.interiorMapId) return navigate(`/w/${worldId}/m/${node.interiorMapId}`)
    const r = await track(atlasService.createInterior(node.id, 'map'), "Couldn't create the interior").catch(() => null)
    if (!r) return
    refreshTree(); navigate(`/w/${worldId}/m/${r.mapId}`)
  }
  const createInteriorAs = async (node, view) => {
    const r = await track(atlasService.createInterior(node.id, view), "Couldn't create the interior").catch(() => null)
    if (!r) return
    refreshTree(); navigate(`/w/${worldId}/m/${r.mapId}`)
  }

  const askDeleteNode = async (node) => {
    const impact = await atlasService.nodeImpact(node.id).catch(() => null)
    setConfirmDel({ node, impact })
  }
  const doDeleteNode = async () => {
    const node = confirmDel.node
    setConfirmDel(null)
    const r = await track(atlasService.deleteNode(node.id), "Couldn't delete the node").catch(() => null)
    if (!r) return
    setSelId(null); refreshMap(); refreshTree()
    setFlash({ kind: 'ok', text: `"${node.title}" is gone.` })
  }
  const removeFromMap = async (p) => {
    const r = await track(atlasService.deletePlacement(p.id), "Couldn't remove it").catch(() => null)
    if (!r) return
    setSelId(null); refreshMap()
    setFlash({ kind: 'ok', text: `"${p.node.title}" removed from this map — the node itself still exists (find it with search).` })
  }

  // ---- images -----------------------------------------------------------------------
  const setNodeImage = (nodeId, imageId, imageUrl) => {
    localPatchNode(nodeId, { imageUrl: imageUrl || null })
    track(atlasService.patchNode(nodeId, { image_id: imageId })).catch(() => {})
  }
  const setBackdrop = (imageId) =>
    track(atlasService.patchMap(mapId, { image_id: imageId }), "Couldn't set the backdrop").then(refreshMap).catch(() => {})
  const handlePick = (imageId, imageUrl) => {
    const pk = picker; setPicker(null); if (!pk) return
    if (pk.kind === 'backdrop') setBackdrop(imageId)
    else if (pk.nodeId) setNodeImage(pk.nodeId, imageId, imageUrl)
  }

  const setMapView = (view) => {
    if (!map || map.view === view) return
    setData((d) => d && ({ ...d, map: { ...d.map, view } }))
    track(atlasService.patchMap(mapId, { view }), "Couldn't switch the view").catch(() => {})
  }

  // ---- reveal + timeline: the scrubber is a LENS (local); players see the CANON moment,
  // which only moves when the DM explicitly sets it.
  const tl = world?.timeline
  const canon = tl?.current ?? 0
  const switchMode = (m) => { setMode(m); try { localStorage.setItem('atlas_mode', m) } catch (e) { /* ignore */ } }
  const present = (p) => (!tl?.enabled ? true : (p.start == null || now >= p.start) && (p.end == null || now <= p.end))
  const setCanonHere = () => {
    track(atlasService.patchWorld(worldId, { timeline_current_time: now }), "Couldn't set the canon moment")
      .then(() => {
        setWorld((w) => w && ({ ...w, timeline: { ...w.timeline, current: now } }))
        setFlash({ kind: 'ok', text: `Canon moment set to ${now} ${tl.unit} — that's what players now see.` })
      }).catch(() => {})
  }
  const enableTimeline = () => {
    setWorld((w) => w && ({ ...w, timeline: { enabled: true, min: 0, max: 100, current: 0, unit: 'days' } }))
    setNow(0)
    track(atlasService.patchWorld(worldId, {
      timeline_enabled: true, timeline_min_time: 0, timeline_max_time: 100, timeline_current_time: 0, timeline_time_unit: 'days',
    })).catch(() => {})
    setTlEdit(true)
  }
  const saveTimeline = (min, max, unit) => {
    if (!(min < max)) return
    const cur = Math.min(Math.max(now, min), max)
    setWorld((w) => w && ({ ...w, timeline: { ...w.timeline, min, max, unit, current: cur } }))
    setNow(cur)
    setTlEdit(false)
    track(atlasService.patchWorld(worldId, {
      timeline_min_time: min, timeline_max_time: max, timeline_time_unit: unit, timeline_current_time: cur,
    })).catch(() => {})
  }
  const disableTimeline = () => {
    setWorld((w) => w && ({ ...w, timeline: { ...w.timeline, enabled: false } }))
    setTlEdit(false)
    track(atlasService.patchWorld(worldId, { timeline_enabled: false })).catch(() => {})
  }

  // ---- share link ----------------------------------------------------------------------
  const shareUrl = world?.shareToken ? `${window.location.origin}/p/${world.shareToken}` : null
  const shareOn = () => track(atlasService.createShare(worldId), "Couldn't create the link")
    .then(({ token }) => { setWorld((w) => w && ({ ...w, shareToken: token })); setCopied(false) }).catch(() => {})
  const shareOff = () => track(atlasService.deleteShare(worldId), "Couldn't turn it off")
    .then(() => { setWorld((w) => w && ({ ...w, shareToken: null })); setCopied(false) }).catch(() => {})
  const copyShare = () => {
    navigator.clipboard?.writeText(shareUrl).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    }).catch(() => setFlash({ kind: 'err', text: "Couldn't copy — select the link text instead." }))
  }
  useEffect(() => {
    if (!sharePop) return
    const close = (e) => { if (shareRef.current && !shareRef.current.contains(e.target)) setSharePop(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [sharePop])

  const setLifespan = (placementId, start, end) => {
    setData((d) => d && ({ ...d, placements: d.placements.map((pp) => (pp.id === placementId ? { ...pp, start, end } : pp)) }))
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() =>
      track(atlasService.patchPlacement(placementId, { start_time: start, end_time: end })).catch(() => {}), 500)
  }

  // ---- drag to reposition (math is against the world PLANE rect, which includes zoom) ----
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
    if (d.moved) track(atlasService.patchPlacement(d.id, { x: d.lastX, y: d.lastY })).catch(() => {})
    else setSelId(d.id)
  }, [onDragMove, track])
  const onPinDown = (e, p) => {
    if (placing) return // placing mode: let the press reach the plane so the click drops there
    e.stopPropagation()
    const rect = worldRef.current.getBoundingClientRect()
    dragRef.current = { id: p.id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, rect, moved: false, lastX: p.x, lastY: p.y }
    window.addEventListener('pointermove', onDragMove)
    window.addEventListener('pointerup', onDragUp)
  }

  // ---- global node search -----------------------------------------------------------
  const openSearch = () => {
    setSearchOpen(true)
    atlasService.getNodes(worldId).then(setSearchIndex).catch(() => {})
  }
  const closeSearch = () => { setSearchOpen(false); setQ('') }
  useEffect(() => {
    if (!searchOpen) return
    const close = (e) => { if (searchRef.current && !searchRef.current.contains(e.target)) closeSearch() }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [searchOpen])
  useEffect(() => {
    const key = (e) => {
      if (e.key === '/' && !/input|textarea|select/i.test(e.target.tagName)) {
        e.preventDefault(); searchRef.current?.querySelector('input')?.focus()
      } else if (e.key === 'Escape') { setPlacing(null); closeSearch() }
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [])
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return []
    return searchIndex.filter((n) => (n.title || '').toLowerCase().includes(needle)).slice(0, 12)
  }, [q, searchIndex])

  // ---- category legend / filter -------------------------------------------------------
  const legend = useMemo(() => {
    const counts = {}
    for (const p of data?.placements || []) counts[p.node.category] = (counts[p.node.category] || 0) + 1
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [data])
  const toggleCat = (k) => setHiddenCats((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })

  // ---- world-plane interactions ---------------------------------------------------------
  const onWorldClick = (e) => {
    if (!placing || !worldRef.current) return
    const rect = worldRef.current.getBoundingClientRect()
    const x = clamp(((e.clientX - rect.left) / rect.width) * 100)
    const y = clamp(((e.clientY - rect.top) / rect.height) * 100)
    if (placing.kind === 'new') dropNode(x, y)
    else placeExisting(placing.node, x, y)
  }
  const onEmptyPointerDown = () => { if (!placing) setSelId(null) }

  const visible = (p) =>
    (mode === 'dm' || (p.node.visibility !== 'dm' && p.visibility !== 'dm' && present(p))) &&
    !hiddenCats.has(p.node.category)

  // ============================================================================= render ==
  if (loading && !world) {
    return <div className="atlas"><div className="loading" style={{ gridRow: '1 / 3' }}>Loading world…</div></div>
  }

  const saveChip = save === 'saving' ? { c: 'sv', t: 'Saving…' }
    : save === 'saved' ? { c: 'ok', t: '✓ Saved' }
    : save === 'err' ? { c: 'bad', t: '⚠ Not saved' } : null

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
        <div className="gsearch" ref={searchRef}>
          <input
            placeholder="Find a node…  ( / )"
            value={q}
            onFocus={openSearch}
            onChange={(e) => { setQ(e.target.value); if (!searchOpen) openSearch() }}
            onKeyDown={(e) => { if (e.key === 'Enter' && matches[0]) { closeSearch(); jump(matches[0].id) } }}
          />
          {searchOpen && q.trim() && (
            <div className="gresults">
              {matches.map((n) => (
                <button key={n.id} onClick={() => { closeSearch(); jump(n.id) }}>
                  <span className="ic" style={{ background: cat(n.category).c }}>{cat(n.category).i}</span>
                  <span className="gtitle">{n.title}</span>
                  {n.visibility === 'dm' && <span className="glock">🔒</span>}
                  {n.hasInterior && <span className="gopen">◎</span>}
                </button>
              ))}
              {matches.length === 0 && <div className="gnone">No nodes named that.</div>}
            </div>
          )}
        </div>
        {saveChip && <span className={`savechip ${saveChip.c}`}>{saveChip.t}</span>}
        <div className="mode" title="DM sees everything; Player previews what the share link shows">
          <button className={mode === 'dm' ? 'on' : ''} onClick={() => switchMode('dm')}>DM</button>
          <button className={mode === 'player' ? 'on' : ''} onClick={() => switchMode('player')}>Player</button>
        </div>
        <div ref={shareRef} className="sharewrap">
          <button className={`sharebtn ${world?.shareToken ? 'live' : ''}`} onClick={() => setSharePop((v) => !v)}>
            🔗 Share
          </button>
          {sharePop && (
            <div className="sharepop">
              {shareUrl ? (
                <>
                  <div className="surl">{shareUrl}</div>
                  <div className="srow">
                    <button className="tool on" onClick={copyShare}>{copied ? 'Copied ✓' : 'Copy link'}</button>
                    <button className="tool" onClick={shareOn} title="Makes a new link; the old one stops working">Regenerate</button>
                    <button className="tool danger" onClick={shareOff}>Turn off</button>
                  </div>
                  <div className="muted">Players see shared nodes only, at the canon moment{tl?.enabled ? ` (${canon} ${tl.unit})` : ''}. Scrubbing your timeline doesn't move them — “Set canon” does.</div>
                </>
              ) : (
                <>
                  <div className="muted">Give your players a read-only link to this world. Secrets and the future stay hidden — the server filters them, not the browser.</div>
                  <button className="tool on" onClick={shareOn}>Create share link</button>
                </>
              )}
            </div>
          )}
        </div>
        <Link to="/dashboard" className="exit">Exit</Link>
      </div>

      <div className="main">
        <div className="rail">
          <h4>Maps</h4>
          <MapTree tree={tree} rootId={world?.rootMapId} mapId={mapId}
            onGo={(id) => navigate(`/w/${worldId}/m/${id}`)} />
        </div>

        <div className="stage">
          {loadState === 'err' && (
            <div className="empty-map">
              <div style={{ fontSize: '2rem' }}>🌫️</div>
              <div>Couldn't load this map.</div>
              <button className="tool on" onClick={() => loadMap(true)}>⟳ Try again</button>
            </div>
          )}
          {loadState === 'loading' && <div className="loading" style={{ position: 'absolute', inset: 0 }}>Opening…</div>}

          {loadState === 'ok' && !isList && (
            <MapPlane
              mapKey={mapId}
              backdropUrl={map?.backdropUrl}
              worldRef={worldRef}
              onWorldClick={onWorldClick}
              onEmptyPointerDown={onEmptyPointerDown}
              controlsOffset={tl?.enabled ? 56 : 0}
              dblZoom={!placing}
            >
              {(data?.placements || []).filter(visible).map((p) => (
                <div key={p.id}
                  className={`pin ${selId === p.id ? 'sel' : ''} ${p.node.hasInterior ? 'open2' : ''} ${tl?.enabled && !present(p) ? 'ghost' : ''} ${p.node.visibility === 'dm' ? 'secret' : ''}`}
                  style={{ left: `${p.x}%`, top: `${p.y}%` }}
                  onPointerDown={(e) => onPinDown(e, p)}
                  onDoubleClick={(e) => { e.stopPropagation(); openInterior(p.node) }}>
                  <span className="ic" style={{ background: cat(p.node.category).c }}>{cat(p.node.category).i}</span>
                  <span className="lbl">{p.node.title}</span>
                  {p.node.visibility === 'dm' && <span className="lock" title="DM only">🔒</span>}
                  {p.node.hasInterior && <span className="open">◎</span>}
                </div>
              ))}
            </MapPlane>
          )}

          {loadState === 'ok' && isList && (
            <div className="listview">
              <div className="listhead muted">An interior list — inventory, notes, what's inside. Same nodes, no map.</div>
              {(data?.placements || []).filter(visible).map((p) => (
                <div key={p.id}
                  className={`lsrow ${selId === p.id ? 'on' : ''} ${tl?.enabled && !present(p) ? 'ghost' : ''}`}
                  onClick={() => setSelId(p.id)}
                  onDoubleClick={() => openInterior(p.node)}>
                  <span className="ic" style={{ background: cat(p.node.category).c }}>{cat(p.node.category).i}</span>
                  <div className="lsbody">
                    <div className="lstitle">{p.node.title}
                      {p.node.visibility === 'dm' && <span className="lock" title="DM only"> 🔒</span>}
                    </div>
                    {p.node.body && <div className="lsdesc">{p.node.body}</div>}
                  </div>
                  {p.node.hasInterior && <span className="open" title="Has an interior">◎</span>}
                </div>
              ))}
              {data && data.placements.length === 0 && (
                <div className="empty-map static">
                  <div style={{ fontSize: '2rem' }}>📜</div>
                  <div>Empty list. <b>＋ Add node</b> puts the first thing in it.</div>
                </div>
              )}
            </div>
          )}

          <div className="toolbar">
            <button className={`tool ${placing?.kind === 'new' ? 'on' : ''}`}
              onClick={() => {
                if (isList) dropNode(50, 50)
                else setPlacing((v) => (v?.kind === 'new' ? null : { kind: 'new' }))
              }}>＋ Add node</button>
            <button className={`tool ${placing?.kind === 'existing' ? 'on' : ''}`}
              title="Put a node that already exists somewhere onto this map too"
              onClick={() => setNodePicker('place')}>⤓ Place existing</button>
            {!isList && <button className="tool" onClick={() => setPicker({ kind: 'backdrop', hasCurrent: !!map?.backdropUrl })}>🖼 Backdrop</button>}
            {!isList && map?.backdropUrl && <button className="tool" onClick={() => setBackdrop(null)}>Remove backdrop</button>}
            {map && (
              <div className="viewtoggle" title="How this space is shown">
                <button className={!isList ? 'on' : ''} onClick={() => setMapView('map')}>🗺</button>
                <button className={isList ? 'on' : ''} onClick={() => setMapView('list')}>☰</button>
              </div>
            )}
            {!tl?.enabled && <button className="tool" onClick={enableTimeline}>🕓 Enable timeline</button>}
          </div>

          {!isList && legend.length > 1 && (
            <div className="legend" style={tl?.enabled ? { bottom: 92 } : undefined}>
              {legend.map(([k, n]) => (
                <button key={k} className={`lchip ${hiddenCats.has(k) ? 'off' : ''}`} onClick={() => toggleCat(k)}
                  title={hiddenCats.has(k) ? `Show ${cat(k).label.toLowerCase()}s` : `Hide ${cat(k).label.toLowerCase()}s`}>
                  <span className="ic" style={{ background: cat(k).c }}>{cat(k).i}</span>
                  {cat(k).label} <em>{n}</em>
                </button>
              ))}
              {hiddenCats.size > 0 && <button className="lchip all" onClick={() => setHiddenCats(new Set())}>Show all</button>}
            </div>
          )}

          {data && !isList && data.placements.length === 0 && !placing && loadState === 'ok' && (
            <div className="empty-map">
              <div style={{ fontSize: '2rem' }}>🗺️</div>
              <div>Empty map. Click <b>+ Add node</b>, then click the map to drop your first node.</div>
              <div className="muted">Tip: use <b>🖼 Backdrop</b> to drop in a map image first.</div>
            </div>
          )}

          <div className="hint" style={tl?.enabled ? { bottom: 64 } : undefined}>
            {placing?.kind === 'new'
              ? 'Click the map to drop a node — Esc cancels.'
              : placing?.kind === 'existing'
                ? `Click the map to place "${placing.node.title}" — Esc cancels.`
                : isList
                  ? 'Click a row to inspect · double-click a ◎ row to open its interior.'
                  : 'Click to inspect · drag to move · scroll to zoom · drag empty space to pan.'}
          </div>

          {tl?.enabled && (
            <div className="timebar">
              <span className="tlabel">{tl.min}</span>
              <div className="ttrack">
                <input type="range" min={tl.min} max={tl.max} value={now} onChange={(e) => setNow(Number(e.target.value))} />
                {canon !== now && tl.max > tl.min && (
                  <span className="canonmark" style={{ left: `${((canon - tl.min) / (tl.max - tl.min)) * 100}%` }}
                    title={`Canon moment (what players see): ${canon}`} />
                )}
              </div>
              <span className="tlabel">{tl.max}</span>
              <span className="tnow">{now}<em> {tl.unit}</em></span>
              {canon !== now ? (
                <>
                  <button className="tool tcanon" title="Make this the moment players see" onClick={setCanonHere}>📍 Set canon</button>
                  <button className="tgear" title={`Back to the canon moment (${canon})`} onClick={() => setNow(canon)}>↩</button>
                </>
              ) : (
                <span className="canonchip" title="You're looking at the canon moment — what players see">canon</span>
              )}
              <button className="tgear" title="Timeline range & unit" onClick={() => setTlEdit((v) => !v)}>⚙</button>
            </div>
          )}
          {tl?.enabled && tlEdit && <TimelineConfig tl={tl} onSave={saveTimeline} onDisable={disableTimeline} onClose={() => setTlEdit(false)} />}
        </div>

        <div className="insp">
          {!sel ? (
            <div className="empty">Nothing selected.<br /><br />Click a node, or use <b>+ Add node</b> then click the map.</div>
          ) : (
            <Inspector key={sel.id} p={sel} onSave={saveNode}
              onCat={(c) => saveNode(sel.node.id, { category: c })}
              onOpen={() => openInterior(sel.node)} onCreate={(v) => createInteriorAs(sel.node, v)}
              onImage={() => setPicker({ kind: 'node', nodeId: sel.node.id, hasCurrent: !!sel.node.imageUrl })}
              onRemoveImage={() => setNodeImage(sel.node.id, null, null)}
              timeline={tl} onLifespan={(s, e) => setLifespan(sel.id, s, e)}
              links={nodeLinks} onLink={() => setNodePicker('link')} onUnlink={removeLink} onJump={jump}
              onVis={(v) => saveNode(sel.node.id, { visibility: v })}
              onRemoveHere={() => removeFromMap(sel)}
              onDelete={() => askDeleteNode(sel.node)} />
          )}
        </div>
      </div>

      {picker && (
        <ImagePicker worldId={worldId} hasCurrent={picker.hasCurrent}
          onPick={handlePick} onClose={() => setPicker(null)} />
      )}
      {nodePicker === 'link' && sel && (
        <NodePicker worldId={worldId} excludeId={sel.node.id} title="Link to…"
          onPick={addLink} onClose={() => setNodePicker(null)} />
      )}
      {nodePicker === 'place' && (
        <NodePicker worldId={worldId} title="Place which node?"
          excludeIds={(data?.placements || []).map((p) => p.node.id)}
          onPickNode={(n) => {
            setNodePicker(null)
            if (isList) placeExisting(n, 50, 50)
            else setPlacing({ kind: 'existing', node: n })
          }}
          onClose={() => setNodePicker(null)} />
      )}
      {confirmDel && (
        <div className="modal-back" onClick={() => setConfirmDel(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h4>Delete “{confirmDel.node.title}”?</h4>
              <button onClick={() => setConfirmDel(null)}>✕</button></div>
            <DeleteImpact impact={confirmDel.impact} />
            <div className="mrow">
              <button className="tool" onClick={() => setConfirmDel(null)}>Keep it</button>
              <button className="tool danger" onClick={doDeleteNode}>Delete everywhere</button>
            </div>
          </div>
        </div>
      )}

      {flash && <div className={`aflash ${flash.kind}`}>{flash.text}</div>}
    </div>
  )
}

function MapTree({ tree, rootId, mapId, onGo }) {
  const childrenOf = (pid) => tree.filter((m) => (m.parentMapId || null) === (pid ?? null) && m.id !== rootId)
  const render = (list, depth) => list.map((m) => (
    <React.Fragment key={m.id}>
      <div className={`trow ${String(m.id) === String(mapId) ? 'on' : ''}`} style={{ paddingLeft: 6 + depth * 14 }}
        onClick={() => onGo(m.id)}>
        <span className="tw">▸</span>{m.title}
      </div>
      {render(childrenOf(m.id), depth + 1)}
    </React.Fragment>
  ))
  return (
    <>
      {rootId && (
        <div className={`trow ${String(rootId) === String(mapId) ? 'on' : ''}`} onClick={() => onGo(rootId)}>
          <span className="tw">▸</span>{tree.find((m) => m.id === rootId)?.title || 'World map'}
        </div>
      )}
      {render(childrenOf(rootId), 1)}
    </>
  )
}

function DeleteImpact({ impact }) {
  if (!impact) return <p className="muted">This removes the node from every map, along with its links.</p>
  const bits = []
  if (impact.placements > 1) bits.push(`It sits on ${impact.placements} maps — it disappears from all of them.`)
  if (impact.interiorMaps > 0) {
    bits.push(`Its interior (${impact.interiorMaps} ${impact.interiorMaps === 1 ? 'map' : 'maps'}) is deleted too.`)
    if (impact.nodesInside > 0) {
      bits.push(`${impact.nodesInside} ${impact.nodesInside === 1 ? 'node' : 'nodes'} inside will be left unplaced — they still exist (findable with search), but lose their spot.`)
    }
  }
  if (bits.length === 0) bits.push('It has no interior and sits only on this map.')
  return (
    <div className="impact">
      {bits.map((b, i) => <p key={i}>{b}</p>)}
      <p className="muted">There is no undo.</p>
    </div>
  )
}

function TimelineConfig({ tl, onSave, onDisable, onClose }) {
  const [min, setMin] = useState(tl.min)
  const [max, setMax] = useState(tl.max)
  const [unit, setUnit] = useState(tl.unit || 'days')
  const bad = !(Number(min) < Number(max))
  return (
    <div className="tlcfg">
      <label>From <input type="number" value={min} onChange={(e) => setMin(e.target.value === '' ? '' : Number(e.target.value))} /></label>
      <label>To <input type="number" value={max} onChange={(e) => setMax(e.target.value === '' ? '' : Number(e.target.value))} /></label>
      <label>Unit <input type="text" value={unit} placeholder="days, years, sessions…" onChange={(e) => setUnit(e.target.value)} /></label>
      <button className="tool on" disabled={bad} title={bad ? 'Start must be before end' : ''}
        onClick={() => onSave(Number(min), Number(max), unit.trim() || 'days')}>Save</button>
      <button className="tool" onClick={onClose}>Cancel</button>
      <button className="tool danger" onClick={onDisable}>Disable timeline</button>
    </div>
  )
}

function Inspector({ p, onSave, onCat, onOpen, onCreate, onImage, onRemoveImage, timeline, onLifespan, links, onLink, onUnlink, onJump, onVis, onRemoveHere, onDelete }) {
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
      <div className="fld"><label>Who can see it</label>
        <div className="chips">
          <button className={`chip ${n.visibility !== 'dm' ? 'on' : ''}`} onClick={() => onVis('shared')}>👁 Everyone</button>
          <button className={`chip ${n.visibility === 'dm' ? 'on' : ''}`} onClick={() => onVis('dm')}>🔒 DM only</button>
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
      <div className="fld"><label>Links — references to other nodes</label>
        <div className="links">
          {(links?.out || []).map((l) => (
            <div key={`o${l.id}`} className="lrow">
              <a className="lgo" onClick={() => onJump(l.otherId)}>→ {l.otherTitle}</a>
              <button className="lx" title="Remove link" onClick={() => onUnlink(l.id)}>✕</button>
            </div>
          ))}
          {(links?.in || []).map((l) => (
            <div key={`i${l.id}`} className="lrow in">
              <a className="lgo" onClick={() => onJump(l.otherId)}>← {l.otherTitle}</a>
              <span className="lref">refers here</span>
            </div>
          ))}
          {(!links?.out?.length && !links?.in?.length) && <div className="muted">No links yet.</div>}
        </div>
        <button className="btn block" onClick={onLink}>＋ Link to another node</button>
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
      <button className="btn block" title="Take it off this map only — the node itself survives" onClick={onRemoveHere}>
        ⤒ Remove from this map
      </button>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
        <button className="btn danger" onClick={onDelete}>🗑 Delete node…</button>
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
      onPick(r.image.id, r.image.url)
    } catch (e) {
      setBusy(false); setErr(e?.response?.data?.message || e?.message || 'Upload failed')
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

// Pick a node from this world (searchable). onPick gets the id; onPickNode the whole node.
function NodePicker({ worldId, excludeId, excludeIds, title = 'Link to…', onPick, onPickNode, onClose }) {
  const [nodes, setNodes] = useState([])
  const [q, setQ] = useState('')
  useEffect(() => { atlasService.getNodes(worldId).then((ns) => setNodes(ns || [])).catch(() => {}) }, [worldId])
  const skip = new Set(excludeIds || [])
  if (excludeId != null) skip.add(excludeId)
  const list = nodes.filter((n) => !skip.has(n.id) && (n.title || '').toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h4>{title}</h4><button onClick={onClose}>✕</button></div>
        <input className="nsearch" autoFocus placeholder="Search nodes…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="nlist">
          {list.map((n) => (
            <button key={n.id} className="nrow" onClick={() => (onPickNode ? onPickNode(n) : onPick(n.id))}>
              <span className="ic" style={{ background: cat(n.category).c }}>{cat(n.category).i}</span>
              <span className="lbl">{n.title}</span>
              {n.hasInterior && <span className="open">◎</span>}
            </button>
          ))}
          {list.length === 0 && <div className="muted">No matching nodes.</div>}
        </div>
      </div>
    </div>
  )
}

export default AtlasWorkspace
