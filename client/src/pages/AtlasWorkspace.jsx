import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import atlasService from '../services/atlasService'
import worldService from '../services/worldService'
import { errText, refused } from '../services/http'
import MapPlane, { toPlanePct } from '../components/MapPlane'
import { PinBody, pinClass } from '../components/Pin'
import { Compass } from '../components/TopBar'
import Modal from '../components/Modal'
import forgeService from '../services/forgeService'
import voiceService from '../services/voiceService'
import AudioClip from '../components/AudioClip'
import PartyTrail from '../components/PartyTrail'
import Regions, { regionIdAt, styleOf, STYLE_KEYS, OUTLINE_PRESETS } from '../components/Regions'
import { momentLabel, sessionOf, sessionColor, partyNeighbors, spanLabel, sessionLabel, stepTag, sessionNum, latestSession } from '../utils/moment'
import { cleanRing, centroid } from '../utils/geometry'
import { cat } from '../utils/categories'
import { isPresent, pickCovering } from '../utils/timeline'
import MapTree from '../components/atlas/MapTree'
import DeleteImpact from '../components/atlas/DeleteImpact'
import TimelineConfig from '../components/atlas/TimelineConfig'
import Inspector from '../components/atlas/Inspector'
import { ImagePicker, NodePicker } from '../components/atlas/Pickers'
import ForgePanel from '../components/atlas/ForgePanel'
import { clampPct, wholeOr, periodBlur, REVERSED, keyAct, stackOffsets, coveringFact, trunc, isPhone, BREAKPOINTS } from '../components/atlas/helpers'
import { readPref, writePref, useFlag, useColumnResize, useDismiss } from '../hooks/prefs'
import '../styles/atlas.scss'

function AtlasWorkspace() {
  const { worldId, mapId } = useParams()
  const navigate = useNavigate()

  const [world, setWorld] = useState(null)
  const [worldList, setWorldList] = useState(null)
  const [pendingWorld, setPendingWorld] = useState(null) // a world browsed to with the arrow keys, not yet chosen
  const viaKeys = useRef(false) // null until the switcher is first opened
  const [tree, setTree] = useState([])
  const [mapData, setMapData] = useState(null) // the current map's payload: { map, placements, breadcrumb, backdrops, worldId }
  const [loadState, setLoadState] = useState('loading') // loading | ok | err | missing (the space is gone)
  const [worldErr, setWorldErr] = useState(null) // the world did not load (not a 404: those go to the dashboard)
  const [worldTick, setWorldTick] = useState(0) // bumped by ⟳ Try again
  const [bdHint, setBdHint] = useState(null) // a backdrop row whose bounds are reversed
  const [bdVer, setBdVer] = useState(0) // remounts the backdrop rows to their stored bounds
  const [selId, setSelId] = useState(null) // selected placement id
  const [placing, setPlacing] = useState(null) // null | {kind:'new'} | {kind:'existing', node}
  const [drawing, setDrawing] = useState(null) // an outline in progress: { placementId|null, pts:[[x,y]], kind }
  const [hovId, setHovId] = useState(null) // the placement whose region is hovered — its name label lights
  const [worldLoading, setWorldLoading] = useState(true)
  const [save, setSave] = useState('idle') // idle | saving | saved | err
  const [trailTick, setTrailTick] = useState(0) // bumps when footsteps may have moved (map loads, lifespan saves)
  const [flash, setFlash] = useState(null) // { kind: 'ok'|'err'|'info', text }
  const [flashHold, setFlashHold] = useState(false) // the toast is hovered or focused: its timer waits
  const [picker, setPicker] = useState(null) // { kind: 'node'|'backdrop'|'backdrop-timed'|'backdrop-row', nodeId?, rowId?, hasCurrent }
  const [lens, setLens] = useState(0) // the DM's viewing moment — a local lens, never what players see (that is canon: tl.current)
  const [tlEdit, setTlEdit] = useState(false)
  const [sharePop, setSharePop] = useState(false)
  const [copied, setCopied] = useState(false)
  // Three postures: edit (full tools) · view (DM eyes, reading chrome) · player (the real
  // Player View, framed from the share link — so it cannot drift from what players see).
  const [mode, setMode] = useState(() => {
    const m = readPref('atlas_mode')
    // a phone is view-only by design: it lands in View (or Player), never in the editor
    if (isPhone()) return m === 'player' ? 'player' : 'view'
    return m === 'player' ? 'player' : m === 'view' ? 'view' : 'edit'
  })
  const [spaceOpen, setSpaceOpen] = useState(false) // phones: the space reader opens on request, not over the map
  const [nodeDetail, setNodeDetail] = useState({ out: [], in: [], facts: [] }) // the selected node's threads (out/in) and period texts
  const [nodePicker, setNodePicker] = useState(null) // 'link' | 'place' | 'place-here'
  const [hiddenCats, setHiddenCats] = useState(() => new Set())
  const trackRef = useRef(null)                 // the timebar's track, measured so ticks know their pitch
  const [trackW, setTrackW] = useState(600)
  const [q, setQ] = useState('') // global node search
  const [searchOpen, setSearchOpen] = useState(false)
  const [nodeIndex, setNodeIndex] = useState([]) // every node of the world, for the search box
  const [sfilter, setSfilter] = useState('all') // 'all' | 'unplaced' — the search dropdown's chip filter
  const [confirmDel, setConfirmDel] = useState(null) // { node, impact }
  const [confirmInterior, setConfirmInterior] = useState(null) // { node, impact }
  const [mapMenu, setMapMenu] = useState(false) // the "Map ▾" toolbar menu
  const [help, setHelp] = useState(false) // the "?" gesture guide
  const [renaming, setRenaming] = useState(null) // string while the rename dialog is open
  const [gridOn, setGridOn] = useFlag('atlas_grid', false)
  const [labelsOn, setLabelsOn] = useFlag('atlas_labels', false)
  const [printsOn, setPrintsOn] = useFlag('atlas_prints', true)
  const [ghostsOn, setGhostsOn] = useFlag('atlas_ghosts', true) // show things not present at the lens moment
  const togglePrints = () => setPrintsOn((v) => !v)
  const [bdsOpen, setBdsOpen] = useState(false) // "backdrops over time" manager
  const [focusEdit, setFocusEdit] = useState(null) // { start, end } strings while editing
  const [focusExpand, setFocusExpand] = useState(false) // temporarily show the full timeline
  const [momentEdit, setMomentEdit] = useState(null) // string while typing an exact moment
  const [phone] = useState(isPhone)
  const [railPref, setRailOpen] = useFlag('atlas_rail', true)
  const railOpen = railPref && !phone // a phone never opens the tree over the map
  const [inspOpen, setInspOpen] = useFlag('atlas_insp', true)
  const [stray, setStray] = useState(null)      // a node opened WITHOUT a placement (unplaced, or an orphaned interior's owner)
  const [refreshVer, setRefreshVer] = useState(0) // bumps after a Forge turn / Allow / Unmake: the inspector reseeds from the server
  const [noteVer, setNoteVer] = useState(0)     // bumps when the server's map notes changed under an idle box
  const noteRef = useRef(null)
  const quietRef = useRef(true)                  // nothing being dragged, drawn, typed or confirmed: safe to refresh
  const focusIdRef = useRef(null)
  const [trail, setTrail] = useState([]) // every party footstep in the world (timebar ticks)
  // The Forge: this world's AI mind. forgeOn = the server has it switched on at all
  // (GEMINI_API_KEY set); without it the button never renders. Edit-posture chrome only.
  const [forgeOn, setForgeOn] = useState(false)
  const [voiceMeta, setVoiceMeta] = useState({ enabled: false }) // which provider speaks, and whether it can be steered / make ambience
  const voiceOn = voiceMeta.enabled && voiceMeta.storage !== false
  const [voicesErr, setVoicesErr] = useState(false)
  const loadVoices = () => { setVoicesErr(false); return voiceService.voices().then(setVoices).catch(() => setVoicesErr(true)) }
  const [voices, setVoices] = useState([])
  const [forgeOpen, setForgeOpen] = useFlag('atlas_forge', false)
  // the four resizable columns: drag the edge, double-click resets; widths persist per browser
  const forgeCol = useColumnResize({ key: 'atlas_forgew', min: 280, max: 600, maxFrac: 0.5, fallback: 340 })
  const railCol = useColumnResize({ key: 'atlas_railw', min: 160, max: 420, maxFrac: 0.4, fallback: 230, edge: 'right' })
  const inspCol = useColumnResize({ key: 'atlas_inspw', min: 280, max: 640, maxFrac: 0.55, fallback: 310 })
  const readerPane = useColumnResize({ key: 'atlas_readerw', min: 300, max: 720, maxFrac: 0.6, fallback: null }) // null = the CSS default
  const forgeW = forgeCol.w, railW = railCol.w, inspW = inspCol.w, readerW = readerPane.w
  const ctxRef = useRef(null) // the right-click menu measures itself and stays inside the window
  const [wide, setWide] = useState(() => window.innerWidth > BREAKPOINTS.phone) // below that the reader overlays the map
  useEffect(() => {
    const on = () => setWide(window.innerWidth > BREAKPOINTS.phone)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  const [ctx, setCtx] = useState(null) // right-click menu: { sx, sy, px, py }

  const saveTimer = useRef(null)
  const lifeTimer = useRef(null)          // lifespan edits keep their own clock (they used to cancel node saves)
  const pendingLife = useRef(null)        // { placementId, start, end }
  const failedPatches = useRef(new Map()) // node patches the server refused — retried, never dropped
  const retryTimer = useRef(0)
  const loadSeq = useRef(0)               // the newest map request wins; a slower older reply is dropped
  const noteTimer = useRef(null)          // map notes: debounced and tracked like node fields
  const pendingNote = useRef(null)        // { mapId, note }
  const busy = useRef(new Set())          // one click does one thing: create buttons ignore re-entry
  const pendingPatch = useRef({ nodeId: null, patch: {} })
  const inflight = useRef(0)
  const worldRef = useRef(null)
  const dragRef = useRef(null)
  const pendingSelect = useRef(null)
  const shareRef = useRef(null)
  const searchRef = useRef(null)
  const mapMenuRef = useRef(null)
  const helpRef = useRef(null)
  const placePoint = useRef(null) // where "place existing here" should land
  const cursorRef = useRef(null) // last pointer position — keyboard placement drops there
  const justCreated = useRef(null) // the placement just dropped: its title opens focused and selected
  const inspEl = useRef(null) // the editor panel: it opens at the top for each newly selected thing
  const frameNext = useRef(null) // a placement selected from afar (search, a thread, a tick): the camera brings it into view
  const [frameReq, setFrameReq] = useState(null) // { x, y, key } handed to the plane
  const frame = (placementId) => { const p = mapData?.placements.find((pp) => pp.id === placementId); if (p) setFrameReq({ x: p.x, y: p.y, key: Date.now() }) }

  // ---- save tracking: every write goes through track(), so the header chip is honest
  // and failures surface as a toast instead of vanishing into an empty catch.
  const track = useCallback((promise, failMsg) => {
    inflight.current += 1
    setSave('saving')
    return promise
      .then((r) => { if ((inflight.current -= 1) === 0) setSave(failedPatches.current.size ? 'err' : 'saved'); return r })
      .catch((e) => {
        inflight.current -= 1
        setSave('err')
        setFlash({ kind: 'err', text: errText(e, failMsg || "Couldn't save") })
        throw e
      })
  }, [])

  useEffect(() => {
    if (!flash) return
    if (flashHold) return // hovered or focused: it stays until the DM leaves it
    const t = setTimeout(() => setFlash(null), (flash.undoId || flash.undo) ? 9000 : 4000)
    return () => clearTimeout(t)
  }, [flash, flashHold])

  const doUndo = async (undoId) => {
    setFlash(null)
    const r = await track(atlasService.undo(undoId), "Couldn't undo").catch(() => null)
    if (!r) return
    refreshMap(); refreshTree(); refreshWorldMeta() // the lantern may have come back with its node
    if (focusIdRef.current) reloadNodeDetail(focusIdRef.current) // a restored fact or link shows at once
    setFlash({ kind: 'ok', text: 'Put back the way it was' })
  }

  // ---- loading the world + map --------------------------------------------------
  const refreshTree = () => atlasService.getMaps(worldId).then(setTree).catch(() => {})
  const loadMap = useCallback((blank) => {
    if (!mapId) return Promise.resolve()
    const seq = ++loadSeq.current
    if (blank) { setMapData(null); setLoadState('loading') }
    return atlasService.getMap(mapId)
      .then((d) => {
        if (seq !== loadSeq.current) return // a newer map was asked for since: this reply is stale
        // a map opened under the wrong world goes to its own: one world's clock, tree and
        // eras must never dress another's map (and edits would split across two worlds)
        if (d.map?.worldId != null && String(d.map.worldId) !== String(worldId)) { navigate(`/w/${d.map.worldId}/m/${mapId}`, { replace: true }); return }
        setMapData((prev) => {
          // a background refresh that brings a new player marker says so — the DM's tab is not a wall
          if (prev && prev.map?.id === d.map?.id) {
            const had = new Set(prev.placements.map((p) => p.node.id))
            const marks = d.placements.filter((p) => p.node.visibility === 'player' && !had.has(p.node.id))
            if (marks.length) setTimeout(() => setFlash({ kind: 'info', text: `A player marked the map: ${marks.map((p) => `“${p.node.title}”`).join(', ')}` }), 0)
          }
          return d
        })
        setLoadState('ok')
        setTrailTick((t) => t + 1)
        worldService.setLastLocation(worldId, mapId) // "/" resumes here next visit
      })
      .catch((e) => {
        if (seq !== loadSeq.current) return
        if (e?.response?.status === 404) {
          // the space is gone (removed on another tab, or unmade): say so, offer the way
          // out, and never resume here
          worldService.clearLastLocation(worldId)
          setMapData(null); setLoadState('missing')
          return
        }
        if (blank) setLoadState('err')
        else setFlash({ kind: 'err', text: errText(e, "Couldn't refresh the map") })
      })
  }, [worldId, mapId, navigate])
  const refreshMap = () => loadMap(false) // background refresh: keeps the canvas up while fetching

  useEffect(() => { forgeService.status().then(setForgeOn) }, [])
  useEffect(() => {
    voiceService.status().then((m) => {
      setVoiceMeta(m || { enabled: false })
      if (m?.enabled) loadVoices()
    })
  }, [])
  // every write goes through track(): the header chip and the error toast stay honest
  const setNodeVoice = (nodeId, voiceId, voiceName, voiceStyle) =>
    track(voiceService.setVoice(nodeId, voiceId, voiceName, voiceStyle), "Couldn't set the voice")
      .then(() => localPatchNode(nodeId, { voiceId, voiceName, ...(voiceStyle !== undefined ? { voiceStyle } : {}) }))
      .catch(() => {})
  const sayLine = (nodeId, text, style) =>
    track(voiceService.sayLine(nodeId, text, style), "Couldn't record the line")
      .then((r) => { localPatchNode(nodeId, { voiceLine: r.line, voiceUrl: r.url }); setFlash({ kind: 'ok', text: 'Line recorded — players hear it on the sheet' }) })
      .catch(() => {})
  const clearLine = (nodeId) =>
    track(voiceService.clearLine(nodeId), "Couldn't remove the line")
      .then(() => localPatchNode(nodeId, { voiceLine: null, voiceUrl: null }))
      .catch(() => {})
  const [ambBusy, setAmbBusy] = useState(false)
  const setAmbience = (prompt) => {
    if (ambBusy) return Promise.resolve()
    const id = map.id // the reply lands on the map it was sent for, not whichever is open by then
    setAmbBusy(true)
    return track(voiceService.setAmbience(id, prompt), 'No sound came back')
      .then((r) => { setMapData((d) => (d && d.map?.id === id) ? { ...d, map: { ...d.map, ambienceUrl: r.url, ambiencePrompt: r.prompt } } : d); setFlash({ kind: 'ok', text: 'Ambience ready' }) })
      .catch(() => {})
      .finally(() => setAmbBusy(false))
  }
  const clearAmbience = () => {
    const id = map.id
    return track(voiceService.clearAmbience(id), "Couldn't remove the ambience")
      .then(() => setMapData((d) => (d && d.map?.id === id) ? { ...d, map: { ...d.map, ambienceUrl: null, ambiencePrompt: null } } : d))
      .catch(() => {})
  }
  const toggleForge = () => {
    const nv = !forgeOpen
    // a laptop cannot hold tree, canvas, editor and Forge at once: the editor folds while the
    // Forge opens (▸ brings it back), so the map keeps its room
    if (nv && window.innerWidth < BREAKPOINTS.laptop && inspOpen) setInspOpen(false)
    setForgeOpen(nv)
  }
  useLayoutEffect(() => {
    const el = ctxRef.current
    if (!el) return
    el.style.transform = ''
    const r = el.getBoundingClientRect()
    const dy = Math.max(0, r.bottom - window.innerHeight + 8), dx = Math.max(0, r.right - window.innerWidth + 8)
    if (dx || dy) el.style.transform = `translate(${-dx}px, ${-dy}px)`
  }, [ctx])
  // The DM's lantern: point players toward one node — the share API draws the golden
  // trail (pruned at the first hidden step); here we just flip the pointer.
  const toggleSpotlight = (node) => {
    const on = world?.spotlightNodeId === node.id
    const call = track(on ? atlasService.clearSpotlight(worldId) : atlasService.setSpotlight(worldId, node.id), "Couldn't light the lantern")
    call.then((r) => {
      setWorld((w) => ({ ...w, spotlightNodeId: on ? null : node.id }))
      if (on) { setFlash({ kind: 'info', text: 'The trail is out.' }); return }
      // the server resolved the trail the way the share link will: say exactly that
      const tr = r?.trail || []
      if (!tr.length) setFlash({ kind: 'info', text: `Players can't see any of the way to “${node.title}” yet — it is hidden, or not here at the canon moment.` })
      else if (tr[tr.length - 1].nodeId !== node.id) setFlash({ kind: 'info', text: `Players see the way as far as “${tr[tr.length - 1].title}” — the rest is hidden or not here yet.` })
      else setFlash({ kind: 'ok', text: `The lantern lights the way for players: ${tr.map((x) => x.title).join(' ▸ ')}` })
    }).catch(() => {})
  }

  useEffect(() => {
    if (!worldId) return
    atlasService.getTrail(worldId).then(setTrail).catch(() => {})
  }, [worldId, trailTick]) // eslint-disable-line
  // After the Forge lands a batch, the world (eras), the tree (new interiors), and the
  // canvas may all have changed — refresh all three in the background.
  const forgeRefresh = useCallback(() => {
    // the mind (or an Allow / Unmake) may have changed the very node the DM has open: push
    // pending edits first, then reseed the inspector and its threads from the server's copy
    flushAll()
    atlasService.getWorld(worldId).then(setWorld).catch(() => {})
    atlasService.getMaps(worldId).then(setTree).catch(() => {})
    loadMap(false).then(() => { setRefreshVer((v) => v + 1); if (focusIdRef.current) reloadNodeDetail(focusIdRef.current) })
  }, [worldId, loadMap]) // eslint-disable-line

  useEffect(() => {
    let live = true
    setWorldLoading(true); setWorldErr(null)
    atlasService.getWorld(worldId)
      .then(async (w) => {
        if (!live) return
        setWorld(w)
        setLens(w.timeline?.current ?? 0)
        const maps = await atlasService.getMaps(worldId).catch(() => [])
        if (live) setTree(maps)
        if (!mapId && w.rootMapId) navigate(`/w/${worldId}/m/${w.rootMapId}`, { replace: true })
      })
      .catch((e) => {
        if (!live) return
        if (e?.response?.status === 404) {
          // not this account's world (a pointer left by another account, or a deleted one):
          // the dashboard says so
          worldService.clearLastLocation(worldId)
          navigate('/dashboard', { replace: true, state: { notice: "That world isn't in your atlas — it may have been deleted, or it belongs to another account." } })
          return
        }
        setWorldErr(errText(e, "Couldn't load this world"))
      })
      .finally(() => { if (live) setWorldLoading(false) })
    return () => { live = false }
  }, [worldId, worldTick]) // eslint-disable-line

  useEffect(() => {
    setSelId(null)
    setStray(null)
    setPlacing(null)
    setCtx(null)
    setFocusExpand(false)
    // an outline in progress, an open dialog and the legend's filter belong to the map they
    // were started on: none of them follows the DM to another map
    setDrawing(null); setHiddenCats(new Set()); setBdsOpen(false); setFocusEdit(null); setRenaming(null); setConfirmDel(null); setConfirmInterior(null)
    loadMap(true).then(() => {
      if (pendingSelect.current) { setSelId(pendingSelect.current); pendingSelect.current = null }
      // a footstep jump moves the lens only once the destination map is in hand
      if (pendingNow.current != null) { setLens(pendingNow.current); pendingNow.current = null }
    })
  }, [mapId]) // eslint-disable-line
  useEffect(() => { if (inspEl.current) inspEl.current.scrollTop = 0 }, [selId, stray?.id])
  // a selection made from afar is framed once its placement is in hand
  useEffect(() => {
    if (frameNext.current == null || selId !== frameNext.current) return
    const p = mapData?.placements.find((pp) => pp.id === selId)
    if (!p) return
    frameNext.current = null
    setFrameReq({ x: p.x, y: p.y, key: Date.now() })
  }, [selId, mapData])
  const pendingNow = useRef(null)
  // Go to a moment on a map: same map → move the lens; another map → travel first, then
  // set the lens after it loads, so no render ever mixes the old map with the new moment.
  const goToMoment = (t, targetMapId, placementId = null) => {
    if (targetMapId == null || String(targetMapId) === String(mapId)) { setLens(t); if (placementId != null) { setSelId(placementId); frame(placementId) } return }
    pendingNow.current = t
    if (placementId != null) { pendingSelect.current = placementId; frameNext.current = placementId } // the footstep stays open on the other map, in view
    navigate(`/w/${worldId}/m/${targetMapId}`)
  }

  useEffect(() => {
    const el = trackRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setTrackW(el.clientWidth || 600))
    ro.observe(el); setTrackW(el.clientWidth || 600)
    return () => ro.disconnect()
  }, [world?.timeline?.enabled, mode]) // eslint-disable-line — `tl` is derived further down; read the world directly
  const sel = mapData?.placements.find((p) => p.id === selId) || null
  const map = mapData?.map
  const [ambText, setAmbText] = useState('') // the ambience prompt box, seeded from the map
  useEffect(() => { setAmbText(map?.ambiencePrompt || '') }, [map?.id, map?.ambiencePrompt]) // eslint-disable-line
  const isList = map?.view === 'list'
  // the node the inspector is about: a placement's node, or a stray opened on its own
  const fn = sel ? sel.node : stray
  focusIdRef.current = fn?.id ?? null
  useEffect(() => { if (selId != null) setStray(null) }, [selId])
  useEffect(() => { document.title = `${map?.title ? `${map.title} · ` : ''}${world?.name || 'Fantasy Map Timeline'}`; return () => { document.title = 'Fantasy Map Timeline' } }, [map?.title, world?.name])
  useDismiss(tlEdit, [], () => setTlEdit(false), { keep: '.tlcfg, .tcfg' })
  // the server's map notes changed under the box (a Forge recap, another tab): a box the DM
  // is not typing in takes the new text, so a bare click in and out never writes old text back
  useEffect(() => {
    const el = noteRef.current
    if (!el || !map) return
    if (pendingNote.current || document.activeElement === el) return
    if (el.value !== (map.dmNote || '')) setNoteVer((v) => v + 1)
  }, [map?.id, map?.dmNote]) // eslint-disable-line
  // The table moves while the DM's tab sits still: players drop markers, the Forge lands
  // things, another tab edits. Every 45 s (players poll at the same pace) a visible, quiet
  // tab refreshes the map and the world — never while something is being dragged, drawn,
  // typed or confirmed, so no box goes stale under the DM's hands.
  quietRef.current = !drawing && !placing && !ctx && !confirmDel && !confirmInterior && !picker && !nodePicker && renaming == null && !focusEdit && !bdsOpen && !tlEdit
  useEffect(() => {
    if (!mapId) return
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible' || !quietRef.current || dragRef.current) return
      if (pendingPatch.current.nodeId != null || pendingLife.current || pendingNote.current || inflight.current > 0) return
      refreshMap(); refreshWorldMeta()
    }, 45000)
    return () => clearInterval(id)
  }, [mapId]) // eslint-disable-line

  // ---- links ---------------------------------------------------------------------
  const reloadNodeDetail = (nodeId) =>
    atlasService.getNode(nodeId).then((d) => setNodeDetail({ out: d.links, in: d.backlinks, facts: d.facts || [] })).catch(() => {})
  useEffect(() => {
    const fid = sel?.node.id ?? stray?.id
    if (!fid) { setNodeDetail({ out: [], in: [], facts: [] }); return }
    let live = true
    atlasService.getNode(fid).then((d) => { if (live) setNodeDetail({ out: d.links, in: d.backlinks, facts: d.facts || [] }) }).catch(() => {})
    return () => { live = false }
  }, [selId, stray?.id]) // eslint-disable-line
  const addLink = async (toId) => {
    setNodePicker(null)
    const fid = focusIdRef.current
    if (!fid) return
    await track(atlasService.addLink({ from_node_id: fid, to_node_id: toId }), "Couldn't link").catch(() => {})
    reloadNodeDetail(fid)
  }
  const removeLink = async (id) => {
    const r = await track(atlasService.deleteLink(id), "Couldn't remove the link").catch(() => null)
    if (focusIdRef.current) reloadNodeDetail(focusIdRef.current)
    if (r) setFlash({ kind: 'ok', text: 'Thread removed', undoId: r.undoId })
  }
  const labelLink = async (id, label) => {
    await track(atlasService.patchLink(id, { label }), "Couldn't save the label").catch(() => {})
    if (focusIdRef.current) reloadNodeDetail(focusIdRef.current)
  }
  // A node with no placement (or an orphaned interior's owner) opens in the inspector on its
  // own — editable, placeable here, deletable — instead of a dead-end flash.
  const openStray = async (nodeId) => {
    const d = await atlasService.getNode(nodeId).catch(() => null)
    if (!d?.node) { setFlash({ kind: 'err', text: "Couldn't open that node." }); return }
    setSelId(null); setStray(d.node); setInspOpen(true)
    if (mode !== 'edit') setMode('edit')
  }
  const jump = async (nodeId) => {
    let loc
    try { loc = await atlasService.locateNode(nodeId, mapId) } catch (e) {
      // a failed lookup is a failure, not "unplaced" — never invite a second placement
      setFlash({ kind: 'err', text: e?.response?.status === 404 ? 'That entry no longer exists' : "Couldn't find where that is — try again." })
      return
    }
    if (!loc || !loc.mapId) { openStray(nodeId); return }
    // the thing is SHOWN — its pin, framed, story open; ◎ is the explicit way inside
    if (String(loc.mapId) === String(mapId)) { if (loc.placementId) { setSelId(loc.placementId); frame(loc.placementId) } return }
    if (loc.placementId) { pendingSelect.current = loc.placementId; frameNext.current = loc.placementId }
    navigate(`/w/${worldId}/m/${loc.mapId}`)
  }
  const placeStrayHere = (node) => placeExisting(node, 50, 50)
  const removeOrphanSpace = async (ownerId) => {
    const d = await atlasService.getNode(ownerId).catch(() => null)
    if (!d?.node) { setFlash({ kind: 'err', text: "Couldn't find this map's entry" }); return }
    askRemoveInterior(d.node)
  }

  // ---- node & placement actions ----------------------------------------------------
  const dropNode = (x, y, shape = null, kind = 'area') => once('drop', async () => {
    setPlacing(null) // one drop per click, even on a slow network
    const r = await track(atlasService.addNode(mapId, { x, y, ...(shape ? { shape, shape_kind: kind } : {}) }), "Couldn't add the node").catch(() => null)
    if (!r) return
    justCreated.current = r.placementId
    await refreshMap(); refreshTree(); setSelId(r.placementId)
    if (isList) setFlash({ kind: 'ok', text: 'Added a row to this list — its name is ready to type.' })
  })
  const placeExisting = (node, x, y) => once('drop', async () => {
    setPlacing(null)
    if (node.category === 'party') return partyMoveHere(x, y)
    const r = await track(atlasService.placeNode(mapId, { node_id: node.id, x, y }), "Couldn't place it").catch(() => null)
    if (!r) return
    await refreshMap(); setSelId(r.placementId)
    setFlash({ kind: 'ok', text: `“${node.title}” placed here — the same entry, another spot` })
  })
  // ---- the Party's next footstep --------------------------------------------------
  // One click moves the table: the live footstep ends at the lens moment, a new one starts
  // at the click (one moment later if the live step began right now), the clock grows if it
  // must, and the lens and selection follow. Footsteps are recorded, never re-dragged.
  const partyMoveHere = (x, y) => once('party', async () => {
    if (!tl?.enabled) { setFlash({ kind: 'info', text: 'Footsteps need the clock — turn the timeline on first (⚙ on the timebar)' }); return }
    let partyId = trail.find((st) => st.nodeId)?.nodeId
    if (!partyId) {
      const all = await atlasService.getNodes(worldId).catch(() => [])
      partyId = (all || []).find((n) => n.category === 'party')?.id
    }
    if (!partyId) { setFlash({ kind: 'info', text: 'There is no Party entry yet — make one with the ⚑ The party category, then place it' }); return }
    const t = Math.round(lens)
    const at = (v) => (v == null ? -Infinity : v)
    const live = trail.filter((st) => st.nodeId === partyId && isPresent(st, t)).sort((a, b) => at(b.start) - at(a.start))[0]
    const startAt = live && at(live.start) === t ? t + 1 : t
    try {
      if (live && (live.end == null || live.end >= startAt)) await track(atlasService.patchPlacement(live.id, { end_time: startAt - 1 }), "Couldn't close the last footstep")
      if ((tl.max ?? 0) < startAt) await track(atlasService.patchWorld(worldId, { timeline_max_time: startAt }), "Couldn't grow the clock")
      const r = await track(atlasService.placeNode(mapId, { node_id: partyId, x, y, start_time: startAt, end_time: null }), "Couldn't record the footstep")
      setTrailTick((v) => v + 1)
      await refreshWorldMeta()
      await refreshMap()
      setLens(startAt); setSelId(r.placementId)
      const so = sessionOf(startAt, world?.eras)
      setFlash({ kind: 'ok', text: `The party moves here — ${so ? sessionLabel(so, tl.unit) : `${tl.unit} ${startAt}`}` })
    } catch (e) { /* track already told the DM */ }
  })
  // a placement of a shared node can be hidden on ONE map (the Forge's extra placements are born so)
  const setPlacementVis = (placementId, hidden) => {
    const v = hidden ? 'dm' : 'shared'
    setMapData((d) => d && ({ ...d, placements: d.placements.map((pp) => (pp.id === placementId ? { ...pp, visibility: v } : pp)) }))
    track(atlasService.patchPlacement(placementId, { visibility: v }), "Couldn't change who sees it here").catch(() => {})
  }
  // ---- outlines: trace a region of the art so the feature itself becomes the button ----
  // placementId null = outline first, then a new place is born from it (anchor at the centroid)
  const startOutline = (placementId, firstPt) => {
    setPlacing(null); setCtx(null)
    const cur = mapData?.placements.find((p) => p.id === placementId)
    // one rule: the outline's own kind when it already has one, else the remembered choice
    const kind = (cur?.shape && cur.shapeKind) || readPref('atlas_outline_kind') || 'button'
    setDrawing({ placementId, pts: firstPt ? [firstPt] : [], kind })
  }
  const setDrawKind = (kind) => { writePref('atlas_outline_kind', kind); setDrawing((d) => d && ({ ...d, kind })) }
  const setOutlineKind = async (placementId, kind) => { // a preset: sets the kind and clears the toggles
    setMapData((prev) => prev && ({ ...prev, placements: prev.placements.map((pp) => (pp.id === placementId ? { ...pp, shapeKind: kind, shapeStyle: null } : pp)) }))
    await track(atlasService.patchPlacement(placementId, { shape_kind: kind, shape_style: null }), "Couldn't change the outline's kind").catch(() => {})
  }
  const setOutlineStyle = async (placementId, style) => {
    setMapData((prev) => prev && ({ ...prev, placements: prev.placements.map((pp) => (pp.id === placementId ? { ...pp, shapeStyle: style } : pp)) }))
    await track(atlasService.patchPlacement(placementId, { shape_style: style }), "Couldn't change the outline's style").catch(() => {})
  }
  const finishOutline = async () => {
    const d = drawing
    if (!d) return
    if (d.pts.length < 3) { setFlash({ kind: 'info', text: 'An outline needs at least three corners — keep clicking, or drag to trace' }); return }
    const pts = cleanRing(d.pts)
    if (pts.length < 3) { setFlash({ kind: 'info', text: 'That outline is too small to keep — trace a larger area' }); return }
    setDrawing(null)
    if (d.placementId) {
      const cur = mapData?.placements.find((pp) => pp.id === d.placementId)
      const old = cur?.shape ? { shape: cur.shape, kind: cur.shapeKind || 'area', style: cur.shapeStyle || null, x: cur.x, y: cur.y } : null
      // the name anchor moves onto the shape; a new kind starts from its preset (the old toggles were for the old kind)
      const [ax, ay] = centroid(pts)
      const patch = { shape: pts, shape_kind: d.kind, x: ax, y: ay, ...(cur && (cur.shapeKind || 'area') !== d.kind ? { shape_style: null } : {}) }
      const ok = await track(atlasService.patchPlacement(d.placementId, patch), "Couldn't save the outline").then(() => true).catch(() => false)
      if (!ok) return
      await refreshMap(); setSelId(d.placementId)
      if (old) setFlash({ kind: 'ok', text: 'Outline redrawn', undo: () => restoreOutline(d.placementId, old) })
    } else {
      const [cx, cy] = centroid(pts)
      await dropNode(cx, cy, pts, d.kind)
    }
  }
  const restoreOutline = (placementId, old) => // the old ring, kind, style and anchor go back as they were
    track(atlasService.patchPlacement(placementId, { shape: old.shape, shape_kind: old.kind, shape_style: old.style, ...(old.x != null ? { x: old.x, y: old.y } : {}) }), "Couldn't put the outline back")
      .then(() => refreshMap()).catch(() => {})
  const clearOutline = async (placementId) => {
    const cur = mapData?.placements.find((pp) => pp.id === placementId)
    const old = cur?.shape ? { shape: cur.shape, kind: cur.shapeKind || 'area', style: cur.shapeStyle || null } : null
    const ok = await track(atlasService.patchPlacement(placementId, { shape: null, shape_kind: null, shape_style: null }), "Couldn't remove the outline").then(() => true).catch(() => false)
    if (!ok) return
    await refreshMap()
    if (old) setFlash({ kind: 'ok', text: 'Outline removed — back to a plain pin', undo: () => restoreOutline(placementId, old) })
  }
  // the API speaks snake_case, the map payload camelCase: translate so a saved DM note
  // (dm_note) lands on p.node.dmNote — the key every reader and the reseeded inspector use
  const CAMEL = { dm_note: 'dmNote', pin_size: 'pinSize', image_id: 'imageId', voice_id: 'voiceId', voice_name: 'voiceName', voice_style: 'voiceStyle', voice_line: 'voiceLine', voice_url: 'voiceUrl' }
  const localPatchNode = (nodeId, patch) => {
    const local = {}
    for (const [k, v] of Object.entries(patch)) if (k !== 'reveal') local[CAMEL[k] || k] = v
    setMapData((d) => d && ({
      ...d, placements: d.placements.map((p) => (p.node.id === nodeId ? { ...p, node: { ...p.node, ...local } } : p)),
    }))
    setStray((s) => (s && s.id === nodeId ? { ...s, ...local } : s))
  }

  // Debounced autosave with a MERGED pending patch: rapid edits to two fields used to
  // overwrite each other's timer payload, silently dropping the first field's save.
  // A save the server refuses is never dropped either: it waits under anything typed since
  // and is retried, and the chip stays on "Not saved" until it lands.
  const scheduleRetry = useCallback(() => {
    clearTimeout(retryTimer.current)
    retryTimer.current = setTimeout(() => {
      for (const [nodeId, patch] of [...failedPatches.current]) {
        failedPatches.current.delete(nodeId)
        track(atlasService.patchNode(nodeId, patch), "Still couldn't save — will keep trying")
          .catch((e) => {
            if (refused(e)) { loadMap(false); return } // the server said what was wrong: the stored value comes back
            failedPatches.current.set(nodeId, { ...patch, ...(failedPatches.current.get(nodeId) || {}) }); scheduleRetry()
          })
      }
    }, 5000)
  }, [track, loadMap])
  const flushSave = useCallback(() => {
    const { nodeId, patch } = pendingPatch.current
    if (nodeId == null) return Promise.resolve()
    pendingPatch.current = { nodeId: null, patch: {} }
    return track(atlasService.patchNode(nodeId, patch), "Couldn't save — will retry").catch((e) => {
      if (refused(e)) { loadMap(false); return } // refused for what it is (too long, not a kind): back to the stored value, no retry
      failedPatches.current.set(nodeId, { ...(failedPatches.current.get(nodeId) || {}), ...patch })
      scheduleRetry()
    })
  }, [track, scheduleRetry, loadMap])
  // an interior still named after its node follows a rename (the server applies the same
  // rule): the tree row and the crumb change with the pin instead of on the next load
  const renameInteriorLocally = (nodeId, title) => {
    const node = mapData?.placements.find((pp) => pp.node.id === nodeId)?.node || (stray?.id === nodeId ? stray : null)
    if (!node?.interiorMapId || !node.title || node.title === title) return
    const { interiorMapId, title: old } = node
    setTree((t) => t.map((m) => (m.id === interiorMapId && m.title === old ? { ...m, title } : m)))
    setMapData((d) => d && ({ ...d, breadcrumb: (d.breadcrumb || []).map((b) => (b.mapId === interiorMapId && b.title === old ? { ...b, title } : b)) }))
  }
  const saveNode = (nodeId, patch) => {
    if (typeof patch.title === 'string') renameInteriorLocally(nodeId, patch.title)
    localPatchNode(nodeId, patch)
    const f = failedPatches.current.get(nodeId) // a newer edit of a field beats its refused older value
    if (f) { for (const k of Object.keys(patch)) delete f[k]; if (!Object.keys(f).length) failedPatches.current.delete(nodeId) }
    if (pendingPatch.current.nodeId != null && pendingPatch.current.nodeId !== nodeId) flushSave()
    pendingPatch.current = { nodeId, patch: { ...pendingPatch.current.patch, ...patch } }
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(flushSave, 500)
  }
  // lifespans and map notes have their own clocks and their own pending payloads
  const flushLife = useCallback(() => {
    const pl = pendingLife.current
    if (!pl) return Promise.resolve()
    pendingLife.current = null
    return track(atlasService.patchPlacement(pl.placementId, pl.patch), "Couldn't save the lifespan — will retry")
      .then(() => setTrailTick((t) => t + 1))
      .catch((e) => {
        if (refused(e)) { loadMap(false); return } // a reversed or non-whole bound: the stored lifespan comes back
        // the failed bounds wait under anything typed since, and are retried
        const cur = pendingLife.current
        pendingLife.current = cur && cur.placementId === pl.placementId ? { placementId: pl.placementId, patch: { ...pl.patch, ...cur.patch } } : (cur || pl)
        clearTimeout(lifeTimer.current); lifeTimer.current = setTimeout(flushLife, 5000)
      })
  }, [track, loadMap])
  const flushNote = useCallback(() => {
    const pn = pendingNote.current
    if (!pn) return Promise.resolve()
    pendingNote.current = null
    return track(atlasService.patchMap(pn.mapId, { dm_note: pn.note }), "Couldn't save the map notes — will retry")
      .then(() => setMapData((d) => (d && d.map?.id === pn.mapId) ? { ...d, map: { ...d.map, dmNote: pn.note } } : d))
      .catch((e) => { if (refused(e)) return; pendingNote.current = pendingNote.current || pn; clearTimeout(noteTimer.current); noteTimer.current = setTimeout(flushNote, 5000) })
  }, [track])
  const saveMapNote = (mapIdNow, note) => {
    if (mapIdNow == null) return
    pendingNote.current = { mapId: mapIdNow, note }
    clearTimeout(noteTimer.current)
    noteTimer.current = setTimeout(flushNote, 600)
  }
  const flushAll = useCallback(() => { flushSave(); flushLife(); flushNote() }, [flushSave, flushLife, flushNote])
  useEffect(() => () => { clearTimeout(saveTimer.current); clearTimeout(lifeTimer.current); clearTimeout(noteTimer.current); flushAll() }, [flushAll]) // flush on unmount
  // leaving the page (reload, Back, tab close) flushes what is pending with keepalive fetches
  useEffect(() => {
    const flushBeacon = () => {
      const token = localStorage.getItem('auth_token')
      const send = (url, body) => { try { fetch(url, { method: 'PATCH', keepalive: true, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }) } catch (e) { /* best effort */ } }
      const p = pendingPatch.current
      if (p.nodeId != null) { send(`/api/atlas/nodes/${p.nodeId}`, p.patch); pendingPatch.current = { nodeId: null, patch: {} } }
      for (const [nodeId, patch] of failedPatches.current) send(`/api/atlas/nodes/${nodeId}`, patch)
      const pl = pendingLife.current
      if (pl) { send(`/api/atlas/placements/${pl.placementId}`, pl.patch); pendingLife.current = null }
      const pn = pendingNote.current
      if (pn) { send(`/api/atlas/maps/${pn.mapId}`, { dm_note: pn.note }); pendingNote.current = null }
    }
    window.addEventListener('pagehide', flushBeacon)
    return () => window.removeEventListener('pagehide', flushBeacon)
  }, [])
  // a session that dies mid-edit: stash what is pending, and re-apply it on the next visit
  useEffect(() => {
    const stash = () => {
      const items = []
      const p = pendingPatch.current
      if (p.nodeId != null) items.push({ nodeId: p.nodeId, patch: p.patch })
      for (const [nodeId, patch] of failedPatches.current) items.push({ nodeId, patch })
      const pl = pendingLife.current; if (pl) items.push({ placementId: pl.placementId, patch: { start_time: pl.start, end_time: pl.end } })
      const pn = pendingNote.current; if (pn) items.push({ mapId: pn.mapId, patch: { dm_note: pn.note } })
      if (items.length) { try { localStorage.setItem('atlas_unsaved', JSON.stringify({ worldId, items, at: Date.now() })) } catch (e) { /* ignore */ } }
    }
    window.addEventListener('atlas:auth-expired', stash)
    return () => window.removeEventListener('atlas:auth-expired', stash)
  }, [worldId])
  useEffect(() => {
    let raw = null
    try { raw = localStorage.getItem('atlas_unsaved') } catch (e) { return }
    if (!raw) return
    let s
    try { s = JSON.parse(raw) } catch (e) { localStorage.removeItem('atlas_unsaved'); return }
    if (String(s.worldId) !== String(worldId)) return
    localStorage.removeItem('atlas_unsaved')
    const calls = s.items.map((it) => (it.nodeId != null ? atlasService.patchNode(it.nodeId, it.patch)
      : it.placementId != null ? atlasService.patchPlacement(it.placementId, it.patch)
        : atlasService.patchMap(it.mapId, it.patch)))
    track(Promise.all(calls), "Couldn't restore your unsaved edits")
      .then(() => { setFlash({ kind: 'ok', text: `Restored ${s.items.length} unsaved ${s.items.length === 1 ? 'edit' : 'edits'} from your last session` }); refreshMap() })
      .catch(() => {})
  }, [worldId]) // eslint-disable-line
  // Reveal happens on the server against the CURRENT text, so a stale tab can never wipe
  // a description typed elsewhere; the pending note is flushed first
  const revealNote = async (nodeId) => {
    await flushSave().catch(() => {})
    const r = await track(atlasService.patchNode(nodeId, { reveal: true }), "Couldn't reveal the note").catch(() => null)
    if (!r) return null
    localPatchNode(nodeId, { body: r.body, dm_note: '' })
    if (r.factId) { reloadNodeDetail(nodeId); setFlash({ kind: 'ok', text: 'Revealed into the period text players read at canon.' }) }
    else setFlash({ kind: 'ok', text: 'Revealed into the description — players read it now.' })
    return r
  }
  const once = (key, fn) => { // one click does one thing
    if (busy.current.has(key)) return Promise.resolve()
    busy.current.add(key)
    return Promise.resolve().then(fn).finally(() => busy.current.delete(key))
  }

  const openInterior = async (node) => {
    flushAll()
    if (node.interiorMapId) return navigate(`/w/${worldId}/m/${node.interiorMapId}`)
    // no interior: never invent one on a double-click — that is an explicit act in the inspector
    setFlash({ kind: 'info', text: `“${node.title}” has no interior — give it one from the editor (＋ Interior map)` })
  }
  const createInteriorAs = (node, view) => once(`interior:${node.id}`, async () => {
    const r = await track(atlasService.createInterior(node.id, view), "Couldn't create the interior").catch(() => null)
    if (!r) return
    refreshTree(); navigate(`/w/${worldId}/m/${r.mapId}`)
  })

  const factAdd = (nodeId) => once(`fact:${nodeId}`, () => {
    const cur = mapData?.placements.find((p) => p.node.id === nodeId)?.node
    const body = resolveFact(nodeDetail.facts, Math.round(lens)) ?? cur?.body ?? ''
    return track(atlasService.addFact(nodeId, { body, start_time: Math.round(lens), end_time: null }), "Couldn't add the entry")
      .then(() => reloadNodeDetail(nodeId)).catch(() => {})
  })
  const factPatch = (nodeId, id, data) =>
    track(atlasService.patchFact(id, data), "Couldn't save the entry").then(() => { reloadNodeDetail(nodeId); return true }).catch(() => false)
  const factDelete = (nodeId, id) =>
    track(atlasService.deleteFact(id), "Couldn't remove the entry")
      .then((r) => { reloadNodeDetail(nodeId); setFlash({ kind: 'ok', text: 'Period text removed', undoId: r?.undoId }) }).catch(() => {})

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
    if (mapData?.map?.ownerNodeId === node.id && world?.rootMapId) navigate(`/w/${worldId}/m/${world.rootMapId}`) // we were standing in it
    setFlash({ kind: 'ok', text: `“${node.title}” no longer has an interior map — the entry itself is untouched`, undoId: r.undoId })
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
    setSelId(null); setStray((s) => (s && s.id === node.id ? null : s)); refreshMap(); refreshTree()
    if (world?.spotlightNodeId === node.id) setWorld((w) => ({ ...w, spotlightNodeId: null })) // the lantern went out with it
    setFlash({ kind: 'ok', text: `“${node.title}” deleted`, undoId: r.undoId })
  }
  const removeFromMap = async (p) => {
    const r = await track(atlasService.deletePlacement(p.id), "Couldn't remove it").catch(() => null)
    if (!r) return
    setSelId(null); refreshMap()
    setFlash({ kind: 'ok', text: `“${p.node.title}” removed from this map — the entry still exists`, undoId: r.undoId })
  }

  // ---- images -----------------------------------------------------------------------
  const setNodeImage = (nodeId, imageId, imageUrl) => {
    const cur = (mapData?.placements || []).find((pp) => pp.node.id === nodeId)?.node || (stray?.id === nodeId ? stray : null)
    const prev = cur ? { id: cur.imageId ?? null, url: cur.imageUrl || null } : null
    localPatchNode(nodeId, { imageUrl: imageUrl || null, imageId: imageId ?? null })
    track(atlasService.patchNode(nodeId, { image_id: imageId })).catch(() => {})
    if (imageId == null && prev?.id != null) setFlash({ kind: 'ok', text: 'Image removed from the node — it stays in the Archive.', undo: () => setNodeImage(nodeId, prev.id, prev.url) })
  }
  const setBackdrop = (imageId) => {
    const prev = map?.imageId ?? null // removing the base art can be undone from the toast
    return track(atlasService.patchMap(mapId, { image_id: imageId }), "Couldn't set the backdrop")
      .then(() => { refreshMap(); refreshTree(); if (imageId == null && prev != null) setFlash({ kind: 'ok', text: 'Backdrop removed', undo: () => setBackdrop(prev) }) })
      .catch(() => {})
  }
  const handlePick = (imageId, imageUrl) => {
    const pk = picker; setPicker(null); if (!pk) return
    if (pk.kind === 'backdrop') setBackdrop(imageId)
    else if (pk.kind === 'backdrop-timed') { if (imageId) addTimedBackdrop(imageId) }
    else if (pk.kind === 'backdrop-row') { if (imageId) patchBackdrop(pk.rowId, { image_id: imageId }) }
    else if (pk.nodeId) setNodeImage(pk.nodeId, imageId, imageUrl)
  }

  const toggleLabels = () => setLabelsOn((v) => !v)
  const toggleGrid = () => setGridOn((v) => !v)

  // Timed backdrops: history can redraw the map. The active art at moment t is the timed
  // row covering t with the LATEST start (ties: newest row); none covering t = the base.
  const addTimedBackdrop = (imageId) =>
    track(atlasService.addBackdrop(mapId, { image_id: imageId, start_time: Math.round(lens), end_time: null }),
      "Couldn't add the backdrop").then(refreshMap).catch(() => {})
  const patchBackdrop = (id, data) => // resolves false when refused, so the row can go back to the stored bounds
    track(atlasService.patchBackdrop(id, data), "Couldn't save the backdrop").then(() => { refreshMap(); return true }).catch(() => false)
  const deleteBackdrop = (id) =>
    track(atlasService.deleteBackdrop(id), "Couldn't remove the backdrop")
      .then((r) => { refreshMap(); setFlash({ kind: 'ok', text: 'Period art removed', undoId: r?.undoId }) }).catch(() => {})

  const setMapView = (view) => {
    if (!map || map.view === view) return
    setMapData((d) => d && ({ ...d, map: { ...d.map, view } }))
    track(atlasService.patchMap(mapId, { view }), "Couldn't switch the view").catch(() => refreshMap())
  }

  // ---- reveal + timeline: the scrubber is a LENS (local); players see the CANON moment,
  // which only moves when the DM explicitly sets it.
  const tl = world?.timeline
  const canon = tl?.current ?? 0
  const switchMode = (m) => {
    setMode(m)
    setPlacing(null); setPicker(null); setNodePicker(null); setTlEdit(false); setMapMenu(false)
    setDrawing(null); setCtx(null); setBdsOpen(false); setFocusEdit(null); setRenaming(null) // edit-only tools end with the posture
    writePref('atlas_mode', m)
  }
  const toggleRail = () => setRailOpen((v) => !v)
  const toggleInsp = () => setInspOpen((v) => !v)

  // drag the tree's right edge, twin of the editor handle
  const startRailResize = railCol.start, resetRailW = railCol.reset
  // the Forge column sits to the editor's right: its width offsets the editor's edge
  const startInspResize = (e) => inspCol.start(e, { offset: forgeOn && forgeOpen ? forgeW : 0 })
  const resetInspW = inspCol.reset
  const startForgeResize = forgeCol.start, resetForgeW = forgeCol.reset
  // the reader has no stored width until it is dragged: the drag starts from its rendered width
  const startReaderResize = (e) => readerPane.start(e, { from: e.currentTarget.parentElement?.getBoundingClientRect().width ?? 400 })
  const resetReaderW = readerPane.reset
  const readerCol = readerW && wide ? `${readerW}px` : 'var(--readerw)'
  const readerGrip = (
    <div className="rgrip" title="Drag to widen the reader — double-click resets"
      onPointerDown={startReaderResize} onDoubleClick={resetReaderW} />
  )

  // presence is judged by the DM's lens (players' presence is the server's business)
  const presentAt = (p, t) => !tl?.enabled || isPresent(p, t)
  const present = (p) => presentAt(p, lens)
  const setCanonHere = () => {
    track(atlasService.patchWorld(worldId, { timeline_current_time: lens }), "Couldn't set the canon moment")
      .then(() => {
        setWorld((w) => w && ({ ...w, timeline: { ...w.timeline, current: lens } }))
        setFlash({ kind: 'ok', text: `Canon moment set to ${momentLabel(lens, world?.eras, tl.unit)} — that's what players now see.` })
      }).catch(() => {})
  }
  const refreshWorldMeta = () => atlasService.getWorld(worldId).then(setWorld).catch(() => {})
  const eraAdd = () => once('era', () => track(atlasService.addEra(worldId, { name: 'New era', start_time: tl.min, end_time: canon }), "Couldn't add the era"))
    .then(refreshWorldMeta).catch(() => {})
  const eraPatch = (id, data) => track(atlasService.patchEra(id, data), "Couldn't save the era").then(() => { refreshWorldMeta(); return true }).catch(() => false)
  const eraDelete = (id) => track(atlasService.deleteEra(id), "Couldn't delete the era")
    .then((r) => { refreshWorldMeta(); setFlash({ kind: 'ok', text: 'Era deleted — players lose that stretch of the past', undoId: r?.undoId }) }).catch(() => {})
  // Sessions are eras of ten footsteps; the next one starts where the last ended and the
  // timeline grows to hold it — so the latest session is always the end of the clock.
  const nextSession = () => once('session', async () => {
    const eras = world?.eras || []
    // the next session follows the LAST SESSION (lore eras don't count), numbered past the highest
    const sessions = eras.filter((e) => sessionNum(e) != null)
    const last = sessions.length ? Math.max(...sessions.map((e) => e.end)) : (tl?.max ?? 0)
    const n = Math.max(0, ...sessions.map((e) => sessionNum(e))) + 1
    const start = last + 1, end = last + 10
    const one = tl?.unit ? tl.unit.replace(/s$/i, '') : 'moment'
    try {
      await track(atlasService.addEra(worldId, { name: `Session ${n}`, start_time: start, end_time: end, player_visible: true }), "Couldn't start the next session")
      if ((tl?.max ?? 0) < end) await track(atlasService.patchWorld(worldId, { timeline_max_time: end }), "Couldn't grow the clock")
      await refreshWorldMeta()
      setFlash({ kind: 'ok', text: `Session ${n} begins at ${one} ${start} on the clock — set canon as the party moves` })
    } catch (e) { /* track already told the DM */ }
  })

  const enableTimeline = () => {
    // the clock survives being switched off: keep the stored range, unit and canon unless
    // this world never had one (the untouched schema defaults, and no eras)
    const t = world?.timeline
    // never set = nothing stored (the server keeps NULLs); a clock set then switched off comes back as it was
    const legacy = !t || t.min == null || t.max == null || !(t.min < t.max)
      || (t.min === 0 && t.max === 100 && t.current === 50 && (!t.unit || t.unit === 'years') && !(world?.eras || []).length)
    if (!legacy) {
      setWorld((w) => w && ({ ...w, timeline: { ...w.timeline, enabled: true } }))
      setLens(t.current ?? t.min)
      track(atlasService.patchWorld(worldId, { timeline_enabled: true })).catch(() => {})
    } else {
      // the table convention: footsteps, ten a session — "＋ Next session" then opens Session 1 at 10–19
      setWorld((w) => w && ({ ...w, timeline: { enabled: true, min: 0, max: 9, current: 0, unit: 'footsteps' } }))
      setLens(0)
      track(atlasService.patchWorld(worldId, {
        timeline_enabled: true, timeline_min_time: 0, timeline_max_time: 9, timeline_current_time: 0, timeline_time_unit: 'footsteps',
      })).catch(() => {})
    }
    setTlEdit(true)
  }
  const saveTimeline = (min, max, unit) => {
    if (!(min < max)) return
    // the lens is local and canon moves only through "Set canon": the server clamps canon
    // into the new range itself, so the lens is clamped here and never sent
    setWorld((w) => w && ({ ...w, timeline: { ...w.timeline, min, max, unit, current: Math.min(Math.max(w.timeline.current ?? min, min), max) } }))
    setLens((v) => Math.min(Math.max(v, min), max))
    setTlEdit(false)
    track(atlasService.patchWorld(worldId, { timeline_min_time: min, timeline_max_time: max, timeline_time_unit: unit })).catch(() => refreshWorldMeta())
  }
  const disableTimeline = () => {
    setWorld((w) => w && ({ ...w, timeline: { ...w.timeline, enabled: false } }))
    setTlEdit(false)
    track(atlasService.patchWorld(worldId, { timeline_enabled: false })).catch(() => refreshWorldMeta())
  }

  // ---- share link ----------------------------------------------------------------------
  const shareUrl = world?.shareToken ? `${window.location.origin}/p/${world.shareToken}` : null
  const shareOn = () => {
    const rotating = !!world?.shareToken
    return track(atlasService.createShare(worldId), "Couldn't create the link")
      .then(({ token }) => {
        setWorld((w) => w && ({ ...w, shareToken: token })); setCopied(false)
        setFlash({ kind: 'ok', text: rotating ? 'New link made — the old one no longer works; send this one to your players.' : 'Share link made — copy it and send it to your players.' })
      }).catch(() => {})
  }
  const shareOff = () => track(atlasService.deleteShare(worldId), "Couldn't turn it off")
    .then(() => { setWorld((w) => w && ({ ...w, shareToken: null })); setCopied(false); setFlash({ kind: 'info', text: "The share link is off — players' phones show it as inactive on their next refresh." }) }).catch(() => {})
  // breaking every player's link takes two clicks: the button asks, then acts, then times out
  const [shareAsk, setShareAsk] = useState(null) // 'regen' | 'off'
  useEffect(() => { if (!shareAsk) return; const t = setTimeout(() => setShareAsk(null), 4000); return () => clearTimeout(t) }, [shareAsk])
  const askShare = (what) => {
    if (shareAsk === what) { setShareAsk(null); if (what === 'regen') shareOn(); else shareOff(); return }
    setShareAsk(what)
  }
  const copyShare = () => {
    navigator.clipboard?.writeText(shareUrl).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    }).catch(() => setFlash({ kind: 'err', text: "Couldn't copy — select the link text instead." }))
  }
  useDismiss(sharePop, [shareRef], () => setSharePop(false))

  const setLifespan = (placementId, which, v) => {
    // only the bound that changed is sent, merged per placement: a second tab's stale copy
    // of the OTHER bound never travels, and a quick from-then-to keeps both
    const key = which === 'start' ? 'start_time' : 'end_time'
    const cur = mapData?.placements.find((pp) => pp.id === placementId)
    const st = which === 'start' ? v : cur?.start ?? null, en = which === 'end' ? v : cur?.end ?? null
    setMapData((d) => d && ({ ...d, placements: d.placements.map((pp) => (pp.id === placementId ? { ...pp, [which]: v } : pp)) }))
    if (pendingLife.current && pendingLife.current.placementId !== placementId) flushLife()
    const prev = pendingLife.current && pendingLife.current.placementId === placementId ? pendingLife.current.patch : {}
    pendingLife.current = { placementId, patch: { ...prev, [key]: v } }
    clearTimeout(lifeTimer.current)
    // a reversed pair is held, not sent: the DM is typing the start before the end (the
    // inspector says so); the merged patch goes once the bounds are in order
    if (st != null && en != null && st > en) return
    lifeTimer.current = setTimeout(flushLife, 500)
  }

  // ---- drag to reposition (math is against the world PLANE rect, which includes zoom).
  // Moves are coalesced through rAF: one React render per frame, not per pointer event.
  const dragRaf = useRef(0)
  const onDragMove = useCallback((e) => {
    const d = dragRef.current; if (!d) return
    d.lastX = clampPct(d.ox + ((e.clientX - d.sx) / d.rect.width) * 100)
    d.lastY = clampPct(d.oy + ((e.clientY - d.sy) / d.rect.height) * 100)
    if (Math.abs(e.clientX - d.sx) > 3 || Math.abs(e.clientY - d.sy) > 3) d.moved = true
    if (!dragRaf.current) {
      dragRaf.current = requestAnimationFrame(() => {
        dragRaf.current = 0
        const dd = dragRef.current
        if (!dd) return
        const shift = dd.shape ? dd.shape.map(([x, y]) => [clampPct(x + dd.lastX - dd.ox), clampPct(y + dd.lastY - dd.oy)]) : null
        setMapData((prev) => prev && ({ ...prev, placements: prev.placements.map((pp) => (pp.id === dd.id ? { ...pp, x: dd.lastX, y: dd.lastY, ...(shift ? { shape: shift } : {}) } : pp)) }))
      })
    }
  }, [])
  const onDragUp = useCallback(() => {
    const d = dragRef.current; dragRef.current = null
    window.removeEventListener('pointermove', onDragMove)
    window.removeEventListener('pointerup', onDragUp)
    if (!d) return
    if (d.moved) {
      // the queued frame no-ops once dragRef is null, so commit the final position here;
      // an outline rides along with its anchor
      const dx = d.lastX - d.ox, dy = d.lastY - d.oy
      const shape = d.shape ? d.shape.map(([x, y]) => [Math.round(clampPct(x + dx) * 100) / 100, Math.round(clampPct(y + dy) * 100) / 100]) : null
      setMapData((prev) => prev && ({ ...prev, placements: prev.placements.map((pp) => (pp.id === d.id ? { ...pp, x: d.lastX, y: d.lastY, ...(shape ? { shape } : {}) } : pp)) }))
      track(atlasService.patchPlacement(d.id, { x: d.lastX, y: d.lastY, ...(shape ? { shape } : {}) })).catch(() => {})
    } else setSelId(d.id)
  }, [onDragMove, track])
  const onPinDown = (e, p) => {
    if (e.pointerType === 'mouse' && e.button !== 0) { e.stopPropagation(); return } // only the primary button drags; the right one opens the pin's menu
    // read-only, and any touch: select, never drag — a swipe that starts on a pin must not rewrite the world
    if (mode !== 'edit' || e.pointerType === 'touch') { e.stopPropagation(); setSelId(p.id); return }
    if (placing) return // placing mode: let the press reach the plane so the click drops there
    e.stopPropagation()
    const rect = worldRef.current.getBoundingClientRect()
    dragRef.current = { id: p.id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, rect, moved: false, lastX: p.x, lastY: p.y, shape: p.shape || null }
    window.addEventListener('pointermove', onDragMove)
    window.addEventListener('pointerup', onDragUp)
  }

  // ---- global node search -----------------------------------------------------------
  const openSearch = () => {
    setSearchOpen(true)
    atlasService.getNodes(worldId).then(setNodeIndex).catch(() => {})
  }
  const closeSearch = () => { setSearchOpen(false); setQ(''); setSfilter('all') }
  useDismiss(searchOpen, [searchRef], closeSearch, { escape: false }) // Escape is the keyboard effect's
  // ---- keyboard placement ----------------------------------------------------------
  useEffect(() => {
    const move = (e) => { cursorRef.current = { x: e.clientX, y: e.clientY } }
    document.addEventListener('pointermove', move)
    return () => document.removeEventListener('pointermove', move)
  }, [])
  // Enter drops at the cursor when it's over the map; otherwise at the centre of the
  // visible map area (the plane∩viewport intersection, so a zoomed camera drops in view).
  const keyboardDropPoint = () => {
    const plane = worldRef.current
    if (!plane) return null
    const r = plane.getBoundingClientRect()
    if (!r.width || !r.height) return null
    const c = cursorRef.current
    let px, py
    if (c && c.x >= r.left && c.x <= r.right && c.y >= r.top && c.y <= r.bottom) {
      px = c.x; py = c.y
    } else {
      const vp = plane.parentElement.getBoundingClientRect()
      px = (Math.max(r.left, vp.left) + Math.min(r.right, vp.right)) / 2
      py = (Math.max(r.top, vp.top) + Math.min(r.bottom, vp.bottom)) / 2
    }
    return toPlanePct({ clientX: px, clientY: py }, plane)
  }

  useEffect(() => {
    const key = (e) => {
      const typing = /input|textarea|select/i.test(e.target.tagName)
      if (e.key === '/' && !typing) {
        e.preventDefault(); searchRef.current?.querySelector('input')?.focus()
      } else if (e.key === 'Escape') {
        // the nearest open thing closes first — a tool or a popover; with nothing open, the selection (and the reader)
        const open = placing || ctx || searchOpen || mapMenu || help || sharePop || tlEdit || drawing
        setPlacing(null); setCtx(null); closeSearch(); setMapMenu(false); setHelp(false); setSharePop(false); setTlEdit(false)
        if (!open && !typing) { setSelId(null); setStray(null) }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !typing && flash?.undoId) {
        e.preventDefault(); doUndo(flash.undoId) // the toast's ↩ Undo, from the keyboard
      }
      else if ((e.key === 'n' || e.key === 'N') && !typing && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && mode === 'edit' && !drawing) {
        // keyboard twin of "＋ Add entry"
        if (isList) dropNode(50, 50)
        else setPlacing((v) => (v?.kind === 'new' ? null : { kind: 'new' }))
      } else if (e.key === 'Enter' && !typing && !e.repeat && placing && mode === 'edit') {
        if (e.target?.closest?.('button, a, [role=button], select, [contenteditable]')) return // a focused control keeps its Enter
        e.preventDefault()
        const pt = keyboardDropPoint()
        if (!pt) return
        if (placing.kind === 'new') dropNode(pt.x, pt.y)
        else placeExisting(placing.node, pt.x, pt.y)
      }
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [mode, placing, isList, mapId, drawing, searchOpen, mapMenu, help, sharePop, tlEdit, flash]) // eslint-disable-line
  useEffect(() => {
    if (!drawing) return
    const key = (e) => {
      if (/input|textarea|select/i.test(e.target.tagName)) return
      if (e.target?.closest?.('button, a, [role=button], [contenteditable]')) return // the HUD's own buttons take Enter and Space
      if (e.key === 'Enter') { e.preventDefault(); finishOutline() }
      else if (e.key === 'Escape') setDrawing(null)
      else if (e.key === 'Backspace') { e.preventDefault(); setDrawing((d) => d && ({ ...d, pts: d.pts.slice(0, -1) })) }
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [drawing]) // eslint-disable-line
  const unplacedCount = useMemo(() => nodeIndex.filter((n) => n.placed === false).length, [nodeIndex])
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const pool = sfilter === 'unplaced' ? nodeIndex.filter((n) => n.placed === false) : nodeIndex
    // The Unplaced chip is a roster, not a search: it lists every stranded node even with no query.
    if (!needle) return sfilter === 'unplaced' ? pool : []
    return pool.filter((n) => (n.title || '').toLowerCase().includes(needle)).slice(0, 12)
  }, [q, nodeIndex, sfilter])

  const readerLinks = useMemo(() => [...(nodeDetail.out || []), ...(nodeDetail.in || [])], [nodeDetail])

  const renameMap = () => {
    const t = (renaming || '').trim().slice(0, 255)
    setRenaming(null)
    if (!t || !map || t === map.title) return
    setMapData((d) => d && ({ ...d, map: { ...d.map, title: t } }))
    track(atlasService.patchMap(mapId, { title: t }), "Couldn't rename").then(() => { refreshTree(); refreshMap() }).catch(() => refreshMap())
  }

  useDismiss(!!ctx, [], () => setCtx(null)) // the right-click menu: any press elsewhere closes it
  useDismiss(mapMenu || help, [mapMenuRef, helpRef], () => { setMapMenu(false); setHelp(false) })

  // ---- category legend / filter -------------------------------------------------------
  const legend = useMemo(() => {
    const counts = {}
    const seen = {} // one Party, however many footsteps it left here
    for (const p of mapData?.placements || []) { (seen[p.node.category] ||= new Set()).add(p.node.id) }
    for (const k of Object.keys(seen)) counts[k] = seen[k].size
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [mapData])
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
    if (!f || !map) { setFocusEdit(null); return }
    const st = wholeOr(f.start), en = wholeOr(f.end)
    // the modal stays open on a bad pair, so the DM can fix it in place
    if (st === undefined || en === undefined) { setFlash({ kind: 'err', text: 'A focus period is whole numbers on the clock' }); return }
    if (st != null && en != null && st > en) { setFlash({ kind: 'err', text: 'A focus period ends after it starts — swap the two' }); return }
    setFocusEdit(null)
    setMapData((d) => d && ({ ...d, map: { ...d.map, focusStart: st, focusEnd: en } }))
    track(atlasService.patchMap(mapId, { focus_start: st, focus_end: en }), "Couldn't save the focus period").catch(() => refreshMap())
  }

  const commitMoment = () => {
    const raw = String(momentEdit ?? '').trim()
    const v = Number(raw)
    setMomentEdit(null)
    if (raw === '' || !Number.isFinite(v) || !tl) return
    const t = Math.min(Math.max(Math.round(v), tl.min), tl.max)
    setLens(t)
    if (focusOk && !focusExpand && (t < fMin || t > fMax)) setFocusExpand(true) // typed outside the window: widen so the thumb shows
  }

  // the timed period whose art is on screen at the viewed moment (the latest-starting one
  // covering it wins), or null when the base art shows
  const activeBackdropRow = useMemo(() => (map && tl?.enabled ? pickCovering(mapData?.backdrops, lens) : null), [mapData, map, lens, tl?.enabled])
  const activeBackdropUrl = map ? (activeBackdropRow ? activeBackdropRow.url : map.backdropUrl) : null

  const regionAt = (e) => { const id = regionIdAt(e); return id == null ? null : (mapData?.placements.find((p) => p.id === id) || null) }
  const onWorldClick = (e, inside = true) => {
    if (drawing) return // the outline layer owns its own presses
    if (!placing) { const p = inside ? regionAt(e) : null; setSelId(p ? p.id : null); return } // a clean tap: a region selects, empty space (the letterbox too) deselects — a pan keeps the selection
    if (!inside || !worldRef.current) return // a drop needs the plane
    const { x, y } = toPlanePct(e, worldRef.current)
    if (placing.kind === 'new') dropNode(x, y)
    else placeExisting(placing.node, x, y)
  }
  const popCorner = () => setDrawing((d) => d && ({ ...d, pts: d.pts.slice(0, -1) })) // right-click while tracing: one corner back
  const onPinContext = (e, p) => {
    e.preventDefault(); e.stopPropagation()
    if (drawing) { popCorner(); return }
    setSelId(p.id)
    setCtx({ sx: Math.min(e.clientX, window.innerWidth - 230), sy: Math.min(e.clientY, window.innerHeight - 170), px: p.x, py: p.y, placementId: p.id })
  }
  const onWorldContext = (e) => {
    if (!worldRef.current) return
    const at = toPlanePct(e, worldRef.current)
    setCtx({
      sx: Math.min(e.clientX, window.innerWidth - 230), sy: Math.min(e.clientY, window.innerHeight - 110),
      px: at.x, py: at.y,
    })
  }

  // View is the DM's running surface: the reader stays open — the selected node's story
  // and notes, or the space's own notes when nothing is selected.
  const readerOpen = mode === 'view' && (wide || !!sel || spaceOpen) // a phone shows the map; the map's notes open on request
  const resolveFact = (facts, t) => coveringFact(facts, t)?.body ?? null // a blank period is no story yet — the base text stands
  // with the clock off there is no history: one party pin, the latest footstep on this map
  const latestParty = (() => { const at = (v) => (v == null ? -Infinity : v); let best = null; for (const p of (mapData?.placements || [])) if (p.node.category === 'party' && (!best || at(p.start) > at(best.start) || (at(p.start) === at(best.start) && p.id > best.id))) best = p; return best?.id ?? null })()
  const legendOn = !isList && legend.length > 1 // the category filter lives with its chips: a list or a one-kind map shows everything
  const visible = (p) =>
    (!legendOn || !hiddenCats.has(p.node.category)) &&
    (ghostsOn || !tl?.enabled || present(p))

  // ============================================================================= render ==
  if (worldLoading && !world) {
    return <div className="atlas"><div className="loading" style={{ gridRow: '1 / 3' }}>Loading…</div></div>
  }
  if (!world) {
    // the world did not load (a server blip, no network): a way to try again and a way out,
    // and no editor armed on nothing
    return (
      <div className="atlas">
        <div className="empty-map static worldgone" style={{ gridRow: '1 / 3' }}>
          <div style={{ fontSize: '2rem' }}>🌫️</div>
          <div>{worldErr || "This world isn't available right now."}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="tool on" onClick={() => setWorldTick((t) => t + 1)}>⟳ Try again</button>
            <Link className="tool" to="/dashboard">To your worlds</Link>
          </div>
        </div>
      </div>
    )
  }

  const saveChip = save === 'saving' ? { c: 'sv', t: 'Saving…' }
    : save === 'saved' ? { c: 'ok', t: '✓ Saved' }
    : save === 'err' ? { c: 'bad', t: '⚠ Not saved' } : null

  return (
    <div className={`atlas${labelsOn ? ' labelson' : ''}${drawing ? ' drawing' : ''}${placing ? ' placing' : ''}`}>
      <div className="top" role="banner">
        <h1 className="sr-only">{map?.title ? `${map.title} — ${world?.name}` : world?.name}</h1>
        <span className="brand"><Compass size={18} className="brandrose" />{' '}
              <select
                className="brandsel"
                value={pendingWorld ?? String(worldId)}
                title="Switch world"
                aria-label="Switch world"
                onFocus={() => {
                  if (worldList) return
                  worldService.getWorlds().then((r) => setWorldList(r.worlds || [])).catch(() => {})
                }}
                onKeyDown={(e) => { if (e.key.startsWith('Arrow')) viaKeys.current = true; else if (e.key === 'Enter' && pendingWorld != null && pendingWorld !== String(worldId)) { const w = pendingWorld; setPendingWorld(null); navigate(`/w/${w}`) } }}
                onChange={(e) => {
                  const id = e.target.value
                  // arrow keys browse the list; only a mouse pick, Enter or leaving the select moves world
                  if (viaKeys.current) { setPendingWorld(id); return }
                  if (id === String(worldId)) return
                  navigate(`/w/${id}`)
                }}
                onBlur={() => { viaKeys.current = false; if (pendingWorld != null && pendingWorld !== String(worldId)) { const w = pendingWorld; setPendingWorld(null); navigate(`/w/${w}`) } else setPendingWorld(null) }}
              >
                {(worldList || [{ id: worldId, name: world?.name || '…' }]).map((w) => (
                  <option key={w.id} value={String(w.id)}>{w.name}</option>
                ))}
              </select>
            </span>
        {mode !== 'player' && (
        <div className="crumbs">
          {(mapData?.breadcrumb || []).map((b, i, arr) => (
            <React.Fragment key={b.mapId}>
              {i > 0 && <span className="sep">▸</span>}
              {i === arr.length - 1
                ? <a className="here" role="button" tabIndex={0} title="Refresh this map" onClick={() => refreshMap()} onKeyDown={keyAct(() => refreshMap())}>{b.title}</a>
                : <a role="button" tabIndex={0} onClick={() => navigate(`/w/${worldId}/m/${b.mapId}`)} onKeyDown={keyAct(() => navigate(`/w/${worldId}/m/${b.mapId}`))}>{b.title}</a>}
            </React.Fragment>
          ))}
        </div>
        )}
        {mode !== 'player' && (
        <div className="gsearch" ref={searchRef}>
          <input
            placeholder="Find an entry… ( / )"
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
                      {n.placed === false && <span className="gorphan">○ Unplaced</span>}
                      {n.visibility === 'dm' && <span className="glock">🔒</span>}
                      {n.hasInterior && <span className="gopen">◎</span>}
                    </button>
                  ))}
                  {matches.length === 0 && (
                    <div className="gnone">{sfilter === 'unplaced' && !q.trim() ? 'No unplaced entries' : 'No entries named that'}</div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        )}
        {mode === 'edit' && saveChip && <span className={`savechip ${saveChip.c}`}>{saveChip.t}</span>}
        <div className="mode" title="Edit builds · View reads with DM eyes · Player shows what the share link shows">
          <button className={mode === 'edit' ? 'on' : ''} aria-pressed={mode === 'edit'} onClick={() => switchMode('edit')}>✏ Edit</button>
          <button className={mode === 'view' ? 'on' : ''} aria-pressed={mode === 'view'} onClick={() => switchMode('view')}>👁 View</button>
          <button className={mode === 'player' ? 'on' : ''} aria-pressed={mode === 'player'} onClick={() => switchMode('player')}>🎭 Player</button>
        </div>
        {mode === 'edit' && ( // invite*, not share*: ad-blocker social filters hide share-named elements (1224c84)
        <div ref={shareRef} className="invitewrap">
          <button className={`invitebtn ${world?.shareToken ? 'live' : ''}`} aria-expanded={sharePop} onClick={() => setSharePop((v) => !v)}>
            🔗 Share
          </button>
          {sharePop && (
            <div className="invitepop">
              {shareUrl ? (
                <>
                  <div className="surl">{shareUrl}</div>
                  <div className="srow">
                    <button className="tool on" onClick={copyShare}>{copied ? 'Copied ✓' : 'Copy link'}</button>
                    <button className={`tool ${shareAsk === 'regen' ? 'danger' : ''}`} onClick={() => askShare('regen')} title="Makes a new link; the old one stops working">
                      {shareAsk === 'regen' ? "Really? Players' current link stops working" : 'Regenerate'}</button>
                    <button className="tool danger" onClick={() => askShare('off')}>{shareAsk === 'off' ? "Really? Every player's link dies" : 'Turn off'}</button>
                  </div>
                  <div className="muted">{tl?.enabled ? `Players see shared entries at the canon moment (${momentLabel(canon, world?.eras, tl.unit)}). Scrubbing your timeline doesn't move them — “Set canon” does.` : 'Players see every shared entry — with no clock, nothing is hidden by time.'}</div>
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
        <Link to="/dashboard" className="exit">Exit</Link>
      </div>

      {mode === 'player' ? (
        // the Player posture IS the Player View: the share link, framed at the current map.
        // Secrecy, time and reach are decided by the same server code players hit.
        <div className="main m-player" role="main">
          {world?.shareToken
            ? <iframe className="pframe" title="What players see" src={`/p/${world.shareToken}/m/${mapId}`} />
            : (
              <div className="preview-off">
                <div className="pofcard">
                  <h2>No share link yet</h2>
                  <p>Players see this world only through its share link. Create one to see exactly what they would see.</p>
                  <button className="tool on" onClick={shareOn}>Create share link</button>
                </div>
              </div>
            )}
        </div>
      ) : (
      <div className={`main m-${mode}`}
        style={{ gridTemplateColumns:
          mode === 'view' ? `${railOpen ? `${railW}px ` : ''}1fr${readerOpen ? ` ${readerCol}` : ''}`
            : `${railOpen ? `${railW}px ` : ''}1fr${inspOpen ? ` ${inspW}px` : ''}${forgeOn && forgeOpen ? ` ${forgeW}px` : ''}` }}>
        {railOpen && (
          <div className="rail" role="navigation" aria-label="Maps">
            <h4>Maps</h4>
            <MapTree key={worldId} tree={tree} rootId={world?.rootMapId} mapId={mapId} worldId={worldId}
              onGo={(id) => (String(id) === String(mapId) ? refreshMap() : navigate(`/w/${worldId}/m/${id}`))} />
          </div>
        )}

        <div className="stagecol" role="main">
        <div className="stage">
          {(
            <button className="tool railtoggle" title={railOpen ? 'Hide the map tree' : 'Show the map tree'} aria-label={railOpen ? 'Hide the map tree' : 'Show the map tree'} aria-expanded={railOpen}
              onClick={toggleRail}>{railOpen ? '◂' : '☰'}</button>
          )}
          {mode === 'edit' && (
            <button className="tool insptoggle" title={inspOpen ? 'Hide the editor' : 'Show the editor'} aria-label={inspOpen ? 'Hide the editor' : 'Show the editor'} aria-expanded={inspOpen}
              onClick={toggleInsp}>{inspOpen ? '▸' : '✎'}</button>
          )}
          {loadState === 'err' && (
            <div className="empty-map">
              <div style={{ fontSize: '2rem' }}>🌫️</div>
              <div>Couldn't load this map.</div>
              <button className="tool on" onClick={() => loadMap(true)}>⟳ Try again</button>
            </div>
          )}
          {loadState === 'missing' && (
            <div className="empty-map gone">
              <div style={{ fontSize: '2rem' }}>🌫️</div>
              <div>This map no longer exists</div>
              {world?.rootMapId && String(world.rootMapId) !== String(mapId) && (
                <button className="tool on" onClick={() => navigate(`/w/${worldId}/m/${world.rootMapId}`)}>🗺 To the world map</button>
              )}
            </div>
          )}
          {loadState === 'loading' && <div className="loading" style={{ position: 'absolute', inset: 0 }}>Opening…</div>}

          {loadState === 'ok' && !isList && (
            <MapPlane
              mapKey={mapId}
              backdropUrl={activeBackdropUrl}
              worldRef={worldRef}
              onWorldClick={onWorldClick}
              focusAt={frameReq}
              onWorldContextMenu={mode === 'edit' ? (e) => (drawing ? popCorner() : onWorldContext(e)) : undefined}
              onWorldDoubleClick={(e) => { if (placing || drawing) return false; const p = regionAt(e); if (!p) return false; openInterior(p.node); return true }}
              dblZoom={!placing && !drawing}
              grid={gridOn}
            >
              <Regions backdropUrl={activeBackdropUrl} onEnter={(it) => openInterior(it.node)}
                items={(mapData?.placements || []).filter(visible).filter((p) => p.shape && p.node.category !== 'party').map((p) => ({
                  id: p.id, pts: p.shape, style: styleOf(p), x: p.x, y: p.y, title: p.node.title, node: p.node, selected: selId === p.id,
                  secret: p.visibility === 'dm' || p.node.visibility === 'dm', hasInterior: p.node.hasInterior,
                  cls: `${selId === p.id ? 'sel' : ''} ${tl?.enabled && !present(p) ? 'ghost' : ''} ${(p.visibility === 'dm' || p.node.visibility === 'dm') ? 'secret' : ''} ${world?.spotlightNodeId === p.node.id ? 'spot' : ''}`,
                }))}
                hoverId={hovId} onHover={setHovId}
                inert={!!placing}
                drawing={drawing}
                onDraw={{ add: (pts) => setDrawing((d) => d && ({ ...d, pts: [...d.pts, ...pts] })), finish: finishOutline }}
                onDragSelected={mode === 'edit' && !placing ? (e, id) => { const p = mapData?.placements.find((pp) => pp.id === id); if (p) onPinDown(e, p) } : undefined}
                onSelect={(it) => setSelId(it.id)} />
              {printsOn && tl?.enabled && !hiddenCats.has('party') && (
                <PartyTrail placements={mapData?.placements} t={lens} eras={world?.eras} unit={tl?.unit}
                  onStep={(st) => setLens(st)} />
              )}
              {(() => {
                const pins = (mapData?.placements || []).filter(visible).filter((p) => !p.shape || p.node.category === 'party').filter((p) => p.node.category !== 'party' || (tl?.enabled ? present(p) : p.id === latestParty))
                const off = stackOffsets(pins)
                return pins.map((p) => (
                <div key={p.id}
                  className={pinClass(p, { selected: selId === p.id, marker: p.node.visibility === 'player', extra: `${tl?.enabled && !present(p) ? 'ghost' : ''} ${(p.visibility === 'dm' || p.node.visibility === 'dm') ? 'secret' : ''} ${world?.spotlightNodeId === p.node.id ? 'spot' : ''}` })}
                  style={{ left: `${p.x}%`, top: `${p.y}%`, ...(off.get(p.id) ? { '--ox': `${off.get(p.id)[0]}px`, '--oy': `${off.get(p.id)[1]}px` } : {}), ...(p.node.category === 'party' ? { '--sc': sessionColor(sessionOf(p.start ?? lens, world?.eras)?.idx ?? 0, latestSession(world?.eras)) } : {}) }}
                  role="button" tabIndex={0} aria-label={`${p.node.title}${p.node.hasInterior ? ' (has an interior)' : ''}`}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelId(p.id) } }}
                  onPointerDown={(e) => onPinDown(e, p)}
                  onContextMenu={mode === 'edit' ? (e) => onPinContext(e, p) : undefined}
                  onDoubleClick={(e) => { e.stopPropagation(); openInterior(p.node) }}>
                  <PinBody node={p.node} />
                  {(p.node.visibility === 'dm' || p.visibility === 'dm') && <span className="lock" title={p.node.visibility === 'dm' ? 'DM only' : 'Hidden on this map — the node itself is shared'}>🔒</span>}
                  {p.node.hasInterior && <span className="open" aria-hidden="true">◎</span>}
                  {p.node.stance && <span className={`stb ${p.node.stance}`} title={`Stands as ${p.node.stance} to the party (your eyes only)`} />}
                  {p.node.category === 'party' && tl?.enabled && (() => { const so = sessionOf(p.start ?? lens, world?.eras); return so ? <span className="stag" title={sessionLabel(so, tl.unit)}>{stepTag(so)}</span> : null })()}
                </div>
                ))
              })()}
            </MapPlane>
          )}

          {loadState === 'ok' && isList && (
            <div className="listview">
              {mode === 'edit' && <div className="listhead muted">A list map: rows instead of pins.</div>}
              {(mapData?.placements || []).filter(visible).map((p) => (
                <div key={p.id}
                  className={`lsrow ${selId === p.id ? 'on' : ''} ${tl?.enabled && !present(p) ? 'ghost' : ''} ${(p.visibility === 'dm' || p.node.visibility === 'dm') ? 'secret' : ''}`}
                  role="button" tabIndex={0} aria-label={p.node.title} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelId(p.id) } }}
                  onClick={() => setSelId(p.id)}
                  onDoubleClick={() => openInterior(p.node)}>
                  <span className="ic" style={{ background: cat(p.node.category).c }}>{cat(p.node.category).i}</span>
                  <div className="lsbody">
                    <div className="lstitle">{p.node.title}
                      {p.node.visibility === 'dm' && <span className="lock" title="DM only"> 🔒</span>}
                    </div>
                    {p.node.body && <div className="lsdesc">{p.node.body}</div>}
                  </div>
                  {p.node.hasInterior && <span className="open" title="Has an interior" aria-hidden="true">◎</span>}
                </div>
              ))}
              {mapData && mapData.placements.length === 0 && (
                <div className="empty-map static">
                  <div style={{ fontSize: '2rem' }}>📜</div>
                  {mode === 'edit'
                    ? <div>Empty list. <b>＋ Add entry</b> adds the first row.</div>
                    : <div>Nothing here yet.</div>}
                </div>
              )}
            </div>
          )}

          {mode === 'edit' && loadState === 'ok' && (
            <div className="toolbar">
              <button className={`tool ${placing?.kind === 'new' ? 'on' : ''}`}
                title={isList ? 'Add a row to this list — DM-only until you reveal it' : 'Add an entry to this map — DM-only until you reveal it'}
                onClick={() => {
                  if (isList) dropNode(50, 50)
                  else setPlacing((v) => (v?.kind === 'new' ? null : { kind: 'new' }))
                }}>＋ Add entry</button>
              <button className={`tool ${placing?.kind === 'existing' ? 'on' : ''}`}
                title="Place an entry that already exists on this map too (one entry can stand on many maps)"
                onClick={() => setNodePicker('place')}>⤓ Place existing</button>
              {!isList && (
                <button className={`tool ${drawing ? 'on' : ''}`}
                  title={drawing ? 'Cancel the outline in progress' : 'Trace a feature of the art — a house, a district, a lake — and it becomes a clickable place'}
                  onClick={() => (drawing ? setDrawing(null) : startOutline(null))}>◌ Outline</button>
              )}
              <div className="mapmenu" ref={mapMenuRef}>
                <button className={`tool ${mapMenu ? 'on' : ''}`} title="This map: backdrop, name, map or list view" aria-haspopup="menu" aria-expanded={mapMenu}
                  onClick={() => setMapMenu((v) => !v)}>Map ▾</button>
                {mapMenu && (
                  <div className="apop">
                    {!isList && activeBackdropRow && (
                      <button title="The art on screen belongs to a timed period — change that period's art"
                        onClick={() => { setMapMenu(false); setPicker({ kind: 'backdrop-row', rowId: activeBackdropRow.id, imageId: activeBackdropRow.imageId, start: activeBackdropRow.start, hasCurrent: false }) }}>
                        🖼 Change this period's art…
                      </button>
                    )}
                    {!isList && (
                      <button title={activeBackdropRow ? 'The base art shows outside every timed period — it is not what is on screen now' : undefined}
                        onClick={() => { setMapMenu(false); setPicker({ kind: 'backdrop', hasCurrent: !!map?.backdropUrl }) }}>
                        🖼 {map?.backdropUrl ? (activeBackdropRow ? 'Change the base art…' : 'Change the backdrop…') : (activeBackdropRow ? 'Set base art…' : 'Set a backdrop image…')}
                      </button>
                    )}
                    {!isList && map?.backdropUrl && (
                      <button title={activeBackdropRow ? 'Removes the BASE art (hidden right now behind the period art)' : undefined}
                        onClick={() => { setMapMenu(false); setBackdrop(null) }}>{activeBackdropRow ? 'Remove the base art' : 'Remove the backdrop'}</button>
                    )}
                    {!isList && tl?.enabled && (
                      <button title="Use different backdrop art for a range of time"
                        onClick={() => { setMapMenu(false); setBdsOpen(true) }}>🕓 Backdrops over time…</button>
                    )}
                    {!isList && <div className="apop-sep" title="These are how YOU view every map, kept in this browser">View — every map</div>}
                    {!isList && (
                      <button role="menuitemcheckbox" aria-checked={gridOn} onClick={() => { setMapMenu(false); toggleGrid() }}>▦ Grid {gridOn ? '✓' : ''}</button>
                    )}
                    {!isList && (
                      <button title="Show every pin's name all the time, not just on hover"
                        role="menuitemcheckbox" aria-checked={labelsOn} onClick={() => { setMapMenu(false); toggleLabels() }}>🏷 Always show names {labelsOn ? '✓' : ''}</button>
                    )}
                    {!isList && tl?.enabled && trail.length > 0 && (
                      <button title="The party's ghost-print trail on this map"
                        role="menuitemcheckbox" aria-checked={printsOn} onClick={() => { setMapMenu(false); togglePrints() }}>👣 Footprints {printsOn ? '✓' : ''}</button>
                    )}
                    {tl?.enabled && (
                      <button title="Zoom the scrubber to the range of time this map's story spans"
                        onClick={() => { setMapMenu(false); setFocusEdit({ start: map?.focusStart ?? '', end: map?.focusEnd ?? '' }) }}>
                        🎯 Focus period…{focusOk ? ' ✓' : ''}
                      </button>
                    )}
                    <button onClick={() => { setMapMenu(false); setRenaming(map?.title || '') }}>✎ Rename this map…</button>
                    <div className="apop-row">
                      <span>Show as</span>
                      <button className={!isList ? 'on' : ''} onClick={() => { setMapMenu(false); setMapView('map') }}>🗺 Map</button>
                      <button className={isList ? 'on' : ''} onClick={() => { setMapMenu(false); setMapView('list') }}>☰ List</button>
                    </div>
                  </div>
                )}
              </div>
              {!tl?.enabled && (
                <button className="tool" title="Turn on the timeline"
                  onClick={enableTimeline}>🕓 Timeline</button>
              )}
            </div>
          )}

          {!placing && !isList && legend.length > 1 && (
            <div className="legend">
              {legend.map(([k, n]) => (
                <button key={k} className={`lchip ${hiddenCats.has(k) ? 'off' : ''}`} onClick={() => toggleCat(k)}
                  title={hiddenCats.has(k) ? `Show ${cat(k).plural}` : `Hide ${cat(k).plural}`}>
                  <span className="ic" style={{ background: cat(k).c }}>{cat(k).i}</span>
                  {cat(k).label} <em>{n}</em>
                </button>
              ))}
              {hiddenCats.size > 0 && <button className="lchip all" onClick={() => setHiddenCats(new Set())}>Show all</button>}
            </div>
          )}

          {mapData && !isList && mapData.placements.length === 0 && !placing && loadState === 'ok' && !activeBackdropUrl && (
            <div className="empty-map">
              <div style={{ fontSize: '2rem' }}>🗺️</div>
              {mode === 'edit' ? (
                <>
                  <div>Empty map. Click <b>＋ Add entry</b>, then click the map to drop the first one.</div>
                  <div className="muted">Tip: the <b>Map ▾</b> menu sets a backdrop image.</div>
                </>
              ) : (
                <div>Nothing here yet.</div>
              )}
            </div>
          )}

          {drawing && (
            <div className="drawhud">
              <span className="dhtext">◌ Outlining <b>{drawing.placementId ? (mapData?.placements.find((p) => p.id === drawing.placementId)?.node.title || 'this place') : 'a new place'}</b>
                {' — click corners or drag to trace · '}<b>Enter</b>{' or double-click closes · Backspace or right-click undoes · Esc cancels · hold Space to pan'}</span>
              <span className="kindsel" title="Button: a house or landmark — grows on hover. Area: a district — a faint wash.">
                <button type="button" className={drawing.kind === 'button' ? 'on' : ''} aria-pressed={drawing.kind === 'button'} onClick={() => setDrawKind('button')}>Button</button>
                <button type="button" className={drawing.kind === 'area' ? 'on' : ''} aria-pressed={drawing.kind === 'area'} onClick={() => setDrawKind('area')}>Area</button>
              </span>
              <button className="btn" disabled={drawing.pts.length < 3} onClick={finishOutline}>✓ Done{drawing.pts.length ? ` (${drawing.pts.length})` : ''}</button>
              <button className="btn" aria-label="Cancel the outline" onClick={() => setDrawing(null)}>✕</button>
            </div>
          )}
          {mode === 'edit' && placing && (
            <div className="hint">
              {placing.kind === 'new'
                ? 'Click the map to drop the new entry — Enter drops it at the cursor, Esc cancels.'
                : `Click the map to place “${placing.node.title}” — Enter drops it at the cursor, Esc cancels.`}
            </div>
          )}

          <div className="helpwrap" ref={helpRef}>
            <button className="tool round" title="How to drive the map" aria-label="How to drive the map" aria-expanded={help} onClick={() => setHelp((v) => !v)}>?</button>
            {help && (
              <div className="apop helppop">
                <div><b>Scroll / pinch</b> zoom · <b>drag the map</b> pan · <b>double-click</b> zoom in</div>
                <div><b>Click a pin or an outlined place</b> to read it{mode === 'edit' ? ' · drag a pin to move it · drag a selected outline to move it' : ''}</div>
                <div><b>Double-click a pin with ◎</b> to go inside its interior map</div>
                {mode === 'edit' && !isList && <div><b>◌ Outline</b> traces a place: click corners or drag · <b>Enter</b> closes · <b>Backspace</b> undoes · <b>Esc</b> cancels</div>}
                {mode === 'edit' && <div><b>Right-click the map</b> to add something right there</div>}
                {mode === 'edit' && <div><b>N</b> {isList ? 'adds a row to this list' : 'starts a new entry · '}{isList ? '' : <><b>Enter</b> drops it at the cursor</>}</div>}
                <div><b>/</b> finds an entry · <b>Esc</b> cancels</div>
                <div><b>Ctrl+Shift+B</b> reports a bug</div>
                <div className="helpkey"><b>Colours:</b> faint = DM-only (players never see it) · dashed purple = not here at this moment (⏳ on the timebar hides them) · dashed green = a player's marker · gold glow = the lantern · gold shapes = outlined places (hover for the name)</div>
                <div><b>✏ Edit</b> builds · <b>👁 View</b> reads with DM eyes · <b>🎭 Player</b> shows what the share link shows</div>
              </div>
            )}
          </div>
        </div>

          {tl?.enabled && (
            <div className="timebar">
              <span className="tlabel" title={momentLabel(dispMin, world?.eras, tl.unit)}>{dispMin}</span>
              <div className="ttrack" ref={trackRef}>
                {dispMax > dispMin && (() => {
                  // one tick per footstep moment; the deepest map for that moment wins the click
                  const byStart = new Map()
                  for (const st of trail) {
                    if (st.start == null || st.start < dispMin || st.start > dispMax) continue
                    const cur = byStart.get(st.start)
                    if (!cur || (st.interior && !cur.interior)) byStart.set(st.start, st)
                  }
                  const steps = [...byStart.values()].sort((a, b) => a.start - b.start)
                  const latest = latestSession(world?.eras)
                  const one = tl.unit ? tl.unit.replace(/s$/i, '') : 'moment'
                  const pitch = trackW / Math.max(1, dispMax - dispMin)
                  if (pitch < 8 && steps.length > 1) {
                    // too dense to aim at: one tick per SESSION (its first footstep) — a focus period
                    // or ⤢ spreads the footsteps out again
                    const groups = new Map()
                    for (const st of steps) {
                      const so = sessionOf(st.start, world?.eras)
                      const k = so ? `e${so.era.id}` : `t${st.start}`
                      if (!groups.has(k)) groups.set(k, { first: st, so, n: 0 })
                      groups.get(k).n++
                    }
                    return [...groups.values()].map(({ first, so, n }) => (
                      <button key={first.id} type="button" className="tstep grp"
                        style={{ left: `${((first.start - dispMin) / (dispMax - dispMin)) * 100}%`, '--sc': sessionColor(so?.idx ?? 0, latest) }}
                        title={`${so ? sessionLabel(so, tl.unit) : `${one} ${first.start}`} — ${first.mapTitle}${n > 1 ? ` · ${n} footsteps this session (narrow the bar to pick one)` : ''} (click to go there)`}
                        onClick={() => goToMoment(first.start, first.mapId, first.id)} />
                    ))
                  }
                  return steps.map((st) => {
                    const so = sessionOf(st.start, world?.eras)
                    return (
                      <button key={st.id} type="button" className="tstep"
                        style={{ left: `${((st.start - dispMin) / (dispMax - dispMin)) * 100}%`, '--sc': sessionColor(so?.idx ?? 0, latest) }}
                        title={`${so ? sessionLabel(so, tl.unit) : `${one} ${st.start}`} — ${st.mapTitle} (click to go there)`}
                        onClick={() => goToMoment(st.start, st.mapId, st.id)} />
                    )
                  })
                })()}
                {dispMax > dispMin && (() => {
                  const bands = (world?.eras || [])
                    .map((er) => ({ ...er, s: Math.max(er.start, dispMin), e: Math.min(er.end, dispMax) }))
                    .filter((er) => er.s < er.e)
                  // where eras overlap only the narrowest prints its name; the wider one keeps its band and tooltip
                  const quiet = (er) => bands.some((o) => o !== er && o.s < er.e && er.s < o.e && (o.e - o.s) < (er.e - er.s))
                  // a crowded bar prints the short form (S12) so every session stays named
                  const compact = bands.length > 5
                  const label = (er) => { const n = sessionNum(er); return compact && n != null ? `S${n}` : er.name }
                  return bands.map((er) => (
                    <span key={er.id} className={`teraband${er.playerVisible ? ' pv' : ''}`} title={er.name}
                      style={{
                        left: `${((er.s - dispMin) / (dispMax - dispMin)) * 100}%`,
                        width: `${((er.e - er.s) / (dispMax - dispMin)) * 100}%`,
                      }}>{quiet(er) ? null : <em>{label(er)}</em>}</span>
                  ))
                })()}
                <input type="range" aria-label="Viewing moment" min={dispMin} max={dispMax}
                  value={Math.min(Math.max(lens, dispMin), dispMax)}
                  onChange={(e) => setLens(Number(e.target.value))} />
                {dispMax > dispMin && (mapData?.placements || [])
                  .filter((p) => p.node.category !== 'party') // the party's walking is the ticks above, not presence marks
                  .flatMap((p) => [p.start, p.end])
                  .filter((t) => t != null && t >= dispMin && t <= dispMax)
                  .map((t, i) => (
                    <span key={i} className="ttick" style={{ left: `${((t - dispMin) / (dispMax - dispMin)) * 100}%` }} />
                  ))}
                {canon !== lens && canon >= dispMin && canon <= dispMax && dispMax > dispMin && (
                  <span className="canonmark" style={{ left: `${((canon - dispMin) / (dispMax - dispMin)) * 100}%` }}
                    title={`Canon moment (what players see): ${momentLabel(canon, world?.eras, tl.unit)}`} />
                )}
              </div>
              <span className="tlabel" title={momentLabel(dispMax, world?.eras, tl.unit)}>{dispMax}</span>
              {focusOk && (
                <button className="tbtn fexp" title={focusExpand ? `Back to this map's focus period (${fMin}–${fMax})` : 'Show the whole timeline'}
                  onClick={() => setFocusExpand((v) => !v)}>{focusExpand ? '⤡' : '⤢'}</button>
              )}
              {momentEdit != null ? (
                <input className="tnowedit" autoFocus type="number" value={momentEdit}
                  onChange={(e) => setMomentEdit(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitMoment(); else if (e.key === 'Escape') setMomentEdit(null) }}
                  onBlur={commitMoment} />
              ) : (
                <button className="tnow tnowbtn" title="Click to type an exact moment"
                  onClick={() => setMomentEdit(String(lens))}>{momentLabel(lens, world?.eras, tl.unit)}</button>
              )}
              <div className="tzone">
                {canon !== lens ? (
                  <>
                    <button className="tool tcanon" title="Make this the moment players see" onClick={setCanonHere}>📍 Set canon</button>
                    <button className="tbtn tback" title={`Back to the canon moment (${momentLabel(canon, world?.eras, tl.unit)})`} onClick={() => setLens(canon)}>↩</button>
                  </>
                ) : (
                  <span className="canonchip" title="You're looking at the canon moment — what players see">canon</span>
                )}
              </div>
              <button className={`tbtn tghosts${ghostsOn ? '' : ' off'}`}
                title={ghostsOn ? 'Hide things not present at this moment' : 'Show things not present at this moment (dashed purple)'}
                aria-label="Show things not present at this moment" aria-pressed={ghostsOn}
                onClick={() => setGhostsOn((v) => !v)}>⏳</button>
              <button className="tbtn tcfg" title="Timeline range, unit & eras" aria-label="Timeline settings" aria-expanded={tlEdit} onClick={() => setTlEdit((v) => !v)}>⚙</button>
            </div>
          )}
          {tl?.enabled && tlEdit && (
            <TimelineConfig key={`${tl.min}:${tl.max}:${tl.unit}`} tl={tl} eras={world?.eras || []} onSave={saveTimeline} onDisable={disableTimeline} onNextSession={nextSession}
              onClose={() => setTlEdit(false)} onEraAdd={eraAdd} onEraPatch={eraPatch} onEraDelete={eraDelete} />
          )}
        </div>

          {mode === 'view' && !wide && !sel && !spaceOpen && (
            <button className="tool spaceinfo" title="About this map" aria-label="About this map" onClick={() => setSpaceOpen(true)}>ℹ</button>
          )}
          {readerOpen && !sel && (
            <div className="reader">
              {readerGrip}
              {!wide && <button className="rclose" title="Close" aria-label="Close" onClick={() => setSpaceOpen(false)}>✕</button>}
              <div className="rinner">
                <div className="rhead">
                  <span className="ic" style={{ background: 'var(--line)' }}>🗺</span>
                  <h3>{map?.title}</h3>
                </div>
                <span className="rcat">This map{(mapData?.breadcrumb?.length || 0) > 1 ? ` · inside “${mapData.breadcrumb[mapData.breadcrumb.length - 2].title}”` : ''}</span>
                {map?.dmNote
                  ? <div className="dmnote"><div className="dmnl">🔒 Map notes</div>{map.dmNote}</div>
                  : <p className="rbody muted">No map notes yet — write them in ✏ Edit with nothing selected.</p>}
                {map?.ambienceUrl && <AudioClip className="ramb" loop src={map.ambienceUrl} caption="Ambience" />}
              </div>
            </div>
          )}
          {readerOpen && sel && !present(sel) && (
            <div className="reader">
              {readerGrip}
              <button className="rclose" title="Close" onClick={() => setSelId(null)}>✕</button>
              <div className="rinner rghost">
                <div className="rhead">
                  <span className="ic" style={{ background: cat(sel.node.category).c }}>{cat(sel.node.category).i}</span>
                  <h3>{sel.node.title}</h3>
                </div>
                <p className="rnote">Nothing is known of this at {momentLabel(lens, world?.eras, tl?.unit)}.</p>
                {mode === 'view' && (sel.start != null || sel.end != null) && (
                  <p className="rwhen">🕓 Its story runs {spanLabel(sel.start, sel.end, world?.eras, tl?.unit)}.</p>
                )}
              </div>
            </div>
          )}
          {readerOpen && sel && present(sel) && (
            <div className="reader">
              {readerGrip}
              <button className="rclose" title="Close" aria-label="Close" onClick={() => setSelId(null)}>✕</button>
              {sel.node.imageUrl && <div className="rhero"><img src={sel.node.imageUrl} alt="" /></div>}
              <div className="rinner">
                <div className="rhead">
                  <span className="ic" style={{ background: cat(sel.node.category).c }}>{cat(sel.node.category).i}</span>
                  <h3>{sel.node.title}</h3>
                </div>
                <span className="rcat">{cat(sel.node.category).label}{mode === 'view' && sel.node.visibility === 'dm' ? ' · 🔒 DM only' : ''}
                  {sel.node.stance ? <span className={`stchip ${sel.node.stance}`}>{sel.node.stance}</span> : null}</span>
                {sel.node.visibility === 'player' && <div className="sby">✍ a player's marker{sel.node.author ? `, signed “${sel.node.author}”` : ''}</div>}
                {tl?.enabled && (sel.start != null || sel.end != null) && (
                  <div className="rwhen">🕓 {spanLabel(sel.start, sel.end, world?.eras, tl.unit)}</div>
                )}
                {(() => {
                  const story = tl?.enabled ? (resolveFact(nodeDetail.facts, lens) ?? sel.node.body) : sel.node.body
                  return story ? <p className="rbody">{story}</p> : null
                })()}
                {sel.node.dmNote && (
                  <div className="dmnote"><div className="dmnl">🔒 DM notes</div>{sel.node.dmNote}</div>
                )}
                {sel.node.voiceUrl && <AudioClip className="rvoice" src={sel.node.voiceUrl} caption={sel.node.voiceLine ? `“${sel.node.voiceLine}”` : 'In their own voice'} />}
                {sel.node.category === 'party' && tl?.enabled && (() => {
                  const t = lens
                  const { prev, next } = partyNeighbors(trail, t)
                  const lab = (st) => { const so = sessionOf(st.start ?? t, world?.eras); return so ? ` · ${stepTag(so)}` : '' }
                  if (!prev && !next) return null
                  return (
                    <div className="rtrail">
                      {prev && <a role="button" tabIndex={0} onClick={() => goToMoment(prev.start ?? t, prev.mapId, prev.id)} onKeyDown={keyAct(() => goToMoment(prev.start ?? t, prev.mapId, prev.id))}>◂ From {prev.mapTitle}{lab(prev)}</a>}
                      {next && <a role="button" tabIndex={0} onClick={() => goToMoment(next.start, next.mapId, next.id)} onKeyDown={keyAct(() => goToMoment(next.start, next.mapId, next.id))}>Then on to {next.mapTitle}{lab(next)} ▸</a>}
                    </div>
                  )
                })()}
                {sel.node.hasInterior && (
                  <button className="btn primary block rgo" onClick={() => openInterior(sel.node)}>◎ Go inside</button>
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
        <div className="insp" ref={inspEl} role="complementary" aria-label="Editor">
          {!sel && !stray ? (loadState !== 'ok' ? (
            <div className="spacepanel">
              <div className="isect">This map</div>
              <div className="muted esmall">{loadState === 'missing' ? 'This map no longer exists' : loadState === 'err' ? "Couldn't load this map" : 'Opening…'}</div>
            </div>
          ) : (
            <div className="spacepanel">
              <div className="isect">This map</div>
              <h3 className="sptitle">{map?.title}
                <button className="lx" title="Rename this map" aria-label="Rename this map" onClick={() => setRenaming(map?.title || '')}>✎</button>
              </h3>
              {(mapData?.breadcrumb?.length || 0) > 1 && (
                <div className="muted spup">Inside “{mapData.breadcrumb[mapData.breadcrumb.length - 2].title}”</div>
              )}
              {(mapData?.breadcrumb?.length || 0) <= 1 && map?.ownerNodeId && (
                <div className="orphan">
                  <div className="muted spup">This map belongs to an entry that isn't placed on any map — it lives under “Unplaced” in the tree.</div>
                  <div className="onmaprow">
                    <button className="btn" title="Open the entry this map belongs to" onClick={() => openStray(map.ownerNodeId)}>Open its owner</button>
                    <button className="btn danger" title="Delete this map — its entry stays" onClick={() => removeOrphanSpace(map.ownerNodeId)}>✕ Remove this map</button>
                  </div>
                </div>
              )}
              {!isList && (
                <>
                  <div className="isect">Backdrop</div>
                  {activeBackdropUrl
                    ? <img className="spbd" src={activeBackdropUrl} alt="" />
                    : <div className="muted spnone">No backdrop set</div>}
                  {activeBackdropRow && (
                    <div className="muted esmall">Showing the period art from {momentLabel(activeBackdropRow.start ?? 0, world?.eras, tl?.unit)} — the base art shows outside every period.</div>
                  )}
                  {activeBackdropRow && (
                    <button className="btn block" onClick={() => setPicker({ kind: 'backdrop-row', rowId: activeBackdropRow.id, imageId: activeBackdropRow.imageId, start: activeBackdropRow.start, hasCurrent: false })}>
                      🖼 Change this period's art…
                    </button>
                  )}
                  <button className="btn block" title={activeBackdropRow ? 'The base art is hidden right now, behind the period art' : undefined}
                    onClick={() => setPicker({ kind: 'backdrop', hasCurrent: !!map?.backdropUrl })}>
                    🖼 {map?.backdropUrl ? (activeBackdropRow ? 'Change the base art…' : 'Change the backdrop…') : (activeBackdropRow ? 'Set base art…' : 'Set a backdrop image…')}
                  </button>
                  {tl?.enabled && (
                    <button className="btn block" title="Different map art for different periods"
                      onClick={() => setBdsOpen(true)}>🕓 Backdrops over time…</button>
                  )}
                </>
              )}
              {tl?.enabled && (
                <button className="btn block" title="Zoom the scrubber to the range of time this map's story spans"
                  onClick={() => setFocusEdit({ start: map?.focusStart ?? '', end: map?.focusEnd ?? '' })}>
                  🎯 Focus period…{focusOk ? ' ✓' : ''}
                </button>
              )}
              <div className="isect">🔒 Map notes — players never see this</div>
              {map ? (
                <textarea key={`${map.id}:${noteVer}`} ref={noteRef} className="mapnotes" rows={7} defaultValue={map.dmNote || ''}
                  placeholder="Notes for this map — beats, schedules, who's where, the plan."
                  onChange={(e) => saveMapNote(map.id, e.target.value)}
                  onBlur={flushNote} />
              ) : <div className="muted esmall">Opening…</div>}
              {voiceOn && voiceMeta.ambience && (
                <>
                  <div className="isect">Ambience — players can play it here</div>
                  <input className="ambin" maxLength={400} value={ambText} onChange={(e) => setAmbText(e.target.value)}
                    placeholder="the sound of this place — “cold surf on slate, wind through rigging, a far bell”"
                    disabled={ambBusy}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.repeat && !ambBusy && ambText.trim()) setAmbience(ambText.trim()) }} />
                  <div className="vrow">
                    <button className="btn" disabled={ambBusy} onClick={() => { const v = ambText.trim(); if (v) setAmbience(v) }}>{ambBusy ? 'Making…' : '🔊 Make it'}</button>
                    {map?.ambienceUrl && <AudioClip loop src={map.ambienceUrl} />}
                    {map?.ambienceUrl && <button className="lx" title="Remove the ambience — its audio is deleted; making it again costs a new generation" onClick={() => { if (window.confirm('Remove this ambience? Its audio is deleted, and making it again costs a new generation.')) clearAmbience() }}>✕</button>}
                  </div>
                </>
              )}
              <hr />
              <div className="empty sphint">{isList ? <>Click a row to edit it — or use <b>＋ Add entry</b> to add one.</> : <>Click an entry to edit it — or use <b>＋ Add entry</b>, then click the map.</>}</div>
            </div>
          )) : (
            <Inspector key={`${sel ? `p${sel.id}` : `n${stray.id}`}:${refreshVer}`}
              p={sel || { id: null, node: stray, start: null, end: null, shape: null, shapeKind: 'area', shapeStyle: null }} stray={!sel}
              onSave={saveNode}
              onCat={(c) => {
                if (fn.category === 'party' && c !== 'party' && !window.confirm("This is the Party. Changing its category drops its whole trail from the timebar and from players' phones. Change it?")) return
                saveNode(fn.id, { category: c })
              }}
              partyExists={trail.some((st) => st.nodeId !== fn.id) || (mapData?.placements || []).some((pp) => pp.node.category === 'party' && pp.node.id !== fn.id)}
              onOpen={() => openInterior(fn)} onCreate={(v) => createInteriorAs(fn, v)}
              onRemoveInterior={() => askRemoveInterior(fn)}
              onImage={() => setPicker({ kind: 'node', nodeId: fn.id, hasCurrent: !!fn.imageUrl })}
              onRemoveImage={() => setNodeImage(fn.id, null, null)}
              timeline={tl} onLifespan={sel ? (which, v) => setLifespan(sel.id, which, v) : undefined}
              facts={nodeDetail.facts} nowT={Math.round(lens)} nowLabel={momentLabel(Math.round(lens), world?.eras, tl?.unit)} eras={world?.eras || []}
              hiddenHere={sel ? sel.visibility === 'dm' : false} onHideHere={sel ? (h) => setPlacementVis(sel.id, h) : undefined}
              onFootstep={sel && fn.category === 'party' && tl?.enabled ? () => partyMoveHere(sel.x, sel.y) : undefined}
              onFactAdd={() => factAdd(fn.id)}
              onFactPatch={(id, d) => factPatch(fn.id, id, d)}
              onFactDelete={(id) => factDelete(fn.id, id)}
              links={nodeDetail} onLink={() => setNodePicker('link')} onUnlink={removeLink} onLabel={labelLink} onJump={jump}
              onVis={(v) => saveNode(fn.id, { visibility: v })}
              onClaim={(v) => {
                saveNode(fn.id, { visibility: v })
                setFlash({ kind: 'ok', text: v === 'shared' ? `“${fn.title}” is canon now — players still see it, and it is yours to edit.` : `“${fn.title}” is hidden — players no longer see it.` })
              }}
              autoFocusTitle={!!sel && justCreated.current === sel.id} onTitleFocused={() => { justCreated.current = null }}
              spotlit={world?.spotlightNodeId === fn.id}
              onSpotlight={sel ? () => toggleSpotlight(fn) : undefined}
              onStance={(v) => saveNode(fn.id, { stance: v })}
              voiceOn={voiceOn} voices={voices} voiceMeta={voiceMeta} voicesErr={voicesErr} onVoicesRetry={loadVoices}
              onVoice={(id, name, style) => setNodeVoice(fn.id, id, name, style)}
              onSay={(t, style) => sayLine(fn.id, t, style)}
              onReveal={() => revealNote(fn.id)}
              hasOutline={!!sel?.shape} onOutline={sel && !isList && sel.node.category !== 'party' ? () => startOutline(sel.id) : undefined} onClearOutline={sel ? () => clearOutline(sel.id) : undefined}
              outlineKind={sel?.shapeKind || 'area'} onOutlineKind={sel ? (k) => setOutlineKind(sel.id, k) : undefined}
              outlineStyle={sel ? styleOf(sel) : null} onOutlineStyle={sel ? (k, v) => {
                // only the toggles that differ from the kind's preset are stored, so the kind keeps meaning something
                const full = { ...styleOf(sel), [k]: v }, preset = OUTLINE_PRESETS[sel.shapeKind === 'button' ? 'button' : 'area']
                const diff = {}; for (const key of STYLE_KEYS) if (full[key] !== preset[key]) diff[key] = full[key]
                setOutlineStyle(sel.id, Object.keys(diff).length ? diff : null)
              } : undefined}
              onClearLine={() => clearLine(fn.id)}
              onRemoveHere={sel ? () => removeFromMap(sel) : undefined}
              onPlaceHere={sel ? undefined : () => placeStrayHere(fn)}
              onDelete={() => askDeleteNode(fn)} />
          )}
        </div>
        )}
        {mode === 'edit' && inspOpen && (
          <div className="iresize" style={{ right: inspW - 3 + (forgeOn && forgeOpen ? forgeW : 0) }} title="Drag to widen the editor — double-click resets"
            onPointerDown={startInspResize} onDoubleClick={resetInspW} />
        )}
        {mode === 'edit' && forgeOn && forgeOpen && (
          <div className="fresize" style={{ right: forgeW - 3 }} title="Drag to widen the Forge — double-click resets"
            onPointerDown={startForgeResize} onDoubleClick={resetForgeW} />
        )}
        {railOpen && (
          <div className="rresize" style={{ left: railW - 3 }} title="Drag to widen the map tree — double-click resets"
            onPointerDown={startRailResize} onDoubleClick={resetRailW} />
        )}
        {mode === 'edit' && forgeOn && forgeOpen && (
          <ForgePanel worldId={worldId} map={map} sel={sel}
            onFlash={setFlash} onRefresh={forgeRefresh} onClose={toggleForge} />
        )}
      </div>
      )}

      {picker && (() => {
        const pkNode = picker.kind === 'node' ? ((mapData?.placements || []).find((pp) => pp.node.id === picker.nodeId)?.node || (stray?.id === picker.nodeId ? stray : null)) : null
        const periodAt = momentLabel(Math.round(lens), world?.eras, tl?.unit)
        const title = picker.kind === 'node' ? `Art for “${trunc(pkNode?.title || 'this entry')}”`
          : picker.kind === 'backdrop-timed' ? `Art for “${trunc(map?.title || 'this map')}” from ${periodAt}`
          : picker.kind === 'backdrop-row' ? `Art for the period from ${momentLabel(picker.start ?? 0, world?.eras, tl?.unit)} on “${trunc(map?.title || 'this map')}”`
          : `${activeBackdropRow ? 'Base art' : 'Backdrop'} for “${trunc(map?.title || 'this map')}”`
        const currentId = picker.kind === 'node' ? (pkNode?.imageId ?? null) : picker.kind === 'backdrop' ? (map?.imageId ?? null) : picker.kind === 'backdrop-row' ? (picker.imageId ?? null) : null
        const generate = !forgeOn ? null
          : picker.kind === 'node' ? { label: `Paint art for “${trunc(pkNode?.title || 'this entry')}”`, run: (g) => forgeService.nodeArt(picker.nodeId, g) }
          : picker.kind === 'backdrop-timed' ? { label: `Paint art for the period from ${periodAt}`, run: (g) => forgeService.mapBackdrop(map.id, g, Math.round(lens)) }
          : picker.kind === 'backdrop' ? { label: activeBackdropRow ? 'Paint this map new base art' : 'Paint this map a backdrop', run: (g) => forgeService.mapBackdrop(map.id, g) }
          : null
        return (
          <ImagePicker worldId={worldId} hasCurrent={picker.hasCurrent} title={title} currentId={currentId}
            removeLabel={picker.kind === 'node' ? 'Remove the art from this entry' : 'Remove the base art'}
            onPick={handlePick} onClose={() => setPicker(null)}
            generate={generate}
            onGenerated={() => { const k = picker.kind; setPicker(null); setFlash({ kind: 'ok', text: k === 'backdrop-timed' ? `Painted — a new period from ${periodAt} on this map` : 'Painted and attached' }); forgeRefresh() }} />
        )
      })()}
      {nodePicker === 'link' && sel && (
        <NodePicker worldId={worldId} excludeId={sel.node.id} title="Thread to…" excludedNote="Already threaded"
          excludeIds={[...(nodeDetail.out || []), ...(nodeDetail.in || [])].map((l) => l.otherId)}
          onPick={addLink} onClose={() => setNodePicker(null)} />
      )}
      {nodePicker === 'place-here' && (
        <NodePicker worldId={worldId} title="Place which node here?" unplacedFirst excludedNote="Already on this map"
          excludeIds={(mapData?.placements || []).filter((p) => p.node.category !== 'party').map((p) => p.node.id)}
          onPickNode={(nn) => {
            setNodePicker(null)
            const pt = placePoint.current || { x: 50, y: 50 }
            placeExisting(nn, pt.x, pt.y)
          }}
          onClose={() => setNodePicker(null)} />
      )}
      {nodePicker === 'place' && (
        <NodePicker worldId={worldId} title="Place which node?" unplacedFirst excludedNote="Already on this map"
          excludeIds={(mapData?.placements || []).filter((p) => p.node.category !== 'party').map((p) => p.node.id)}
          onPickNode={(n) => {
            setNodePicker(null)
            if (isList) placeExisting(n, 50, 50)
            else setPlacing({ kind: 'existing', node: n })
          }}
          onClose={() => setNodePicker(null)} />
      )}
      {confirmInterior && (
        <Modal title={`Remove the interior of “${confirmInterior.node.title}”?`} onClose={() => setConfirmInterior(null)}>
            {confirmInterior.impact ? (
              <div className="impact">
                <p>The interior map is deleted — its notes, backdrops and ambience go with it.</p>
                {confirmInterior.impact.nodesInside > 0 ? (
                  <p>{confirmInterior.impact.nodesInside} {confirmInterior.impact.nodesInside === 1 ? 'entry' : 'entries'} inside will be left unplaced — they still exist (findable with search).</p>
                ) : <p>Nothing is placed inside.</p>}
                {confirmInterior.impact.nestedMaps > 0 && (
                  <p>{confirmInterior.impact.nestedMaps} {confirmInterior.impact.nestedMaps === 1 ? 'map' : 'maps'} nested deeper inside stay — their owners keep them, listed under Unplaced in the map tree.</p>
                )}
                <p className="muted">The entry itself stays where it is. Undo is offered afterwards.</p>
              </div>
            ) : (
              <p className="mnote muted">Couldn't check what's inside — the interior map, and anything placed only there, goes with it. Undo will still be offered.</p>
            )}
            <div className="mrow">
              <button className="tool" onClick={() => setConfirmInterior(null)}>Keep it</button>
              <button className="tool danger" onClick={doRemoveInterior}>Remove interior</button>
            </div>
        </Modal>
      )}

      {confirmDel && (
        <Modal title={`Delete “${confirmDel.node.title}”?`} onClose={() => setConfirmDel(null)}>
            <DeleteImpact impact={confirmDel.impact} spotlit={world?.spotlightNodeId === confirmDel.node.id}
              party={confirmDel.node.category === 'party' ? (() => {
                const steps = trail.filter((st) => st.nodeId === confirmDel.node.id)
                const nums = steps.map((st) => sessionOf(st.start ?? 0, world?.eras)?.num).filter((n) => n != null)
                return { steps: steps.length, maps: new Set(steps.map((st) => st.mapId)).size, first: nums.length ? Math.min(...nums) : null, last: nums.length ? Math.max(...nums) : null }
              })() : null} />
            <div className="mrow">
              <button className="tool" onClick={() => setConfirmDel(null)}>Keep it</button>
              <button className="tool danger" onClick={doDeleteNode}>Delete everywhere</button>
            </div>
        </Modal>
      )}

      {ctx && ctx.placementId && (() => {
        const p = mapData?.placements.find((pp) => pp.id === ctx.placementId)
        if (!p) return null
        return (
          <div ref={ctxRef} className="apop ctxmenu" style={{ left: ctx.sx, top: ctx.sy }} onPointerDown={(e) => e.stopPropagation()}>
            <div className="apop-sep">{p.node.title}</div>
            {p.node.hasInterior && <button onClick={() => { setCtx(null); openInterior(p.node) }}>◎ Go inside</button>}
            {!isList && p.node.category !== 'party' && <button onClick={() => { setCtx(null); startOutline(p.id) }}>◌ {p.shape ? 'Redraw the outline' : 'Outline on the map'}</button>}
            <button onClick={() => { setCtx(null); removeFromMap(p) }}>⤒ Remove from this map</button>
            <button style={{ color: '#ff9b9b' }} onClick={() => { setCtx(null); askDeleteNode(p.node) }}>🗑 Delete…</button>
          </div>
        )
      })()}
      {ctx && !ctx.placementId && (
        <div ref={ctxRef} className="apop ctxmenu" style={{ left: ctx.sx, top: ctx.sy }} onPointerDown={(e) => e.stopPropagation()}>
          <button onClick={() => { const c = ctx; setCtx(null); dropNode(c.px, c.py) }}>＋ New entry here</button>
          {tl?.enabled && <button title="Record the party's next footstep at this spot: the current one ends at the lens moment" onClick={() => { const c = ctx; setCtx(null); partyMoveHere(c.px, c.py) }}>👣 The party moves here</button>}
          <button onClick={() => { const c = ctx; startOutline(null, [c.px, c.py]) }}>◌ Outline a place from here</button>
          {sel && <button onClick={() => { const c = ctx; startOutline(sel.id, [c.px, c.py]) }}>◌ Outline “{sel.node.title}” from here</button>}
          <button onClick={() => { placePoint.current = { x: ctx.px, y: ctx.py }; setCtx(null); setNodePicker('place-here') }}>
            ⤓ Place an existing node here…
          </button>
        </div>
      )}

      {bdsOpen && map && (
        <Modal title="Backdrops over time" onClose={() => setBdsOpen(false)}>
            <p className="muted esmall">The newest period covering the viewed moment shows; outside every period, the base image shows.</p>
            <div className="bdrow base">
              {map.backdropUrl ? <img className="bdthumb" src={map.backdropUrl} alt="" /> : <span className="bdthumb none">—</span>}
              <span className="bdlabel">Base — outside every period</span>
              <button className="tool" onClick={() => setPicker({ kind: 'backdrop', hasCurrent: !!map.backdropUrl })}>
                {map.backdropUrl ? 'Change…' : 'Set…'}
              </button>
            </div>
            {(mapData?.backdrops || []).map((b) => (
              <React.Fragment key={b.id}>
              <div className="bdrow">
                <img className="bdthumb" src={b.url} alt="" />
                <span className="bdfrom">from</span>
                <input key={`s${b.start ?? ''}:${bdVer}`} className="enum" type="number" step={1} defaultValue={b.start ?? ''} placeholder="start"
                  onBlur={(ev) => periodBlur(ev, b, b.id, { hint: setBdHint, bump: () => setBdVer((v) => v + 1), send: (d) => patchBackdrop(b.id, d) })} />
                <span className="edash">–</span>
                <input key={`e${b.end ?? ''}:${bdVer}`} className="enum" type="number" step={1} defaultValue={b.end ?? ''} placeholder="∞"
                  onBlur={(ev) => periodBlur(ev, b, b.id, { hint: setBdHint, bump: () => setBdVer((v) => v + 1), send: (d) => patchBackdrop(b.id, d) })} />
                <button className="ex" title="Remove this period's art" aria-label="Remove this period's art" onClick={() => deleteBackdrop(b.id)}>✕</button>
              </div>
              {bdHint === b.id && <div className="muted warn">{REVERSED}</div>}
              </React.Fragment>
            ))}
            <button className="tool" onClick={() => setPicker({ kind: 'backdrop-timed', hasCurrent: false })}>
              ＋ Add art for a period (starts at {momentLabel(Math.round(lens), world?.eras, tl?.unit)})
            </button>
        </Modal>
      )}

      {focusEdit != null && (
        <Modal title="Focus period" onClose={() => setFocusEdit(null)}>
            <p className="muted esmall">Still the one world clock — but inside this map, the scrubber's track zooms to the {tl?.unit || 'moments'} its story spans. ⤢ on the bar shows the full timeline again. Blank = the world's full range.</p>
            <div className="span" style={{ marginBottom: 12 }}>
              <input type="number" step={1} aria-label="Focus period from" placeholder={String(tl?.min ?? '')} value={focusEdit.start}
                onChange={(e) => setFocusEdit((f) => ({ ...f, start: e.target.value }))} />
              <span>→</span>
              <input type="number" step={1} aria-label="Focus period to" placeholder={String(tl?.max ?? '')} value={focusEdit.end}
                onChange={(e) => setFocusEdit((f) => ({ ...f, end: e.target.value }))} />
            </div>
            <div className="mrow">
              <button className="tool" onClick={() => setFocusEdit({ start: '', end: '' })}>Clear</button>
              <button className="tool" onClick={() => setFocusEdit(null)}>Cancel</button>
              <button className="tool on" onClick={saveFocus}>Save</button>
            </div>
        </Modal>
      )}

      {renaming != null && (
        <Modal title="Rename this map" onClose={() => setRenaming(null)}>
            <input className="nsearch" autoFocus maxLength={255} value={renaming} onChange={(e) => setRenaming(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') renameMap() }} />
            <div className="mrow">
              <button className="tool" onClick={() => setRenaming(null)}>Cancel</button>
              <button className="tool on" disabled={!renaming.trim()} onClick={renameMap}>Rename</button>
            </div>
        </Modal>
      )}

      {flash && (
        <div className={`aflash ${flash.kind}`} role={flash.kind === 'err' ? 'alert' : 'status'} aria-live={flash.kind === 'err' ? 'assertive' : 'polite'}
          onPointerEnter={() => setFlashHold(true)} onPointerLeave={() => setFlashHold(false)} onFocus={() => setFlashHold(true)} onBlur={() => setFlashHold(false)}>
          {flash.text}
          {(flash.undoId || flash.undo) && <button className="aundo" onClick={() => { if (flash.undo) { const u = flash.undo; setFlash(null); u() } else doUndo(flash.undoId) }}>↩ Undo</button>}
        </div>
      )}
    </div>
  )
}

export default AtlasWorkspace
