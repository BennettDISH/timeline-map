import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import atlasService from '../services/atlasService'
import worldService from '../services/worldService'
import imageServiceBase64 from '../services/imageServiceBase64'
import MapPlane from '../components/MapPlane'
import EraScrub from '../components/EraScrub'
import forgeService from '../services/forgeService'
import { CATS, cat } from '../utils/categories'
import '../styles/atlas.scss'

const clamp = (v) => Math.max(0, Math.min(100, v))
const errText = (e, fallback) => e?.response?.data?.message || e?.message || fallback
const trunc = (t) => (t && t.length > 18 ? `${t.slice(0, 17)}…` : t)

function AtlasWorkspace() {
  const { worldId, mapId } = useParams()
  const navigate = useNavigate()

  const [world, setWorld] = useState(null)
  const [worldList, setWorldList] = useState(null) // null until the switcher is first opened
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
  const [nodeLinks, setNodeLinks] = useState({ out: [], in: [], facts: [] })
  const [nodePicker, setNodePicker] = useState(null) // 'link' | 'place'
  const [hiddenCats, setHiddenCats] = useState(() => new Set())
  const [q, setQ] = useState('') // global node search
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchIndex, setSearchIndex] = useState([])
  const [sfilter, setSfilter] = useState('all') // 'all' | 'unplaced' — the search dropdown's chip filter
  const [confirmDel, setConfirmDel] = useState(null) // { node, impact }
  const [confirmInterior, setConfirmInterior] = useState(null) // { node, impact }
  const [mapMenu, setMapMenu] = useState(false) // the "Map ▾" toolbar menu
  const [help, setHelp] = useState(false) // the "?" gesture guide
  const [renaming, setRenaming] = useState(null) // string while the rename dialog is open
  const [gridOn, setGridOn] = useState(() => localStorage.getItem('atlas_grid') === 'on')
  const [labelsOn, setLabelsOn] = useState(() => localStorage.getItem('atlas_labels') === 'on')
  const [bdsOpen, setBdsOpen] = useState(false) // "backdrops over time" manager
  const [focusEdit, setFocusEdit] = useState(null) // { start, end } strings while editing
  const [focusExpand, setFocusExpand] = useState(false) // temporarily show the full timeline
  const [yearEdit, setYearEdit] = useState(null) // string while typing an exact year
  const [railOpen, setRailOpen] = useState(() => localStorage.getItem('atlas_rail') !== 'closed')
  const [inspOpen, setInspOpen] = useState(() => localStorage.getItem('atlas_insp') !== 'closed')
  // The Forge: this world's AI mind. forgeOn = the server has it switched on at all
  // (GEMINI_API_KEY set); without it the button never renders. Edit-posture chrome only.
  const [forgeOn, setForgeOn] = useState(false)
  const [forgeOpen, setForgeOpen] = useState(() => localStorage.getItem('atlas_forge') === 'open')
  const [railW, setRailW] = useState(() => {
    const v = parseInt(localStorage.getItem('atlas_railw'), 10)
    return Number.isFinite(v) ? Math.min(420, Math.max(160, v)) : 230
  })
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
  const railWRef = useRef(230)
  const railRaf = useRef(0)
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
    const t = setTimeout(() => setFlash(null), flash.undoId ? 9000 : 4000)
    return () => clearTimeout(t)
  }, [flash])

  const doUndo = async (undoId) => {
    setFlash(null)
    const r = await track(atlasService.undo(undoId), "Couldn't undo").catch(() => null)
    if (!r) return
    refreshMap(); refreshTree()
    setFlash({ kind: 'ok', text: 'Put back the way it was.' })
  }

  // ---- loading the world + map --------------------------------------------------
  const refreshTree = () => atlasService.getMaps(worldId).then(setTree).catch(() => {})
  const loadMap = useCallback((blank) => {
    if (!mapId) return Promise.resolve()
    if (blank) { setData(null); setLoadState('loading') }
    return atlasService.getMap(mapId)
      .then((d) => {
        setData(d)
        setLoadState('ok')
        worldService.setLastLocation(worldId, mapId) // "/" resumes here next visit
      })
      .catch((e) => {
        if (blank) setLoadState('err')
        else setFlash({ kind: 'err', text: errText(e, "Couldn't refresh the map") })
      })
  }, [worldId, mapId])
  const refreshMap = () => loadMap(false) // background refresh: keeps the canvas up while fetching

  useEffect(() => { forgeService.status().then(setForgeOn) }, [])
  const toggleForge = () => setForgeOpen((v) => {
    const nv = !v
    try { localStorage.setItem('atlas_forge', nv ? 'open' : 'closed') } catch (err) { /* ignore */ }
    return nv
  })
  // After the Forge lands a batch, the world (eras), the tree (new interiors), and the
  // canvas may all have changed — refresh all three in the background.
  // The DM's lantern: point players toward one node — the share API draws the golden
  // trail (pruned at the first hidden step); here we just flip the pointer.
  const toggleSpotlight = (node) => {
    const on = world?.spotlightNodeId === node.id
    const call = on ? atlasService.clearSpotlight(worldId) : atlasService.setSpotlight(worldId, node.id)
    call.then(() => {
      setWorld((w) => ({ ...w, spotlightNodeId: on ? null : node.id }))
      if (on) setFlash({ kind: 'info', text: 'The trail is out.' })
      else if (node.visibility === 'dm') setFlash({ kind: 'info', text: `Players see the trail toward “${node.title}” — but it stops early while this node is hidden.` })
      else setFlash({ kind: 'ok', text: `Players now see the golden trail to “${node.title}”.` })
    }).catch((e) => setFlash({ kind: 'err', text: errText(e, "Couldn't light the trail") }))
  }

  const forgeRefresh = useCallback(() => {
    atlasService.getWorld(worldId).then(setWorld).catch(() => {})
    atlasService.getMaps(worldId).then(setTree).catch(() => {})
    loadMap(false)
  }, [worldId, loadMap])

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
    setFocusExpand(false)
    loadMap(true).then(() => {
      if (pendingSelect.current) { setSelId(pendingSelect.current); pendingSelect.current = null }
    })
  }, [mapId]) // eslint-disable-line

  const sel = data?.placements.find((p) => p.id === selId) || null
  const map = data?.map
  const isList = map?.view === 'list'

  // ---- links ---------------------------------------------------------------------
  const reloadLinks = (nodeId) =>
    atlasService.getNode(nodeId).then((d) => setNodeLinks({ out: d.links, in: d.backlinks, facts: d.facts || [] })).catch(() => {})
  useEffect(() => {
    if (!sel) { setNodeLinks({ out: [], in: [], facts: [] }); return }
    let live = true
    atlasService.getNode(sel.node.id).then((d) => { if (live) setNodeLinks({ out: d.links, in: d.backlinks, facts: d.facts || [] }) }).catch(() => {})
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
  const labelLink = async (id, label) => {
    await track(atlasService.patchLink(id, { label }), "Couldn't save the label").catch(() => {})
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

  const factAdd = (nodeId) =>
    track(atlasService.addFact(nodeId, { body: '', start_time: Math.round(now), end_time: null }), "Couldn't add the entry")
      .then(() => reloadLinks(nodeId)).catch(() => {})
  const factPatch = (nodeId, id, data) =>
    track(atlasService.patchFact(id, data), "Couldn't save the entry").then(() => reloadLinks(nodeId)).catch(() => {})
  const factDelete = (nodeId, id) =>
    track(atlasService.deleteFact(id), "Couldn't remove the entry").then(() => reloadLinks(nodeId)).catch(() => {})

  const askRemoveInterior = async (node) => {
    const impact = await atlasService.nodeImpact(node.id).catch(() => null)
    setConfirmInterior({ node, impact })
  }
  const doRemoveInterior = async () => {
    const node = confirmInterior.node
    setConfirmInterior(null)
    const r = await track(atlasService.deleteInterior(node.id), "Couldn't remove the interior").catch(() => null)
    if (!r) return
    localPatchNode(node.id, { hasInterior: false, interiorMapId: null })
    refreshTree()
    setFlash({ kind: 'ok', text: `"${node.title}" no longer has an interior — the node itself is untouched.`, undoId: r.undoId })
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
    setFlash({ kind: 'ok', text: `"${node.title}" is gone.`, undoId: r.undoId })
  }
  const removeFromMap = async (p) => {
    const r = await track(atlasService.deletePlacement(p.id), "Couldn't remove it").catch(() => null)
    if (!r) return
    setSelId(null); refreshMap()
    setFlash({ kind: 'ok', text: `"${p.node.title}" removed from this map — the node itself still exists.`, undoId: r.undoId })
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
    else if (pk.kind === 'backdrop-timed') { if (imageId) addTimedBackdrop(imageId) }
    else if (pk.nodeId) setNodeImage(pk.nodeId, imageId, imageUrl)
  }

  const toggleLabels = () => setLabelsOn((v) => {
    const nv = !v
    try { localStorage.setItem('atlas_labels', nv ? 'on' : 'off') } catch (err) { /* ignore */ }
    return nv
  })
  const toggleGrid = () => setGridOn((v) => {
    const n = !v
    try { localStorage.setItem('atlas_grid', n ? 'on' : 'off') } catch (e) { /* ignore */ }
    return n
  })

  // Timed backdrops: history can redraw the map. The active art at moment t is the timed
  // row covering t with the LATEST start (ties: newest row); none covering t = the base.
  const addTimedBackdrop = (imageId) =>
    track(atlasService.addBackdrop(mapId, { image_id: imageId, start_time: Math.round(now), end_time: null }),
      "Couldn't add the backdrop").then(refreshMap).catch(() => {})
  const patchBackdrop = (id, data) =>
    track(atlasService.patchBackdrop(id, data), "Couldn't save the backdrop").then(refreshMap).catch(() => {})
  const deleteBackdrop = (id) =>
    track(atlasService.deleteBackdrop(id), "Couldn't remove the backdrop").then(refreshMap).catch(() => {})

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
  const toggleInsp = () => setInspOpen((v) => {
    const n = !v
    try { localStorage.setItem('atlas_insp', n ? 'open' : 'closed') } catch (e) { /* ignore */ }
    return n
  })

  // drag the tree's right edge, twin of the editor handle
  const startRailResize = (e) => {
    e.preventDefault()
    railWRef.current = railW
    const move = (ev) => {
      railWRef.current = Math.min(Math.max(ev.clientX, 160), Math.min(420, Math.round(window.innerWidth * 0.4)))
      if (!railRaf.current) {
        railRaf.current = requestAnimationFrame(() => { railRaf.current = 0; setRailW(railWRef.current) })
      }
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      try { localStorage.setItem('atlas_railw', String(railWRef.current)) } catch (err) { /* ignore */ }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const resetRailW = () => { setRailW(230); try { localStorage.setItem('atlas_railw', '230') } catch (e) { /* ignore */ } }

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
  const closeSearch = () => { setSearchOpen(false); setQ(''); setSfilter('all') }
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
  const unplacedCount = useMemo(() => searchIndex.filter((n) => n.placed === false).length, [searchIndex])
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const pool = sfilter === 'unplaced' ? searchIndex.filter((n) => n.placed === false) : searchIndex
    // The Unplaced chip is a roster, not a search: it lists every stranded node even with no query.
    if (!needle) return sfilter === 'unplaced' ? pool : []
    return pool.filter((n) => (n.title || '').toLowerCase().includes(needle)).slice(0, 12)
  }, [q, searchIndex, sfilter])

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
  const hasFocus = !!map && (map.focusStart != null || map.focusEnd != null)
  const fMin = hasFocus ? Math.max(tl?.min ?? 0, map.focusStart ?? (tl?.min ?? 0)) : (tl?.min ?? 0)
  const fMax = hasFocus ? Math.min(tl?.max ?? 0, map.focusEnd ?? (tl?.max ?? 0)) : (tl?.max ?? 0)
  const focusOk = hasFocus && fMin < fMax
  const dispMin = focusOk && !focusExpand ? fMin : (tl?.min ?? 0)
  const dispMax = focusOk && !focusExpand ? fMax : (tl?.max ?? 0)

  const saveFocus = () => {
    const f = focusEdit
    setFocusEdit(null)
    if (!f || !map) return
    const st = f.start === '' ? null : Number(f.start)
    const en = f.end === '' ? null : Number(f.end)
    setData((d) => d && ({ ...d, map: { ...d.map, focusStart: st, focusEnd: en } }))
    track(atlasService.patchMap(mapId, { focus_start: st, focus_end: en }), "Couldn't save the focus period").catch(() => {})
  }

  const commitYear = () => {
    const v = Number(yearEdit)
    setYearEdit(null)
    if (!Number.isFinite(v) || !tl) return
    const t = Math.min(Math.max(Math.round(v), tl.min), tl.max)
    setNow(t)
    if (focusOk && !focusExpand && (t < fMin || t > fMax)) setFocusExpand(true) // typed outside the window: widen so the thumb shows
  }

  // ▶ sweeps the lens through [dispMin, dispMax]; any manual time change, mode switch,
  // or map navigation kills it. The position advances in a local var, not the state —
  // reading `now` back mid-sweep would race the batched updates.
  const bdMoment = mode === 'player' ? (previewT ?? canon) : now
  const activeBackdropUrl = useMemo(() => {
    if (!map) return null
    if (!tl?.enabled) return map.backdropUrl
    const rows = (data?.backdrops || []).filter((b) =>
      (b.start == null || b.start <= bdMoment) && (b.end == null || b.end >= bdMoment))
    if (!rows.length) return map.backdropUrl
    rows.sort((a, b) => ((b.start ?? -Infinity) - (a.start ?? -Infinity)) || (b.id - a.id))
    return rows[0].url
  }, [data, map, bdMoment, tl?.enabled])

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

  const readerOpen = mode !== 'edit' && !!sel &&
    (mode !== 'player' || (sel.node.visibility !== 'dm' && sel.visibility !== 'dm'))
  const resolveFact = (facts, t) => {
    const rows = (facts || []).filter((f) => (f.start == null || f.start <= t) && (f.end == null || f.end >= t))
    if (!rows.length) return null
    rows.sort((a, b) => ((b.start ?? -Infinity) - (a.start ?? -Infinity)) || (b.id - a.id))
    return rows[0].body
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
    <div className={`atlas${labelsOn ? ' labelson' : ''}`}>
      <div className="top">
        {mode === 'player'
          ? <span className="brand">🧭 {world?.name}</span>
          : <span className="brand">🧭{' '}
              <select
                className="brandsel"
                value={String(worldId)}
                title="Switch world"
                onFocus={() => {
                  if (worldList) return
                  worldService.getWorlds().then((r) => setWorldList(r.worlds || [])).catch(() => {})
                }}
                onChange={(e) => {
                  const id = e.target.value
                  if (id === String(worldId)) return
                  const w = (worldList || []).find((x) => String(x.id) === id)
                  if (w) worldService.setCurrentWorld(w)
                  else worldService.setCurrentWorldId(id)
                  navigate(`/w/${id}`)
                }}
              >
                {(worldList || [{ id: worldId, name: world?.name || '…' }]).map((w) => (
                  <option key={w.id} value={String(w.id)}>{w.name}</option>
                ))}
              </select>
            </span>}
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
          {searchOpen && (
            <div className="gresults">
              <div className="gfilter">
                <button className={sfilter === 'all' ? 'on' : ''} onClick={() => setSfilter('all')}>All</button>
                <button className={sfilter === 'unplaced' ? 'on' : ''} onClick={() => setSfilter('unplaced')}>○ Unplaced ({unplacedCount})</button>
              </div>
              {(q.trim() || sfilter === 'unplaced') && (
                <>
                  {matches.map((n) => (
                    <button key={n.id} onClick={() => { closeSearch(); jump(n.id) }}>
                      <span className="ic" style={{ background: cat(n.category).c }}>{cat(n.category).i}</span>
                      <span className="gtitle">{n.title}</span>
                      {n.placed === false && <span className="gorphan">○ unplaced</span>}
                      {n.visibility === 'dm' && <span className="glock">🔒</span>}
                      {n.hasInterior && <span className="gopen">◎</span>}
                    </button>
                  ))}
                  {matches.length === 0 && (
                    <div className="gnone">{sfilter === 'unplaced' && !q.trim() ? 'No unplaced nodes — everything has a home.' : 'No nodes named that.'}</div>
                  )}
                </>
              )}
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
        <div ref={shareRef} className="invitewrap">
          <button className={`invitebtn ${world?.shareToken ? 'live' : ''}`} onClick={() => setSharePop((v) => !v)}>
            🔗 Share
          </button>
          {sharePop && (
            <div className="invitepop">
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
        {mode === 'edit' && forgeOn && (
          <button className={`forgebtn ${forgeOpen ? 'on' : ''}`} onClick={toggleForge}
            title="This world's mind — ask it to build places, people, interiors, and art">✦ Forge</button>
        )}
        {mode === 'edit' && (
          <Link to={`/worlds/${worldId}/images`} className="exit" title="This world's images — everything painted or uploaded">🗃 Archive</Link>
        )}
        {mode === 'player' && tl?.enabled && (
          <span className="nowchip" title="The canon moment — the present your players see">🕓 {canon} {tl.unit}</span>
        )}
        <Link to="/dashboard" className="exit">Exit</Link>
      </div>

      <div className={`main m-${mode}`}
        style={{ gridTemplateColumns:
          mode === 'player' ? `1fr${readerOpen ? ' var(--readerw)' : ''}`
            : mode === 'view' ? `${railOpen ? `${railW}px ` : ''}1fr${readerOpen ? ' var(--readerw)' : ''}`
              : `${railOpen ? `${railW}px ` : ''}1fr${inspOpen ? ` ${inspW}px` : ''}${forgeOn && forgeOpen ? ' 340px' : ''}` }}>
        {mode !== 'player' && railOpen && (
          <div className="rail">
            <h4>Maps</h4>
            <MapTree tree={tree} rootId={world?.rootMapId} mapId={mapId}
              onGo={(id) => navigate(`/w/${worldId}/m/${id}`)} />
          </div>
        )}

        <div className="stagecol">
        <div className="stage">
          {mode !== 'player' && (
            <button className="tool railtoggle" title={railOpen ? 'Hide the map tree' : 'Show the map tree'}
              onClick={toggleRail}>{railOpen ? '◂' : '☰'}</button>
          )}
          {mode === 'edit' && (
            <button className="tool insptoggle" title={inspOpen ? 'Hide the editor' : 'Show the editor'}
              onClick={toggleInsp}>{inspOpen ? '▸' : '✎'}</button>
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
              backdropUrl={activeBackdropUrl}
              worldRef={worldRef}
              onWorldClick={onWorldClick}
              onEmptyPointerDown={onEmptyPointerDown}
              onWorldContextMenu={mode === 'edit' ? onWorldContext : undefined}
              dblZoom={!placing}
              grid={gridOn}
            >
              {(data?.placements || []).filter(visible).map((p) => (
                <div key={p.id}
                  className={`pin ${p.node.pin === 'image' && p.node.imageUrl ? 'ipin' : ''} ${p.node.visibility === 'player' ? 'pmark' : ''} ${selId === p.id ? 'sel' : ''} ${p.node.hasInterior ? 'open2' : ''} ${tl?.enabled && !present(p) ? 'ghost' : ''} ${p.node.visibility === 'dm' ? 'secret' : ''} ${world?.spotlightNodeId === p.node.id ? 'spot' : ''}`}
                  style={{ left: `${p.x}%`, top: `${p.y}%` }}
                  onPointerDown={(e) => onPinDown(e, p)}
                  onDoubleClick={(e) => { e.stopPropagation(); openInterior(p.node) }}>
                  {p.node.pin === 'image' && p.node.imageUrl ? (
                    <>
                      <img className="iart" src={p.node.imageUrl} alt="" draggable={false}
                        style={{ maxWidth: p.node.pinSize || 64, maxHeight: p.node.pinSize || 64 }} />
                      <span className="ilbl">{p.node.title}</span>
                    </>
                  ) : (
                    <>
                      <span className="ic" style={{ background: cat(p.node.category).c }}>{cat(p.node.category).i}</span>
                      <span className="lbl">{p.node.title}</span>
                    </>
                  )}
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
                    {!isList && tl?.enabled && (
                      <button title="Different map art for different periods — the asteroid falls, the chart changes"
                        onClick={() => { setMapMenu(false); setBdsOpen(true) }}>🕓 Backdrops over time…</button>
                    )}
                    {!isList && (
                      <button onClick={() => { setMapMenu(false); toggleGrid() }}>▦ Grid {gridOn ? '✓' : ''}</button>
                    )}
                    {!isList && (
                      <button title="Keep every pin's name out instead of showing it on hover"
                        onClick={() => { setMapMenu(false); toggleLabels() }}>🏷 Always show names {labelsOn ? '✓' : ''}</button>
                    )}
                    {tl?.enabled && (
                      <button title="The stretch of history this place's story spans — the scrubber zooms to it here"
                        onClick={() => { setMapMenu(false); setFocusEdit({ start: map?.focusStart ?? '', end: map?.focusEnd ?? '' }) }}>
                        🎯 Focus period…{hasFocus ? ' ✓' : ''}
                      </button>
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
            <div className="legend">
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

          {data && !isList && data.placements.length === 0 && !placing && loadState === 'ok' && !activeBackdropUrl && (
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
            <div className="hint">
              {placing.kind === 'new'
                ? 'Click the map to drop the new node — Esc cancels.'
                : `Click the map to place "${placing.node.title}" — Esc cancels.`}
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

          {mode !== 'player' && tl?.enabled && (
            <div className="timebar">
              <span className="tlabel">{dispMin}</span>
              <div className="ttrack">
                {dispMax > dispMin && (world?.eras || [])
                  .map((er) => ({ ...er, s: Math.max(er.start, dispMin), e: Math.min(er.end, dispMax) }))
                  .filter((er) => er.s < er.e)
                  .map((er) => (
                    <span key={er.id} className={`teraband${er.playerVisible ? ' pv' : ''}`}
                      style={{
                        left: `${((er.s - dispMin) / (dispMax - dispMin)) * 100}%`,
                        width: `${((er.e - er.s) / (dispMax - dispMin)) * 100}%`,
                      }}><em>{er.name}</em></span>
                  ))}
                <input type="range" min={dispMin} max={dispMax}
                  value={Math.min(Math.max(now, dispMin), dispMax)}
                  onChange={(e) => setNow(Number(e.target.value))} />
                {dispMax > dispMin && (data?.placements || [])
                  .flatMap((p) => [p.start, p.end])
                  .filter((t) => t != null && t >= dispMin && t <= dispMax)
                  .map((t, i) => (
                    <span key={i} className="ttick" style={{ left: `${((t - dispMin) / (dispMax - dispMin)) * 100}%` }} />
                  ))}
                {canon !== now && canon >= dispMin && canon <= dispMax && dispMax > dispMin && (
                  <span className="canonmark" style={{ left: `${((canon - dispMin) / (dispMax - dispMin)) * 100}%` }}
                    title={`Canon moment (what players see): ${canon}`} />
                )}
              </div>
              <span className="tlabel">{dispMax}</span>
              {focusOk && (
                <button className="tgear fexp" title={focusExpand ? `Back to this place's period (${fMin}–${fMax})` : 'Show the whole timeline'}
                  onClick={() => setFocusExpand((v) => !v)}>{focusExpand ? '⤡' : '⤢'}</button>
              )}
              {yearEdit != null ? (
                <input className="tnowedit" autoFocus type="number" value={yearEdit}
                  onChange={(e) => setYearEdit(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitYear(); else if (e.key === 'Escape') setYearEdit(null) }}
                  onBlur={commitYear} />
              ) : (
                <button className="tnow tnowbtn" title="Click to type an exact year"
                  onClick={() => setYearEdit(String(now))}>{now}<em> {tl.unit}</em></button>
              )}
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
              value={previewT} onChange={setPreviewT} live
              win={hasFocus ? { min: map?.focusStart, max: map?.focusEnd } : null} />
          )}
        </div>

          {readerOpen && !present(sel) && (
            <div className="reader">
              <button className="rclose" title="Close" onClick={() => setSelId(null)}>✕</button>
              <div className="rinner rghost">
                <div className="rhead">
                  <span className="ic" style={{ background: cat(sel.node.category).c }}>{cat(sel.node.category).i}</span>
                  <h3>{sel.node.title}</h3>
                </div>
                <p className="rnote">Nothing is known of this at {bdMoment} {tl?.unit}.</p>
                {mode === 'view' && (sel.start != null || sel.end != null) && (
                  <p className="rwhen">🕓 Its story runs {sel.start ?? tl?.min} – {sel.end ?? '…'} {tl?.unit}.</p>
                )}
              </div>
            </div>
          )}
          {readerOpen && present(sel) && (
            <div className="reader">
              <button className="rclose" title="Close" onClick={() => setSelId(null)}>✕</button>
              {sel.node.imageUrl && <div className="rhero"><img src={sel.node.imageUrl} alt="" /></div>}
              <div className="rinner">
                <div className="rhead">
                  <span className="ic" style={{ background: cat(sel.node.category).c }}>{cat(sel.node.category).i}</span>
                  <h3>{sel.node.title}</h3>
                </div>
                <span className="rcat">{cat(sel.node.category).label}{mode === 'view' && sel.node.visibility === 'dm' ? ' · 🔒 DM only' : ''}</span>
                {sel.node.visibility === 'player' && <div className="sby">✍ a player's marker{sel.node.author ? `, signed “${sel.node.author}”` : ''}</div>}
                {tl?.enabled && (sel.start != null || sel.end != null) && (
                  <div className="rwhen">🕓 {sel.start ?? tl.min} – {sel.end ?? '…'} {tl.unit}</div>
                )}
                {(() => {
                  const story = tl?.enabled ? (resolveFact(nodeLinks.facts, bdMoment) ?? sel.node.body) : sel.node.body
                  return story ? <p className="rbody">{story}</p> : null
                })()}
                {mode !== 'player' && sel.node.dmNote && (
                  <div className="dmnote"><div className="dmnl">🔒 DM notes</div>{sel.node.dmNote}</div>
                )}
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

        {mode === 'edit' && inspOpen && (
        <div className="insp">
          {!sel ? (
            <div className="spacepanel">
              <div className="isect">This space</div>
              <h3 className="sptitle">{map?.title}
                <button className="lx" title="Rename this space" onClick={() => setRenaming(map?.title || '')}>✎</button>
              </h3>
              {(data?.breadcrumb?.length || 0) > 1 && (
                <div className="muted spup">Inside “{data.breadcrumb[data.breadcrumb.length - 2].title}”</div>
              )}
              {!isList && (
                <>
                  <div className="isect">Backdrop</div>
                  {activeBackdropUrl
                    ? <img className="spbd" src={activeBackdropUrl} alt="" />
                    : <div className="muted spnone">No art yet — this space is a blank plane.</div>}
                  <button className="btn block" onClick={() => setPicker({ kind: 'backdrop', hasCurrent: !!map?.backdropUrl })}>
                    🖼 {map?.backdropUrl ? 'Change the backdrop…' : 'Set a backdrop image…'}
                  </button>
                  {tl?.enabled && (
                    <button className="btn block" title="Different map art for different periods"
                      onClick={() => setBdsOpen(true)}>🕓 Backdrops over time…</button>
                  )}
                </>
              )}
              {tl?.enabled && (
                <button className="btn block" title="The stretch of history this place's story spans"
                  onClick={() => setFocusEdit({ start: map?.focusStart ?? '', end: map?.focusEnd ?? '' })}>
                  🎯 Focus period…{hasFocus ? ' ✓' : ''}
                </button>
              )}
              <hr />
              <div className="empty sphint">Click a node to edit it — or use <b>+ Add node</b>, then click the map.</div>
            </div>
          ) : (
            <Inspector key={sel.id} p={sel} onSave={saveNode}
              onCat={(c) => saveNode(sel.node.id, { category: c })}
              onOpen={() => openInterior(sel.node)} onCreate={(v) => createInteriorAs(sel.node, v)}
              onRemoveInterior={() => askRemoveInterior(sel.node)}
              onImage={() => setPicker({ kind: 'node', nodeId: sel.node.id, hasCurrent: !!sel.node.imageUrl })}
              onRemoveImage={() => setNodeImage(sel.node.id, null, null)}
              timeline={tl} onLifespan={(s, e) => setLifespan(sel.id, s, e)}
              facts={nodeLinks.facts} nowT={Math.round(now)}
              onFactAdd={() => factAdd(sel.node.id)}
              onFactPatch={(id, d) => factPatch(sel.node.id, id, d)}
              onFactDelete={(id) => factDelete(sel.node.id, id)}
              links={nodeLinks} onLink={() => setNodePicker('link')} onUnlink={removeLink} onLabel={labelLink} onJump={jump}
              onVis={(v) => saveNode(sel.node.id, { visibility: v })}
              spotlit={world?.spotlightNodeId === sel.node.id}
              onSpotlight={() => toggleSpotlight(sel.node)}
              onRemoveHere={() => removeFromMap(sel)}
              onDelete={() => askDeleteNode(sel.node)} />
          )}
        </div>
        )}
        {mode === 'edit' && inspOpen && (
          <div className="iresize" style={{ right: inspW - 3 }} title="Drag to widen the editor — double-click resets"
            onPointerDown={startInspResize} onDoubleClick={resetInspW} />
        )}
        {mode !== 'player' && railOpen && (
          <div className="rresize" style={{ left: railW - 3 }} title="Drag to widen the map tree — double-click resets"
            onPointerDown={startRailResize} onDoubleClick={resetRailW} />
        )}
        {mode === 'edit' && forgeOn && forgeOpen && (
          <ForgePanel worldId={worldId} map={map} sel={sel}
            onFlash={setFlash} onRefresh={forgeRefresh} onClose={toggleForge} />
        )}
      </div>

      {picker && (
        <ImagePicker worldId={worldId} hasCurrent={picker.hasCurrent}
          onPick={handlePick} onClose={() => setPicker(null)}
          generate={forgeOn ? (picker.kind === 'node'
            ? { label: `Paint art for “${trunc(sel?.node?.title || 'this node')}”`, run: (g) => forgeService.nodeArt(picker.nodeId, g) }
            : { label: 'Paint this map a backdrop', run: (g) => forgeService.mapBackdrop(map.id, g) }) : null}
          onGenerated={() => { setPicker(null); setFlash({ kind: 'ok', text: 'Painted and attached' }); forgeRefresh() }} />
      )}
      {nodePicker === 'link' && sel && (
        <NodePicker worldId={worldId} excludeId={sel.node.id} title="Link to…"
          onPick={addLink} onClose={() => setNodePicker(null)} />
      )}
      {nodePicker === 'place-here' && (
        <NodePicker worldId={worldId} title="Place which node here?" unplacedFirst
          excludeIds={(data?.placements || []).map((p) => p.node.id)}
          onPickNode={(nn) => {
            setNodePicker(null)
            const pt = placePoint.current || { x: 50, y: 50 }
            placeExisting(nn, pt.x, pt.y)
          }}
          onClose={() => setNodePicker(null)} />
      )}
      {nodePicker === 'place' && (
        <NodePicker worldId={worldId} title="Place which node?" unplacedFirst
          excludeIds={(data?.placements || []).map((p) => p.node.id)}
          onPickNode={(n) => {
            setNodePicker(null)
            if (isList) placeExisting(n, 50, 50)
            else setPlacing({ kind: 'existing', node: n })
          }}
          onClose={() => setNodePicker(null)} />
      )}
      {confirmInterior && (
        <div className="modal-back" onClick={() => setConfirmInterior(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h4>Remove the interior of “{confirmInterior.node.title}”?</h4>
              <button onClick={() => setConfirmInterior(null)}>✕</button></div>
            {confirmInterior.impact && (confirmInterior.impact.interiorMaps > 0) ? (
              <div className="impact">
                <p>The space inside ({confirmInterior.impact.interiorMaps} {confirmInterior.impact.interiorMaps === 1 ? 'map' : 'maps'}) is deleted.</p>
                {confirmInterior.impact.nodesInside > 0 && (
                  <p>{confirmInterior.impact.nodesInside} {confirmInterior.impact.nodesInside === 1 ? 'node' : 'nodes'} inside will be left unplaced — they still exist (findable with search).</p>
                )}
                <p className="muted">The node itself stays exactly where it is.</p>
              </div>
            ) : (
              <p className="mnote muted">The interior is empty — nothing else is affected.</p>
            )}
            <div className="mrow">
              <button className="tool" onClick={() => setConfirmInterior(null)}>Keep it</button>
              <button className="tool danger" onClick={doRemoveInterior}>Remove interior</button>
            </div>
          </div>
        </div>
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

      {bdsOpen && map && (
        <div className="modal-back" onClick={() => setBdsOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h4>Backdrops over time</h4><button onClick={() => setBdsOpen(false)}>✕</button></div>
            <p className="muted esmall">History can redraw this map. The newest period covering the viewed moment wins; outside every period, the base art shows.</p>
            <div className="bdrow base">
              {map.backdropUrl ? <img className="bdthumb" src={map.backdropUrl} alt="" /> : <span className="bdthumb none">—</span>}
              <span className="bdlabel">Base — always</span>
              <button className="tool" onClick={() => setPicker({ kind: 'backdrop', hasCurrent: !!map.backdropUrl })}>
                {map.backdropUrl ? 'Change…' : 'Set…'}
              </button>
            </div>
            {(data?.backdrops || []).map((b) => (
              <div key={b.id} className="bdrow">
                <img className="bdthumb" src={b.url} alt="" />
                <span className="bdfrom">from</span>
                <input className="enum" type="number" defaultValue={b.start ?? ''} placeholder="start"
                  onBlur={(ev) => { const v = ev.target.value === '' ? null : Number(ev.target.value); if (v !== b.start) patchBackdrop(b.id, { start_time: v }) }} />
                <span className="edash">–</span>
                <input className="enum" type="number" defaultValue={b.end ?? ''} placeholder="∞"
                  onBlur={(ev) => { const v = ev.target.value === '' ? null : Number(ev.target.value); if (v !== b.end) patchBackdrop(b.id, { end_time: v }) }} />
                <button className="ex" title="Remove this period's art" onClick={() => deleteBackdrop(b.id)}>✕</button>
              </div>
            ))}
            <button className="tool" onClick={() => setPicker({ kind: 'backdrop-timed', hasCurrent: false })}>
              ＋ Add art for a period (starts at {Math.round(now)} {tl?.unit})
            </button>
          </div>
        </div>
      )}

      {focusEdit != null && (
        <div className="modal-back" onClick={() => setFocusEdit(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h4>Focus period</h4><button onClick={() => setFocusEdit(null)}>✕</button></div>
            <p className="muted esmall">Still the one world clock — but inside this space, the scrubber's track zooms to the years its story spans. ⤢ on the bar shows the full timeline again. Blank = the world's full range.</p>
            <div className="span" style={{ marginBottom: 12 }}>
              <input type="number" placeholder={String(tl?.min ?? '')} value={focusEdit.start}
                onChange={(e) => setFocusEdit((f) => ({ ...f, start: e.target.value }))} />
              <span>→</span>
              <input type="number" placeholder={String(tl?.max ?? '')} value={focusEdit.end}
                onChange={(e) => setFocusEdit((f) => ({ ...f, end: e.target.value }))} />
            </div>
            <div className="mrow">
              <button className="tool" onClick={() => setFocusEdit({ start: '', end: '' })}>Clear</button>
              <button className="tool" onClick={() => setFocusEdit(null)}>Cancel</button>
              <button className="tool on" onClick={saveFocus}>Save</button>
            </div>
          </div>
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

      {flash && (
        <div className={`aflash ${flash.kind}`}>
          {flash.text}
          {flash.undoId && <button className="aundo" onClick={() => doUndo(flash.undoId)}>↩ Undo</button>}
        </div>
      )}
    </div>
  )
}

function MapTree({ tree, rootId, mapId, onGo }) {
  const childrenOf = (pid) => tree.filter((m) => (m.parentMapId || null) === (pid ?? null) && m.id !== rootId)
  const glyph = (m) => m?.thumbUrl
    ? <img className="tthumb" src={m.thumbUrl} alt="" />
    : <span className="tw">▸</span>
  const render = (list, depth) => list.map((m) => (
    <React.Fragment key={m.id}>
      <div className={`trow ${String(m.id) === String(mapId) ? 'on' : ''}`} style={{ paddingLeft: 6 + depth * 14 }}
        onClick={() => onGo(m.id)}>
        {glyph(m)}{m.title}
      </div>
      {render(childrenOf(m.id), depth + 1)}
    </React.Fragment>
  ))
  const root = tree.find((m) => m.id === rootId)
  return (
    <>
      {rootId && (
        <div className={`trow ${String(rootId) === String(mapId) ? 'on' : ''}`} onClick={() => onGo(rootId)}>
          {glyph(root)}{root?.title || 'World map'}
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
      <p className="muted">You'll get an Undo offer for a few seconds afterwards.</p>
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

function Inspector({ p, onSave, onCat, onOpen, onCreate, onRemoveInterior, onImage, onRemoveImage, timeline, onLifespan, facts, nowT, onFactAdd, onFactPatch, onFactDelete, links, onLink, onUnlink, onLabel, onJump, onVis, onRemoveHere, onDelete, spotlit, onSpotlight }) {
  const [title, setTitle] = useState(p.node.title)
  const [body, setBody] = useState(p.node.body || '')
  const [note, setNote] = useState(p.node.dmNote || '')
  const [start, setStart] = useState(p.start ?? '')
  const [end, setEnd] = useState(p.end ?? '')
  const [labelEdit, setLabelEdit] = useState(null) // link id whose label is being edited
  const labelCancel = useRef(false) // Esc must beat the blur the unmount fires
  const n = p.node
  return (
    <>
      <div className="fld"><label>Title</label>
        <input value={title} onChange={(e) => { setTitle(e.target.value); onSave(n.id, { title: e.target.value }) }} />
      </div>
      {n.visibility === 'player' && (
        <div className="muted" style={{ marginBottom: 8, fontSize: 12 }}>✍ A player placed this{n.author ? `, signed “${n.author}”` : ''} — a self-typed name, not verified. Set “Who can see it” to claim it into canon or hide it.</div>
      )}
      <div className="catrow">
        {Object.entries(CATS).map(([k, v]) => (
          <button key={k} className={`cdot ${n.category === k ? 'on' : ''}`} title={v.label}
            style={{ background: v.c }} onClick={() => onCat(k)}>{v.i}</button>
        ))}
        <span className="catname">{cat(n.category).label}</span>
      </div>
      <div className="primrow">
        {n.hasInterior
          ? (
            <>
              <button className="btn primary grow" onClick={onOpen}>◎ Open interior ▸</button>
              <button className="btn xint" title="Remove the interior — the space inside is deleted; this node stays"
                onClick={onRemoveInterior}>✕</button>
            </>
          )
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
      <button className={`btn block ${spotlit ? 'lit' : ''}`}
        title={spotlit ? 'Players see a golden trail leading here — click to put it out'
          : 'Light a golden trail for players: on each map along the way, the next step glows'}
        onClick={onSpotlight}>
        {spotlit ? '🔦 Stop showing the way' : '🔦 Show players the way here'}
      </button>
      <div className="isect">Story</div>
      <div className="fld"><label>Description{timeline?.enabled ? ' — the default, when no period below covers the moment' : ''}</label>
        <textarea rows="4" value={body} onChange={(e) => { setBody(e.target.value); onSave(n.id, { body: e.target.value }) }} />
      </div>
      <div className="fld dmnotes"><label>🔒 DM notes — players never see this</label>
        <textarea rows="3" value={note} placeholder="Secrets, truths, plans — yours alone. The painter never reads this either."
          onChange={(e) => { setNote(e.target.value); onSave(n.id, { dm_note: e.target.value }) }} />
        {note.trim() && (
          <button className="btn block" style={{ marginTop: 5 }}
            title="Moves the note into the public description — this is how a secret becomes known"
            onClick={() => {
              const merged = body.trim() ? `${body.trim()}\n\n${note.trim()}` : note.trim()
              setBody(merged); setNote('')
              onSave(n.id, { body: merged, dm_note: '' })
            }}>
            👁 Reveal — move into the description
          </button>
        )}
      </div>
      {timeline?.enabled && (
        <div className="fld"><label>The story by period — what this reads as at different times</label>
          {(facts || []).map((f) => (
            <div key={f.id} className="factrow">
              <div className="factspan">
                <input type="number" defaultValue={f.start ?? ''} placeholder={String(timeline.min)} title="From"
                  onBlur={(e) => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== f.start) onFactPatch(f.id, { start_time: v }) }} />
                <span>–</span>
                <input type="number" defaultValue={f.end ?? ''} placeholder="…" title="To"
                  onBlur={(e) => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== f.end) onFactPatch(f.id, { end_time: v }) }} />
                <button className="lx" title="Remove this period's text" onClick={() => onFactDelete(f.id)}>✕</button>
              </div>
              <textarea rows="2" defaultValue={f.body} placeholder="How it reads during this period…"
                onBlur={(e) => { if (e.target.value !== f.body) onFactPatch(f.id, { body: e.target.value }) }} />
            </div>
          ))}
          <button className="btn block" onClick={onFactAdd}>＋ Story for a period (from {nowT})</button>
          <div className="muted">The latest-starting period covering the moment wins; players get only their moment's text.</div>
        </div>
      )}
      <div className="fld"><label>Image</label>
        {n.imageUrl ? (
          <div className="nimg">
            <img src={n.imageUrl} alt="" />
            <div className="nimg-actions">
              <button className="btn" onClick={onImage}>Change</button>
              <button className="btn danger" onClick={onRemoveImage}>Remove</button>
            </div>
            <div className="chips" style={{ marginTop: 7 }} title="How it draws on the map">
              <button className={`chip ${n.pin !== 'image' ? 'on' : ''}`} onClick={() => onSave(n.id, { pin: 'chip' })}>Pin: icon + name</button>
              <button className={`chip ${n.pin === 'image' ? 'on' : ''}`} onClick={() => onSave(n.id, { pin: 'image' })}>Pin: the image</button>
            </div>
            {n.pin === 'image' && (
              <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
                Size on the map
                {/* pinSize rides along so localPatchNode resizes the pin live; the PATCH whitelist drops it */}
                <input type="range" min="32" max="144" step="8" value={n.pinSize || 64} style={{ flex: 1 }}
                  onChange={(e) => { const v = Number(e.target.value); onSave(n.id, { pin_size: v, pinSize: v }) }} />
              </label>
            )}
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
              {labelEdit === l.id ? (
                <input className="llabel-input" autoFocus defaultValue={l.label || ''}
                  maxLength={255} placeholder="why they're connected…"
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
                  <a className="lgo" onClick={() => onJump(l.otherId)}>→ {l.otherTitle}{l.label ? <span className="llabel"> — {l.label}</span> : null}</a>
                  <button className="lx" title="Label this link" onClick={() => setLabelEdit(l.id)}>✎</button>
                  <button className="lx" title="Remove link" onClick={() => onUnlink(l.id)}>✕</button>
                </>
              )}
            </div>
          ))}
          {(links?.in || []).map((l) => (
            <div key={`i${l.id}`} className="lrow in">
              <a className="lgo" onClick={() => onJump(l.otherId)}>← {l.otherTitle}{l.label ? <span className="llabel"> — {l.label}</span> : null}</a>
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

// Upload a new image (to R2 via the existing pipeline), pick an existing one from this
// world, or — when the Forge is on — paint one for exactly the thing being decorated.
function ImagePicker({ worldId, hasCurrent, onPick, onClose, generate, onGenerated }) {
  const [images, setImages] = useState([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [genBusy, setGenBusy] = useState(false)
  const [gGuide, setGGuide] = useState('')
  const runGen = () => {
    if (genBusy || busy) return
    setGenBusy(true); setErr('')
    generate.run(gGuide.trim() || undefined)
      .then(() => onGenerated?.())
      .catch((e) => setErr(errText(e, 'Painting failed')))
      .finally(() => setGenBusy(false))
  }
  const usesOf = (im) => (im.usage
    ? (im.usage.maps || 0) + (im.usage.nodes || 0) + (im.usage.backdrops || 0) + (im.usage.anchor || 0)
    : 0)

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
        {generate && (
          <div className="pgen">
            <button className="btn primary block" disabled={genBusy || busy} onClick={runGen}
              title="Nano Banana paints in this world's style and attaches it right here">
              {genBusy ? 'Painting… about half a minute' : `✦ ${generate.label}`}
            </button>
            <input value={gGuide} maxLength={480} disabled={genBusy}
              placeholder="Optional direction — “weathered face, storm cloak, one eye”"
              onChange={(e) => setGGuide(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') runGen() }} />
          </div>
        )}
        <label className="btn block">
          {busy ? 'Uploading…' : '⬆ Upload new image'}
          <input type="file" accept="image/*" hidden disabled={busy} onChange={(e) => upload(e.target.files[0])} />
        </label>
        {hasCurrent && <button className="btn block" onClick={() => onPick(null, null)}>Remove current image</button>}
        {err && <div className="muted" style={{ color: '#ff9b9b' }}>{err}</div>}
        <div className="pick-grid">
          {images.map((im) => (
            <button key={im.id} className="pick" onClick={() => onPick(im.id, im.url)}
              title={`${im.originalName}${usesOf(im) > 0 ? ' — in use in your world' : ' — not used anywhere yet'}`}>
              <img src={im.url} alt={im.originalName} loading="lazy" />
              {usesOf(im) > 0
                ? <span className="puse on" title="In use in your world">◈</span>
                : <span className="puse" title="Not used anywhere yet">○</span>}
            </button>
          ))}
          {images.length === 0 && <div className="muted">No images in this world yet — upload one above.</div>}
        </div>
      </div>
    </div>
  )
}

// Pick a node from this world (searchable). onPick gets the id; onPickNode the whole node.
function NodePicker({ worldId, excludeId, excludeIds, title = 'Link to…', unplacedFirst, onPick, onPickNode, onClose }) {
  const [nodes, setNodes] = useState([])
  const [q, setQ] = useState('')
  useEffect(() => { atlasService.getNodes(worldId).then((ns) => setNodes(ns || [])).catch(() => {}) }, [worldId])
  const skip = new Set(excludeIds || [])
  if (excludeId != null) skip.add(excludeId)
  const list = nodes.filter((n) => !skip.has(n.id) && (n.title || '').toLowerCase().includes(q.toLowerCase()))
  // Placing flows float the homeless to the top; the sort is stable, so titles stay ordered within each group.
  if (unplacedFirst) list.sort((a, b) => (a.placed === false ? 0 : 1) - (b.placed === false ? 0 : 1))
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
              {n.placed === false && <span className="gorphan">○ unplaced</span>}
              {n.hasInterior && <span className="open">◎</span>}
            </button>
          ))}
          {list.length === 0 && <div className="muted">No matching nodes.</div>}
        </div>
      </div>
    </div>
  )
}

// ---- The Forge: the world's mind, as a panel -------------------------------------
// One continuing conversation per world. The mind creates through a validated contract —
// everything it makes lands DM-only and grouped into a batch that can be kept or unmade
// as a unit. Quick actions paint with Nano Banana in the world's locked art style.
function ForgePanel({ worldId, map, sel, onFlash, onRefresh, onClose }) {
  const [msgs, setMsgs] = useState(null) // null while the history loads
  const [batches, setBatches] = useState([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(null) // null | 'chat' | 'art' | 'backdrop' | batch id
  const [view, setView] = useState('chat') // 'chat' | 'mind' (the mind's settings partition)
  const [mind, setMind] = useState({ artStyle: '', lore: '', bible: '', genSize: 'medium', styleImage: null })
  const [anchorPick, setAnchorPick] = useState(false)
  const [guide, setGuide] = useState('') // rides along with the next quick action, then clears
  const logRef = useRef(null)
  const takeGuide = () => { const g = guide.trim(); setGuide(''); return g }

  useEffect(() => {
    let live = true
    forgeService.getWorld(worldId)
      .then((d) => {
        if (!live) return
        setMsgs(d.messages); setBatches(d.batches)
        setMind({ artStyle: d.artStyle, lore: d.lore, bible: d.bible || '', genSize: d.genSize, styleImage: d.styleImage })
      })
      .catch(() => { if (live) setMsgs([]) })
    return () => { live = false }
  }, [worldId])

  const saveMind = () => {
    setBusy('mind')
    forgeService.patchMind(worldId, { art_style: mind.artStyle, lore: mind.lore, bible: mind.bible, gen_size: mind.genSize })
      .then(() => onFlash({ kind: 'ok', text: 'The mind took it in' }))
      .catch((e) => onFlash({ kind: 'err', text: errText(e, "Couldn't save") }))
      .finally(() => setBusy(null))
  }
  const setAnchor = (imageId, url) => {
    setAnchorPick(false)
    forgeService.patchMind(worldId, { style_image_id: imageId })
      .then(() => setMind((m) => ({ ...m, styleImage: imageId == null ? null : { id: imageId, url } })))
      .catch((e) => onFlash({ kind: 'err', text: errText(e, "Couldn't change the anchor") }))
  }

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [msgs, busy])

  const say = (message) => {
    if (!message.trim() || busy) return
    setText('')
    setView('chat')
    setMsgs((m) => [...(m || []), { role: 'user', content: message }])
    setBusy('chat')
    forgeService.chat(worldId, message, { mapId: map?.id, nodeId: sel?.node?.id })
      .then((r) => {
        setMsgs((m) => [...m, { role: 'mind', content: r.batch ? `${r.say}\n⚒ ${r.batch.summary}` : r.say }])
        if (r.batch) {
          if (r.batch.askCount) {
            // asks need their server-rendered plain-word lines — reload the panel state
            forgeService.getWorld(worldId).then((d) => setBatches(d.batches)).catch(() => {})
          } else {
            setBatches((b) => [{ id: r.batch.batchId, summary: r.batch.summary, counts: r.batch.counts, asksState: 'none', asksText: [] }, ...b])
          }
          onRefresh()
        }
        if (r.applyError) onFlash({ kind: 'err', text: `The mind spoke, but the creation failed: ${r.applyError}` })
      })
      .catch((e) => onFlash({ kind: 'err', text: errText(e, 'The mind did not answer') }))
      .finally(() => setBusy(null))
  }

  const withGuide = (base) => {
    const g = takeGuide()
    return g ? `${base}\n\nDirection from me: ${g}` : base
  }
  const paintArt = () => {
    if (!sel || busy) return
    setBusy('art')
    forgeService.nodeArt(sel.node.id, takeGuide() || undefined)
      .then(() => { onFlash({ kind: 'ok', text: `Painted art for “${sel.node.title}”` }); onRefresh() })
      .catch((e) => onFlash({ kind: 'err', text: errText(e, 'Painting failed') }))
      .finally(() => setBusy(null))
  }
  const paintBackdrop = () => {
    if (!map || busy) return
    setBusy('backdrop')
    forgeService.mapBackdrop(map.id, takeGuide() || undefined)
      .then(() => { onFlash({ kind: 'ok', text: `Painted a backdrop for “${map.title}”` }); onRefresh() })
      .catch((e) => onFlash({ kind: 'err', text: errText(e, 'Painting failed') }))
      .finally(() => setBusy(null))
  }
  const imagineInterior = () => {
    if (!sel) return
    say(withGuide(`Create an interior map for node #${sel.node.id} (“${sel.node.title}”) — the whole space: a painted backdrop, and the people, things, and secrets inside it, placed where they belong.`))
  }
  const fillOutInterior = () => {
    if (!sel?.node.interiorMapId) return
    say(withGuide(`Populate the interior of node #${sel.node.id} (“${sel.node.title}”) — its interior is map #${sel.node.interiorMapId}. Fill the SPACE itself: the people, things, and secrets that belong inside, placed on that interior map (and paint it a backdrop if it has none).`))
  }
  const fillOutNode = () => {
    if (!sel) return
    say(withGuide(`Fill out node #${sel.node.id} (“${sel.node.title}”) — enrich it with facts across the eras, links to the people and places it touches, and a body if it has none. Don't create new nodes unless one is truly missing from its story.`))
  }
  const fillOutMap = () => {
    if (!map) return
    say(withGuide(`Fill out the map I'm looking at (map #${map.id}, “${map.title}”) — add the people, places, and things that belong here, placed sensibly, and enrich what already exists before inventing anything that duplicates it.`))
  }
  const buildFromBible = () => {
    say(withGuide(`Build the world from the CAMPAIGN BIBLE. Compare it against the world digest and create what the bible describes that does not exist yet — spine first: the eras of history, the major regions and places as nodes (with interiors where the bible goes inside them), the load-bearing people and things, all linked and placed where they belong. Stay strictly consistent with the bible's names, facts, and timeline. If more remains than fits one batch, build the most important part now — I'll click again to continue.`))
  }
  const loadBibleFile = (e) => {
    const f = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!f) return
    const r = new FileReader()
    r.onload = () => {
      const full = String(r.result || '')
      setMind((m) => ({ ...m, bible: full.slice(0, 100000) }))
      if (full.length > 100000) onFlash({ kind: 'info', text: 'The bible was trimmed to 100,000 characters' })
    }
    r.readAsText(f)
  }

  const askAct = (b, allow) => {
    if (busy) return
    setBusy(b.id)
    ;(allow ? forgeService.allowAsks(worldId, b.id) : forgeService.refuseAsks(worldId, b.id))
      .then((r) => {
        setBatches((list) => list.map((x) => x.id === b.id ? { ...x, asksState: allow ? 'allowed' : 'refused' } : x))
        if (allow) { onFlash({ kind: 'ok', text: `Granted — ${r.granted ?? 'the'} act${r.granted === 1 ? '' : 's'} done` }); onRefresh() }
      })
      .catch((e) => onFlash({ kind: 'err', text: errText(e, "Couldn't do that") }))
      .finally(() => setBusy(null))
  }
  const batchAct = (b, keep) => {
    if (busy) return
    setBusy(b.id)
    ;(keep ? forgeService.keepBatch(worldId, b.id) : forgeService.discardBatch(worldId, b.id))
      .then(() => {
        setBatches((list) => list.filter((x) => x.id !== b.id))
        if (!keep) { onFlash({ kind: 'info', text: 'Unmade — everything that creation added is gone' }); onRefresh() }
      })
      .catch((e) => onFlash({ kind: 'err', text: errText(e, "Couldn't do that") }))
      .finally(() => setBusy(null))
  }

  const COUNT_LABELS = { enrichedBodies: 'bodies filled', enrichedNotes: 'notes filled', enrichedImages: 'art attached', mapBases: 'backdrops set' }
  return (
    <div className="forge">
      <div className="fhead">
        <h4>✦ The Forge</h4>
        <div className="fhbtns">
          <button className={`gear ${view === 'mind' ? 'on' : ''}`} onClick={() => setView(view === 'mind' ? 'chat' : 'mind')}
            title="The mind itself — art style, style anchor, memory, creation size">⚙</button>
          <button className="x" onClick={onClose} title="Close the Forge">✕</button>
        </div>
      </div>
      {view === 'mind' && (
        <div className="fmind">
          <div className="fsect">Campaign bible</div>
          <div className="fhint">Your own document — the mind treats it as canon on every turn. Paste it, or load a .md file.</div>
          <textarea rows={7} value={mind.bible} placeholder="Nothing here yet — paste your campaign bible, or load the file."
            onChange={(e) => setMind((m) => ({ ...m, bible: e.target.value }))} />
          <div className="fbrow">
            <label className="tool" style={{ cursor: 'pointer' }}>
              Load a .md file…
              <input type="file" accept=".md,.markdown,.txt" style={{ display: 'none' }} onChange={loadBibleFile} />
            </label>
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
          <div className="fhint">How much a “fill this out” makes at once.</div>
          <select value={mind.genSize} onChange={(e) => setMind((m) => ({ ...m, genSize: e.target.value }))}>
            <option value="small">Small — a handful (3–6 nodes)</option>
            <option value="medium">Medium — a lived-in space (8–14)</option>
            <option value="large">Large — a whole quarter (18–35)</option>
          </select>
          <div className="fsect">The mind's memory</div>
          <div className="fhint">Threads and secrets it keeps between sessions. It reads this every turn — edit freely.</div>
          <textarea rows={8} value={mind.lore} placeholder="Nothing remembered yet."
            onChange={(e) => setMind((m) => ({ ...m, lore: e.target.value }))} />
          <button className="tool on" disabled={busy === 'mind'} onClick={saveMind}>{busy === 'mind' ? 'Saving…' : 'Save the mind'}</button>
        </div>
      )}
      {view === 'chat' && (
      <div className="fquick">
        {mind.bible.trim() && (
          <button disabled={!!busy} onClick={buildFromBible} title="The mind builds what the bible describes that isn't in the world yet — spine first, in keep/unmake-able batches">
            📜 Build from the bible
          </button>
        )}
        <input className="fguide" value={guide} maxLength={480}
          placeholder="Optional: steer the next button — “storm-lashed pirate harbor, mostly ruins”"
          onChange={(e) => setGuide(e.target.value)} />
        {sel && (
          <button disabled={!!busy} onClick={paintArt} title="Nano Banana paints this node in the world's art style and attaches it">
            {busy === 'art' ? 'Painting…' : `🎨 Paint “${trunc(sel.node.title)}”`}
          </button>
        )}
        {sel && !sel.node.hasInterior && (
          <button disabled={!!busy} onClick={imagineInterior} title="The mind builds the whole space inside this node — backdrop, people, things">
            ◎ Imagine its interior
          </button>
        )}
        {sel && sel.node.hasInterior && (
          <button disabled={!!busy} onClick={fillOutInterior} title="The mind populates the space inside this node — people and things placed on its interior map">
            ◎ Fill out its interior
          </button>
        )}
        {sel && (
          <button disabled={!!busy} onClick={fillOutNode} title="Facts across the eras, links, a body if it has none — the mind fleshes out what's already there">
            ✚ Fill out “{trunc(sel.node.title)}”
          </button>
        )}
        {map && map.view !== 'list' && (
          <button disabled={!!busy} onClick={fillOutMap} title="The mind populates this map — enriching what exists before inventing anything new">
            ✚ Fill out this map
          </button>
        )}
        {map && map.view !== 'list' && (
          <button disabled={!!busy} onClick={paintBackdrop} title="Paint this map a backdrop in the world's style (the current one is replaced, not deleted)">
            {busy === 'backdrop' ? 'Painting…' : '🗺 Paint this map a backdrop'}
          </button>
        )}
      </div>
      )}
      {view === 'chat' && batches.length > 0 && (
        <div className="fbatches">
          {batches.map((b) => (
            <div key={b.id} className="fbatch">
              <div className="fbsum">{b.summary}</div>
              <div className="fbmeta">{Object.entries(b.counts || {}).map(([k, v]) => `${v} ${COUNT_LABELS[k] || k}`).join(' · ') || 'created'} — DM-only until you reveal it</div>
              {b.asksState === 'pending' && (b.asksText || []).length > 0 && (
                <div className="fasks">
                  <div className="faskhead">It asks permission to:</div>
                  {b.asksText.map((t, i) => <div key={i} className="fask">• {t}</div>)}
                  <div className="fbrow">
                    <button className="tool on" disabled={!!busy} onClick={() => askAct(b, true)}>{busy === b.id ? '…' : 'Allow'}</button>
                    <button className="tool" disabled={!!busy} onClick={() => askAct(b, false)}>Refuse</button>
                  </div>
                </div>
              )}
              {b.asksState === 'allowed' && <div className="fbmeta">✓ permission granted — Unmake reverts it all</div>}
              <div className="fbrow">
                <button className="tool on" disabled={!!busy} onClick={() => batchAct(b, true)}>Keep</button>
                <button className="tool danger" disabled={!!busy} onClick={() => batchAct(b, false)}>{busy === b.id ? '…' : 'Unmake'}</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {view === 'chat' && (<>
      <div className="flog" ref={logRef}>
        {msgs === null && <div className="fintro">Waking the mind…</div>}
        {msgs !== null && msgs.length === 0 && (
          <div className="fintro">
            This world's mind is listening. Ask it for people, places, whole interiors, eras of
            history — it builds them DM-only (undoable), remembers your threads, and paints in a
            style it keeps for this world.
          </div>
        )}
        {(msgs || []).map((m, i) => (
          <div key={i} className={`fmsg ${m.role === 'user' ? 'me' : 'mind'}`}>{m.content}</div>
        ))}
        {busy === 'chat' && <div className="fmsg mind fwait">The mind is at work… paintings take a minute.</div>}
      </div>
      <div className="fsend">
        <textarea rows={2} value={text}
          placeholder="Ask for anything — “a rival thieves' guild in the docks, with a leader worth hating”"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); say(text) } }} />
        <button className="tool on" disabled={!!busy || !text.trim()} onClick={() => say(text)}>Send</button>
      </div>
      </>)}
      {anchorPick && (
        <ImagePicker worldId={worldId} hasCurrent={!!mind.styleImage}
          onPick={(id, url) => setAnchor(id, url)} onClose={() => setAnchorPick(false)} />
      )}
    </div>
  )
}

export default AtlasWorkspace
