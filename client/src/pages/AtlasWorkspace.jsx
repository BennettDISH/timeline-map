import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import atlasService from '../services/atlasService'
import imageServiceBase64 from '../services/imageServiceBase64'
import MapPlane from '../components/MapPlane'
import EraScrub from '../components/EraScrub'
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
  // Three postures: edit (full tools) · view (DM eyes, reading chrome) · player
  // (faithful preview of the share link: secrets and the future hidden, canon moment,
  // minimal chrome). Old stored 'dm' maps to edit.
  const [mode, setMode] = useState(() => {
    const m = localStorage.getItem('atlas_mode')
    return m === 'player' ? 'player' : m === 'view' ? 'view' : 'edit'
  })
  const [nodeLinks, setNodeLinks] = useState({ out: [], in: [] })
  const [nodePicker, setNodePicker] = useState(null) // 'link' | 'place'
  const [hiddenCats, setHiddenCats] = useState(() => new Set())
  const [q, setQ] = useState('') // global node search
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchIndex, setSearchIndex] = useState([])
  const [confirmDel, setConfirmDel] = useState(null) // { node, impact }
  const [mapMenu, setMapMenu] = useState(false) // the "Map ▾" toolbar menu
  const [help, setHelp] = useState(false) // the "?" gesture guide
  const [renaming, setRenaming] = useState(null) // string while the rename dialog is open
  const [railOpen, setRailOpen] = useState(() => localStorage.getItem('atlas_rail') !== 'closed')
  const [inspW, setInspW] = useState(() => {
    const v = parseInt(localStorage.getItem('atlas_inspw'), 10)
    return Number.isFinite(v) ? Math.min(640, Math.max(280, v)) : 310
  })
  const [ctx, setCtx] = useState(null) // right-click menu: { sx, sy, px, py }
  const [previewT, setPreviewT] = useState(null) // player-posture era scrubbing (null = canon)

  const saveTimer = useRef(null)
  const pendingPatch = useRef({ nodeId: null, patch: {} })
  const inflight = useRef(0)
  const worldRef = useRef(null)
  const dragRef = useRef(null)
  const pendingSelect = useRef(null)
  const shareRef = useRef(null)
  const searchRef = useRef(null)
  const mapMenuRef = useRef(null)
  const helpRef = useRef(null)
  const inspWRef = useRef(310)
  const inspRaf = useRef(0)
  const placePoint = useRef(null) // where "place existing here" should land

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
    setCtx(null)
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
  const switchMode = (m) => {
    setMode(m)
    setPlacing(null); setPicker(null); setNodePicker(null); setTlEdit(false); setMapMenu(false)
    setPreviewT(null)
    try { localStorage.setItem('atlas_mode', m) } catch (e) { /* ignore */ }
  }
  // the player preview prunes threads to DM-only nodes; it needs the visibility index,
  // including when the page loads straight into player mode
  useEffect(() => {
    if (mode === 'player') atlasService.getNodes(worldId).then(setSearchIndex).catch(() => {})
  }, [mode, worldId])
  const toggleRail = () => setRailOpen((v) => {
    const n = !v
    try { localStorage.setItem('atlas_rail', n ? 'open' : 'closed') } catch (e) { /* ignore */ }
    return n
  })

  // drag the inspector's left edge to give the editor room; double-click resets
  const startInspResize = (e) => {
    e.preventDefault()
    inspWRef.current = inspW
    const move = (ev) => {
      inspWRef.current = Math.min(Math.max(window.innerWidth - ev.clientX, 280), Math.min(640, Math.round(window.innerWidth * 0.55)))
      if (!inspRaf.current) {
        inspRaf.current = requestAnimationFrame(() => { inspRaf.current = 0; setInspW(inspWRef.current) })
      }
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      try { localStorage.setItem('atlas_inspw', String(inspWRef.current)) } catch (err) { /* ignore */ }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const resetInspW = () => { setInspW(310); try { localStorage.setItem('atlas_inspw', '310') } catch (e) { /* ignore */ } }

  // edit/view judge presence by the DM's lens; the player preview judges by CANON,
  // exactly like the real share link does.
  const presentAt = (p, t) => (!tl?.enabled ? true : (p.start == null || t >= p.start) && (p.end == null || t <= p.end))
  const present = (p) => presentAt(p, mode === 'player' ? (previewT ?? canon) : now)
  const setCanonHere = () => {
    track(atlasService.patchWorld(worldId, { timeline_current_time: now }), "Couldn't set the canon moment")
      .then(() => {
        setWorld((w) => w && ({ ...w, timeline: { ...w.timeline, current: now } }))
        setFlash({ kind: 'ok', text: `Canon moment set to ${now} ${tl.unit} — that's what players now see.` })
      }).catch(() => {})
  }
  const refreshWorldMeta = () => atlasService.getWorld(worldId).then(setWorld).catch(() => {})
  const eraAdd = () => track(atlasService.addEra(worldId, { name: 'A remembered age', start_time: tl.min, end_time: canon }), "Couldn't add the era")
    .then(refreshWorldMeta).catch(() => {})
  const eraPatch = (id, data) => track(atlasService.patchEra(id, data), "Couldn't save the era").then(refreshWorldMeta).catch(() => {})
  const eraDelete = (id) => track(atlasService.deleteEra(id), "Couldn't delete the era").then(refreshWorldMeta).catch(() => {})

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

  // ---- drag to reposition (math is against the world PLANE rect, which includes zoom).
  // Moves are coalesced through rAF: one React render per frame, not per pointer event.
  const dragRaf = useRef(0)
  const onDragMove = useCallback((e) => {
    const d = dragRef.current; if (!d) return
    d.lastX = clamp(d.ox + ((e.clientX - d.sx) / d.rect.width) * 100)
    d.lastY = clamp(d.oy + ((e.clientY - d.sy) / d.rect.height) * 100)
    if (Math.abs(e.clientX - d.sx) > 3 || Math.abs(e.clientY - d.sy) > 3) d.moved = true
    if (!dragRaf.current) {
      dragRaf.current = requestAnimationFrame(() => {
        dragRaf.current = 0
        const dd = dragRef.current
        if (!dd) return
        setData((prev) => prev && ({ ...prev, placements: prev.placements.map((pp) => (pp.id === dd.id ? { ...pp, x: dd.lastX, y: dd.lastY } : pp)) }))
      })
    }
  }, [])
  const onDragUp = useCallback(() => {
    const d = dragRef.current; dragRef.current = null
    window.removeEventListener('pointermove', onDragMove)
    window.removeEventListener('pointerup', onDragUp)
    if (!d) return
    if (d.moved) {
      // the queued frame no-ops once dragRef is null, so commit the final position here
      setData((prev) => prev && ({ ...prev, placements: prev.placements.map((pp) => (pp.id === d.id ? { ...pp, x: d.lastX, y: d.lastY } : pp)) }))
      track(atlasService.patchPlacement(d.id, { x: d.lastX, y: d.lastY })).catch(() => {})
    } else setSelId(d.id)
  }, [onDragMove, track])
  const onPinDown = (e, p) => {
    if (mode !== 'edit') { e.stopPropagation(); setSelId(p.id); return } // read-only: select, never drag
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
      } else if (e.key === 'Escape') { setPlacing(null); setCtx(null); closeSearch() }
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [])
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return []
    return searchIndex.filter((n) => (n.title || '').toLowerCase().includes(needle)).slice(0, 12)
  }, [q, searchIndex])

  const readerLinks = useMemo(() => {
    const all = [...(nodeLinks.out || []), ...(nodeLinks.in || [])]
    if (mode !== 'player') return all
    const vis = new Map(searchIndex.map((n) => [n.id, n.visibility]))
    return all.filter((l) => vis.get(l.otherId) !== 'dm')
  }, [nodeLinks, mode, searchIndex])

  const renameMap = () => {
    const t = (renaming || '').trim()
    setRenaming(null)
    if (!t || !map || t === map.title) return
    setData((d) => d && ({ ...d, map: { ...d.map, title: t } }))
    track(atlasService.patchMap(mapId, { title: t }), "Couldn't rename").then(() => { refreshTree(); refreshMap() }).catch(() => {})
  }

  useEffect(() => {
    if (!ctx) return
    const close = () => setCtx(null)
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [ctx])

  useEffect(() => {
    if (!mapMenu && !help) return
    const close = (e) => {
      if (mapMenuRef.current?.contains(e.target) || helpRef.current?.contains(e.target)) return
      setMapMenu(false); setHelp(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [mapMenu, help])

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
  const onWorldContext = (e) => {
    if (!worldRef.current) return
    const rect = worldRef.current.getBoundingClientRect()
    setCtx({
      sx: Math.min(e.clientX, window.innerWidth - 230), sy: Math.min(e.clientY, window.innerHeight - 110),
      px: clamp(((e.clientX - rect.left) / rect.width) * 100),
      py: clamp(((e.clientY - rect.top) / rect.height) * 100),
    })
  }

  const visible = (p) =>
    (mode !== 'player' || (p.node.visibility !== 'dm' && p.visibility !== 'dm' && present(p))) &&
    (mode === 'player' || !hiddenCats.has(p.node.category))

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
        {mode !== 'player' && (
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
        )}
        {mode === 'edit' && saveChip && <span className={`savechip ${saveChip.c}`}>{saveChip.t}</span>}
        <div className="mode" title="Edit builds the world · View reads it with DM eyes · Player shows exactly what the share link shows">
          <button className={mode === 'edit' ? 'on' : ''} onClick={() => switchMode('edit')}>✏ Edit</button>
          <button className={mode === 'view' ? 'on' : ''} onClick={() => switchMode('view')}>👁 View</button>
          <button className={mode === 'player' ? 'on' : ''} onClick={() => switchMode('player')}>🎭 Player</button>
        </div>
        {mode === 'edit' && (
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
        )}
        {mode === 'player' && tl?.enabled && (
          <span className="nowchip" title="The canon moment — the present your players see">🕓 {canon} {tl.unit}</span>
        )}
        <Link to="/dashboard" className="exit">Exit</Link>
      </div>

      <div className={`main m-${mode}`}
        style={{ gridTemplateColumns: mode === 'player' ? '1fr' : `${railOpen ? '230px ' : ''}1fr${mode === 'edit' ? ` ${inspW}px` : ''}` }}>
        {mode !== 'player' && railOpen && (
          <div className="rail">
            <h4>Maps</h4>
            <MapTree tree={tree} rootId={world?.rootMapId} mapId={mapId}
              onGo={(id) => navigate(`/w/${worldId}/m/${id}`)} />
          </div>
        )}

        <div className="stage">
          {mode !== 'player' && (
            <button className="tool railtoggle" title={railOpen ? 'Hide the map tree' : 'Show the map tree'}
              onClick={toggleRail}>{railOpen ? '◂' : '☰'}</button>
          )}
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
              onWorldContextMenu={mode === 'edit' ? onWorldContext : undefined}
              controlsOffset={
                mode === 'player'
                  ? (tl?.enabled && (world?.eras || []).some((e) => e.playerVisible && e.start <= canon) ? 56 : 0)
                  : (tl?.enabled ? 56 : 0)
              }
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
              {mode === 'edit' && <div className="listhead muted">An interior list — inventory, notes, what's inside. Same nodes, no map.</div>}
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
                  {mode === 'edit'
                    ? <div>Empty list. <b>＋ Add node</b> puts the first thing in it.</div>
                    : <div>Nothing {mode === 'player' ? 'known ' : ''}here yet.</div>}
                </div>
              )}
            </div>
          )}

          {mode === 'edit' && (
            <div className="toolbar">
              <button className={`tool ${placing?.kind === 'new' ? 'on' : ''}`}
                title="Create a brand-new node on this map"
                onClick={() => {
                  if (isList) dropNode(50, 50)
                  else setPlacing((v) => (v?.kind === 'new' ? null : { kind: 'new' }))
                }}>＋ Add node</button>
              <button className={`tool ${placing?.kind === 'existing' ? 'on' : ''}`}
                title="Put a node that already exists somewhere onto this map too (one node can live in many places)"
                onClick={() => setNodePicker('place')}>⤓ Place existing</button>
              <div className="mapmenu" ref={mapMenuRef}>
                <button className={`tool ${mapMenu ? 'on' : ''}`} title="This space: backdrop art, name, map or list"
                  onClick={() => setMapMenu((v) => !v)}>Map ▾</button>
                {mapMenu && (
                  <div className="apop">
                    {!isList && (
                      <button onClick={() => { setMapMenu(false); setPicker({ kind: 'backdrop', hasCurrent: !!map?.backdropUrl }) }}>
                        🖼 {map?.backdropUrl ? 'Change the backdrop…' : 'Set a backdrop image…'}
                      </button>
                    )}
                    {!isList && map?.backdropUrl && (
                      <button onClick={() => { setMapMenu(false); setBackdrop(null) }}>Remove the backdrop</button>
                    )}
                    <button onClick={() => { setMapMenu(false); setRenaming(map?.title || '') }}>✎ Rename this space…</button>
                    <div className="apop-row">
                      <span>Show as</span>
                      <button className={!isList ? 'on' : ''} onClick={() => setMapView('map')}>🗺 Map</button>
                      <button className={isList ? 'on' : ''} onClick={() => setMapView('list')}>☰ List</button>
                    </div>
                  </div>
                )}
              </div>
              {!tl?.enabled && (
                <button className="tool" title="Give the world a clock: lifespans, a scrubber, a canon moment"
                  onClick={enableTimeline}>🕓 Timeline</button>
              )}
            </div>
          )}

          {mode !== 'player' && !placing && !isList && legend.length > 1 && (
            <div className="legend" style={tl?.enabled ? { bottom: 60 } : undefined}>
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
              {mode === 'edit' ? (
                <>
                  <div>Empty map. Click <b>+ Add node</b>, then click the map to drop your first node.</div>
                  <div className="muted">Tip: the <b>Map ▾</b> menu sets a backdrop image.</div>
                </>
              ) : (
                <div>Nothing {mode === 'player' ? 'known ' : ''}here yet.</div>
              )}
            </div>
          )}

          {mode === 'edit' && placing && (
            <div className="hint" style={tl?.enabled ? { bottom: 64 } : undefined}>
              {placing.kind === 'new'
                ? 'Click the map to drop the new node — Esc cancels.'
                : `Click the map to place "${placing.node.title}" — Esc cancels.`}
            </div>
          )}

          {mode !== 'player' && tl?.enabled && (
            <div className="timebar">
              <span className="tlabel">{tl.min}</span>
              <div className="ttrack">
                <input type="range" min={tl.min} max={tl.max} value={now} onChange={(e) => setNow(Number(e.target.value))} />
                {tl.max > tl.min && (data?.placements || [])
                  .flatMap((p) => [p.start, p.end])
                  .filter((t) => t != null && t >= tl.min && t <= tl.max)
                  .map((t, i) => (
                    <span key={i} className="ttick" style={{ left: `${((t - tl.min) / (tl.max - tl.min)) * 100}%` }} />
                  ))}
                {canon !== now && tl.max > tl.min && (
                  <span className="canonmark" style={{ left: `${((canon - tl.min) / (tl.max - tl.min)) * 100}%` }}
                    title={`Canon moment (what players see): ${canon}`} />
                )}
              </div>
              <span className="tlabel">{tl.max}</span>
              <span className="tnow">{now}<em> {tl.unit}</em></span>
              <div className="tzone">
                {canon !== now ? (
                  <>
                    <button className="tool tcanon" title="Make this the moment players see" onClick={setCanonHere}>📍 Set canon</button>
                    <button className="tgear" title={`Back to the canon moment (${canon})`} onClick={() => setNow(canon)}>↩</button>
                  </>
                ) : (
                  <span className="canonchip" title="You're looking at the canon moment — what players see">canon</span>
                )}
              </div>
              <button className="tgear" title="Timeline range, unit & eras" onClick={() => setTlEdit((v) => !v)}>⚙</button>
            </div>
          )}
          {mode !== 'player' && tl?.enabled && tlEdit && (
            <TimelineConfig tl={tl} eras={world?.eras || []} onSave={saveTimeline} onDisable={disableTimeline}
              onClose={() => setTlEdit(false)} onEraAdd={eraAdd} onEraPatch={eraPatch} onEraDelete={eraDelete} />
          )}
          {mode === 'player' && tl?.enabled && (
            <EraScrub tl={tl} eras={(world?.eras || []).filter((e) => e.playerVisible)}
              value={previewT} onChange={setPreviewT} live />
          )}

          {mode !== 'edit' && sel && visible(sel) && (
            <div className="reader">
              <button className="rclose" title="Close" onClick={() => setSelId(null)}>✕</button>
              {sel.node.imageUrl && <div className="rhero"><img src={sel.node.imageUrl} alt="" /></div>}
              <div className="rinner">
                <div className="rhead">
                  <span className="ic" style={{ background: cat(sel.node.category).c }}>{cat(sel.node.category).i}</span>
                  <h3>{sel.node.title}</h3>
                </div>
                <span className="rcat">{cat(sel.node.category).label}{mode === 'view' && sel.node.visibility === 'dm' ? ' · 🔒 DM only' : ''}</span>
                {tl?.enabled && (sel.start != null || sel.end != null) && (
                  <div className="rwhen">🕓 {sel.start ?? tl.min} – {sel.end ?? '…'} {tl.unit}</div>
                )}
                {sel.node.body && <p className="rbody">{sel.node.body}</p>}
                {sel.node.hasInterior && (
                  <button className="btn primary block rgo" onClick={() => openInterior(sel.node)}>◎ Look inside</button>
                )}
                {readerLinks.length > 0 && (
                  <>
                    <div className="rk">Threads</div>
                    {readerLinks.map((l) => (
                      <a key={`${l.dir}${l.id}`} className="rlink" onClick={() => jump(l.otherId)}>
                        <span className="ic" style={{ background: cat(l.otherCategory).c }}>{cat(l.otherCategory).i}</span>
                        <span className="rlt">{l.otherTitle}{l.label ? ` — ${l.label}` : ''}</span>
                        <span className="rdir">{l.dir === 'out' ? '→' : '←'}</span>
                      </a>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}

          <div className="helpwrap" ref={helpRef}>
            <button className="tool round" title="How to drive the map" onClick={() => setHelp((v) => !v)}>?</button>
            {help && (
              <div className="apop helppop">
                <div><b>Scroll / pinch</b> zoom · <b>drag empty space</b> pan · <b>double-click</b> zoom in</div>
                <div><b>Click a pin</b> to read it{mode === 'edit' ? ' · drag a pin to move it' : ''}</div>
                <div><b>Double-click a ◎ pin</b> to step inside that place</div>
                {mode === 'edit' && <div><b>Right-click the map</b> to add something right there</div>}
                {mode !== 'player' && <div><b>/</b> finds a node · <b>Esc</b> cancels</div>}
                <div><b>Ctrl+Shift+B</b> reports a bug</div>
                <div><b>✏ Edit</b> builds · <b>👁 View</b> reads with DM eyes · <b>🎭 Player</b> shows what the share link shows</div>
              </div>
            )}
          </div>
        </div>

        {mode === 'edit' && (
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
        )}
        {mode === 'edit' && (
          <div className="iresize" style={{ right: inspW - 3 }} title="Drag to widen the editor — double-click resets"
            onPointerDown={startInspResize} onDoubleClick={resetInspW} />
        )}
      </div>

      {picker && (
        <ImagePicker worldId={worldId} hasCurrent={picker.hasCurrent}
          onPick={handlePick} onClose={() => setPicker(null)} />
      )}
      {nodePicker === 'link' && sel && (
        <NodePicker worldId={worldId} excludeId={sel.node.id} title="Link to…"
          onPick={addLink} onClose={() => setNodePicker(null)} />
      )}
      {nodePicker === 'place-here' && (
        <NodePicker worldId={worldId} title="Place which node here?"
          excludeIds={(data?.placements || []).map((p) => p.node.id)}
          onPickNode={(nn) => {
            setNodePicker(null)
            const pt = placePoint.current || { x: 50, y: 50 }
            placeExisting(nn, pt.x, pt.y)
          }}
          onClose={() => setNodePicker(null)} />
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

      {ctx && (
        <div className="apop ctxmenu" style={{ left: ctx.sx, top: ctx.sy }} onPointerDown={(e) => e.stopPropagation()}>
          <button onClick={() => { const c = ctx; setCtx(null); dropNode(c.px, c.py) }}>＋ New node here</button>
          <button onClick={() => { placePoint.current = { x: ctx.px, y: ctx.py }; setCtx(null); setNodePicker('place-here') }}>
            ⤓ Place an existing node here…
          </button>
        </div>
      )}

      {renaming != null && (
        <div className="modal-back" onClick={() => setRenaming(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h4>Rename this space</h4><button onClick={() => setRenaming(null)}>✕</button></div>
            <input className="nsearch" autoFocus value={renaming} onChange={(e) => setRenaming(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') renameMap() }} />
            <div className="mrow">
              <button className="tool" onClick={() => setRenaming(null)}>Cancel</button>
              <button className="tool on" disabled={!renaming.trim()} onClick={renameMap}>Rename</button>
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

function TimelineConfig({ tl, eras, onSave, onDisable, onClose, onEraAdd, onEraPatch, onEraDelete }) {
  const [min, setMin] = useState(tl.min)
  const [max, setMax] = useState(tl.max)
  const [unit, setUnit] = useState(tl.unit || 'days')
  const bad = !(Number(min) < Number(max))
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null)
  return (
    <div className="tlcfg">
      <label>From <input type="number" value={min} onChange={(e) => setMin(e.target.value === '' ? '' : Number(e.target.value))} /></label>
      <label>To <input type="number" value={max} onChange={(e) => setMax(e.target.value === '' ? '' : Number(e.target.value))} /></label>
      <label>Unit <input type="text" value={unit} placeholder="days, years, sessions…" onChange={(e) => setUnit(e.target.value)} /></label>
      <div className="tlrow">
        <button className="tool on" disabled={bad} title={bad ? 'Start must be before end' : ''}
          onClick={() => onSave(Number(min), Number(max), unit.trim() || 'days')}>Save</button>
        <button className="tool" onClick={onClose}>Close</button>
      </div>
      <div className="isect">Eras</div>
      <div className="muted esmall">Name the ages of your world. 🎭 opens that era to players — they can scrub the revealed past, never beyond canon.</div>
      {(eras || []).map((e) => (
        <div key={e.id} className="erarow">
          <input className="ename" defaultValue={e.name} title="Era name"
            onBlur={(ev) => { const v = ev.target.value.trim(); if (v && v !== e.name) onEraPatch(e.id, { name: v }) }} />
          <input className="enum" type="number" defaultValue={e.start} title="From"
            onBlur={(ev) => { const v = num(ev.target.value); if (v != null && v !== e.start) onEraPatch(e.id, { start_time: v }) }} />
          <span className="edash">–</span>
          <input className="enum" type="number" defaultValue={e.end} title="To"
            onBlur={(ev) => { const v = num(ev.target.value); if (v != null && v !== e.end) onEraPatch(e.id, { end_time: v }) }} />
          <button className={`etoggle ${e.playerVisible ? 'on' : ''}`}
            title={e.playerVisible ? 'Players can scrub this era — click to hide' : 'Hidden from players — click to reveal'}
            onClick={() => onEraPatch(e.id, { player_visible: !e.playerVisible })}>🎭</button>
          <button className="ex" title="Delete this era" onClick={() => onEraDelete(e.id)}>✕</button>
        </div>
      ))}
      <button className="tool" onClick={onEraAdd}>＋ Add an era</button>
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
      <div className="catrow">
        {Object.entries(CATS).map(([k, v]) => (
          <button key={k} className={`cdot ${n.category === k ? 'on' : ''}`} title={v.label}
            style={{ background: v.c }} onClick={() => onCat(k)}>{v.i}</button>
        ))}
        <span className="catname">{cat(n.category).label}</span>
      </div>
      <div className="primrow">
        {n.hasInterior
          ? <button className="btn primary grow" onClick={onOpen}>◎ Open interior ▸</button>
          : (
            <>
              <button className="btn grow" title="Give it a map inside — a place to zoom into" onClick={() => onCreate('map')}>＋ Interior map</button>
              <button className="btn grow" title="Give it a list inside — inventory, notes" onClick={() => onCreate('list')}>＋ List</button>
            </>
          )}
        <div className="visseg" title="Who can see this node">
          <button className={n.visibility !== 'dm' ? 'on' : ''} title="Everyone can see it" onClick={() => onVis('shared')}>👁</button>
          <button className={n.visibility === 'dm' ? 'on' : ''} title="DM only — hidden from players" onClick={() => onVis('dm')}>🔒</button>
        </div>
      </div>
      <div className="isect">Story</div>
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
        <>
        <div className="isect">Time</div>
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
        </>
      )}
      <div className="isect">Connections</div>
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
      <div className="isect">On this map</div>
      <div className="onmaprow">
        <button className="btn" title="Take it off this map only — the node itself survives" onClick={onRemoveHere}>⤒ Remove from map</button>
        <button className="btn danger" onClick={onDelete}>🗑 Delete…</button>
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
