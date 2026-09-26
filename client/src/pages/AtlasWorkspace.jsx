import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import atlasService from '../services/atlasService'
import worldService from '../services/worldService'
import imageServiceBase64 from '../services/imageServiceBase64'
import { errText, refused } from '../services/http'
import MapPlane from '../components/MapPlane'
import EraScrub from '../components/EraScrub'
import forgeService from '../services/forgeService'
import voiceService from '../services/voiceService'
import AudioClip from '../components/AudioClip'
import PartyTrail from '../components/PartyTrail'
import Regions, { regionIdAt, styleOf, STYLE_KEYS } from '../components/Regions'
import { momentLabel, sessionOf, sessionColor, partyNeighbors, spanLabel, sessionLabel, stepTag, sessionNum, latestSession } from '../utils/moment'
import { cleanRing, centroid } from '../utils/geometry'
import { CATS, cat } from '../utils/categories'
import '../styles/atlas.scss'

const clamp = (v) => Math.max(0, Math.min(100, v))
// a moment typed into a number input: '' = open (null), a decimal rounds, a non-number is undefined (not sent)
const wholeOr = (v) => { if (v === '' || v == null) return null; const n = Math.round(Number(v)); return Number.isFinite(n) ? n : undefined }
// Both bounds of a period are read together when either input blurs (the two number inputs
// share a parent). A reversed pair is HELD with a hint and never sent — the DM is mid-edit,
// typing the start before the end; a non-number remounts to the stored value; otherwise only
// the bounds that changed travel, and a refused save (a stale tab) remounts to the stored ones.
function periodBlur(e, cur, id, { hint, bump, send, required = false }) {
  const [si, ei] = e.target.parentElement.querySelectorAll('input[type=number]')
  const st = wholeOr(si.value), en = wholeOr(ei.value)
  if (st === undefined || en === undefined || (required && (st == null || en == null))) { bump(); return }
  if (st != null && en != null && st > en) { hint(id); return }
  hint(null)
  const patch = {}
  if (st !== (cur.start ?? null)) patch.start_time = st
  if (en !== (cur.end ?? null)) patch.end_time = en
  if (Object.keys(patch).length) Promise.resolve(send(patch)).then((ok) => { if (ok === false) bump() })
}
const REVERSED = '⚠ Ends before it starts — not saved until the bounds are in order.'
// the period text that covers moment t (the latest-starting one wins, then the newest):
// the same rule share.js applies for players. A blank period is no story yet.
const coveringFact = (facts, t) => {
  const rows = (facts || []).filter((f) => f.body?.trim() && (f.start == null || f.start <= t) && (f.end == null || f.end >= t))
  if (!rows.length) return null
  rows.sort((a, b) => ((b.start ?? -Infinity) - (a.start ?? -Infinity)) || (b.id - a.id))
  return rows[0]
}
const trunc = (t) => (t && t.length > 18 ? `${t.slice(0, 17)}…` : t)

// a phone: narrow, or a touch-first pointer — editing happens on a PC (CLAUDE.md), so it lands in View
const isPhone = () => { try { return window.innerWidth <= 700 || window.matchMedia('(pointer:coarse)').matches } catch (e) { return false } }

function AtlasWorkspace() {
  const { worldId, mapId } = useParams()
  const navigate = useNavigate()

  const [world, setWorld] = useState(null)
  const [worldList, setWorldList] = useState(null) // null until the switcher is first opened
  const [tree, setTree] = useState([])
  const [data, setData] = useState(null) // { map, placements, links, breadcrumb }
  const [loadState, setLoadState] = useState('loading') // loading | ok | err | missing (the space is gone)
  const [worldErr, setWorldErr] = useState(null) // the world did not load (not a 404: those go to the dashboard)
  const [worldTick, setWorldTick] = useState(0) // bumped by ⟳ Try again
  const [bdHint, setBdHint] = useState(null) // a backdrop row whose bounds are reversed
  const [bdVer, setBdVer] = useState(0) // remounts the backdrop rows to their stored bounds
  const [selId, setSelId] = useState(null) // selected placement id
  const [placing, setPlacing] = useState(null) // null | {kind:'new'} | {kind:'existing', node}
  const [drawing, setDrawing] = useState(null) // an outline in progress: { placementId|null, pts:[[x,y]], kind }
  const [hovId, setHovId] = useState(null) // the placement whose region is hovered — its pin shows its name
  const [loading, setLoading] = useState(true)
  const [save, setSave] = useState('idle') // idle | saving | saved | err
  const [trailTick, setTrailTick] = useState(0) // bumps when footsteps may have moved (map loads, lifespan saves)
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
    // a phone is view-only by design: it lands in View (or Player), never in the editor
    if (isPhone()) return m === 'player' ? 'player' : 'view'
    return m === 'player' ? 'player' : m === 'view' ? 'view' : 'edit'
  })
  const [spaceOpen, setSpaceOpen] = useState(false) // phones: the space reader opens on request, not over the map
  const [nodeLinks, setNodeLinks] = useState({ out: [], in: [], facts: [] })
  const [nodePicker, setNodePicker] = useState(null) // 'link' | 'place'
  const [hiddenCats, setHiddenCats] = useState(() => new Set())
  const trackRef = useRef(null)                 // the timebar's track, measured so ticks know their pitch
  const [trackW, setTrackW] = useState(600)
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
  const [printsOn, setPrintsOn] = useState(() => localStorage.getItem('atlas_prints') !== 'off')
  const [ghostsOn, setGhostsOn] = useState(() => localStorage.getItem('atlas_ghosts') !== 'off') // show things not present at the lens moment
  const togglePrints = () => setPrintsOn((v) => {
    const nv = !v
    try { localStorage.setItem('atlas_prints', nv ? 'on' : 'off') } catch (err) { /* ignore */ }
    return nv
  })
  const [bdsOpen, setBdsOpen] = useState(false) // "backdrops over time" manager
  const [focusEdit, setFocusEdit] = useState(null) // { start, end } strings while editing
  const [focusExpand, setFocusExpand] = useState(false) // temporarily show the full timeline
  const [momentEdit, setMomentEdit] = useState(null) // string while typing an exact moment
  const [railOpen, setRailOpen] = useState(() => !isPhone() && localStorage.getItem('atlas_rail') !== 'closed')
  const [inspOpen, setInspOpen] = useState(() => localStorage.getItem('atlas_insp') !== 'closed')
  const [stray, setStray] = useState(null)      // a node opened WITHOUT a placement (unplaced, or an orphaned interior's owner)
  const [refreshVer, setRefreshVer] = useState(0) // bumps after a Forge turn / Allow / Unmake: the inspector reseeds from the server
  const [noteVer, setNoteVer] = useState(0)     // bumps when the server's map notes changed under an idle box
  const noteRef = useRef(null)
  const quietRef = useRef(true)                  // nothing being dragged, drawn, typed or confirmed: safe to refresh
  const focusIdRef = useRef(null)
  // The Forge: this world's AI mind. forgeOn = the server has it switched on at all
  // (GEMINI_API_KEY set); without it the button never renders. Edit-posture chrome only.
  const [trail, setTrail] = useState([]) // every party footstep in the world (timebar ticks)
  const [forgeOn, setForgeOn] = useState(false)
  const [voiceMeta, setVoiceMeta] = useState({ enabled: false }) // which provider speaks, and whether it can be steered / make ambience
  const voiceOn = voiceMeta.enabled && voiceMeta.storage !== false
  const [voicesErr, setVoicesErr] = useState(false)
  const loadVoices = () => { setVoicesErr(false); return voiceService.voices().then(setVoices).catch(() => setVoicesErr(true)) }
  const [voices, setVoices] = useState([])
  const [forgeOpen, setForgeOpen] = useState(() => localStorage.getItem('atlas_forge') === 'open')
  const [railW, setRailW] = useState(() => {
    const v = parseInt(localStorage.getItem('atlas_railw'), 10)
    return Number.isFinite(v) ? Math.min(420, Math.max(160, v)) : 230
  })
  const [inspW, setInspW] = useState(() => {
    const v = parseInt(localStorage.getItem('atlas_inspw'), 10)
    return Number.isFinite(v) ? Math.min(640, Math.max(280, v)) : 310
  })
  const [readerW, setReaderW] = useState(() => { // View/Player reader column; null = the CSS default
    const v = parseInt(localStorage.getItem('atlas_readerw'), 10)
    return Number.isFinite(v) ? Math.min(720, Math.max(300, v)) : null
  })
  const [wide, setWide] = useState(() => window.innerWidth > 700) // below that the reader overlays the map
  useEffect(() => {
    const on = () => setWide(window.innerWidth > 700)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  const [ctx, setCtx] = useState(null) // right-click menu: { sx, sy, px, py }
  const [previewT, setPreviewT] = useState(null) // player-posture era scrubbing (null = canon)

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
  const inspWRef = useRef(310)
  const inspRaf = useRef(0)
  const readerWRef = useRef(0)
  const readerRaf = useRef(0)
  const railWRef = useRef(230)
  const railRaf = useRef(0)
  const placePoint = useRef(null) // where "place existing here" should land
  const cursorRef = useRef(null) // last pointer position — keyboard placement drops there
  const justCreated = useRef(null) // the placement just dropped: its title opens focused and selected
  const inspEl = useRef(null) // the editor panel: it opens at the top for each newly selected thing

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
    const t = setTimeout(() => setFlash(null), (flash.undoId || flash.undo) ? 9000 : 4000)
    return () => clearTimeout(t)
  }, [flash])

  const doUndo = async (undoId) => {
    setFlash(null)
    const r = await track(atlasService.undo(undoId), "Couldn't undo").catch(() => null)
    if (!r) return
    refreshMap(); refreshTree(); refreshWorldMeta() // the lantern may have come back with its node
    if (focusIdRef.current) reloadLinks(focusIdRef.current) // a restored fact or link shows at once
    setFlash({ kind: 'ok', text: 'Put back the way it was.' })
  }

  // ---- loading the world + map --------------------------------------------------
  const refreshTree = () => atlasService.getMaps(worldId).then(setTree).catch(() => {})
  const loadMap = useCallback((blank) => {
    if (!mapId) return Promise.resolve()
    const seq = ++loadSeq.current
    if (blank) { setData(null); setLoadState('loading') }
    return atlasService.getMap(mapId)
      .then((d) => {
        if (seq !== loadSeq.current) return // a newer map was asked for since: this reply is stale
        // a map opened under the wrong world goes to its own: one world's clock, tree and
        // eras must never dress another's map (and edits would split across two worlds)
        if (d.map?.worldId != null && String(d.map.worldId) !== String(worldId)) { navigate(`/w/${d.map.worldId}/m/${mapId}`, { replace: true }); return }
        setData((prev) => {
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
          setData(null); setLoadState('missing')
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
    track(voiceService.sayLine(nodeId, text, style), 'No voice came back')
      .then((r) => { localPatchNode(nodeId, { voiceLine: r.line, voiceUrl: r.url }); setFlash({ kind: 'ok', text: 'They spoke — players hear it on their sheet' }) })
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
      .then((r) => { setData((d) => (d && d.map?.id === id) ? { ...d, map: { ...d.map, ambienceUrl: r.url, ambiencePrompt: r.prompt } } : d); setFlash({ kind: 'ok', text: 'The place has a sound now' }) })
      .catch(() => {})
      .finally(() => setAmbBusy(false))
  }
  const clearAmbience = () => {
    const id = map.id
    return track(voiceService.clearAmbience(id), "Couldn't remove the ambience")
      .then(() => setData((d) => (d && d.map?.id === id) ? { ...d, map: { ...d.map, ambienceUrl: null, ambiencePrompt: null } } : d))
      .catch(() => {})
  }
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
    const call = track(on ? atlasService.clearSpotlight(worldId) : atlasService.setSpotlight(worldId, node.id), "Couldn't light the trail")
    call.then((r) => {
      setWorld((w) => ({ ...w, spotlightNodeId: on ? null : node.id }))
      if (on) { setFlash({ kind: 'info', text: 'The trail is out.' }); return }
      // the server resolved the trail the way the share link will: say exactly that
      const tr = r?.trail || []
      if (!tr.length) setFlash({ kind: 'info', text: `Players can't see any of the way to “${node.title}” yet — it is hidden, or not here at the canon moment.` })
      else if (tr[tr.length - 1].nodeId !== node.id) setFlash({ kind: 'info', text: `Players see the way as far as “${tr[tr.length - 1].title}” — the rest is hidden or not here yet.` })
      else setFlash({ kind: 'ok', text: `Players now see the golden trail: ${tr.map((x) => x.title).join(' ▸ ')}.` })
    }).catch(() => {})
  }

  useEffect(() => {
    if (!worldId) return
    atlasService.getTrail(worldId).then(setTrail).catch(() => {})
  }, [worldId, trailTick]) // eslint-disable-line
  const forgeRefresh = useCallback(() => {
    // the mind (or an Allow / Unmake) may have changed the very node the DM has open: push
    // pending edits first, then reseed the inspector and its threads from the server's copy
    flushAll()
    atlasService.getWorld(worldId).then(setWorld).catch(() => {})
    atlasService.getMaps(worldId).then(setTree).catch(() => {})
    loadMap(false).then(() => { setRefreshVer((v) => v + 1); if (focusIdRef.current) reloadLinks(focusIdRef.current) })
  }, [worldId, loadMap]) // eslint-disable-line

  useEffect(() => {
    let live = true
    setLoading(true); setWorldErr(null)
    atlasService.getWorld(worldId)
      .then(async (w) => {
        if (!live) return
        setWorld(w)
        setNow(w.timeline?.current ?? 0)
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
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [worldId, worldTick]) // eslint-disable-line

  useEffect(() => {
    setSelId(null)
    setStray(null)
    setPlacing(null)
    setCtx(null)
    setFocusExpand(false)
    loadMap(true).then(() => {
      if (pendingSelect.current) { setSelId(pendingSelect.current); pendingSelect.current = null }
      // a footstep jump moves the lens only once the destination map is in hand
      if (pendingNow.current != null) { setNow(pendingNow.current); pendingNow.current = null }
    })
  }, [mapId]) // eslint-disable-line
  useEffect(() => { if (inspEl.current) inspEl.current.scrollTop = 0 }, [selId, stray?.id])
  const pendingNow = useRef(null)
  // Go to a moment on a map: same map → move the lens; another map → travel first, then
  // set the lens after it loads, so no render ever mixes the old map with the new moment.
  const goToMoment = (t, targetMapId, placementId = null) => {
    if (targetMapId == null || String(targetMapId) === String(mapId)) { setNow(t); if (placementId != null) setSelId(placementId); return }
    pendingNow.current = t
    if (placementId != null) pendingSelect.current = placementId // the footstep stays open on the other map
    navigate(`/w/${worldId}/m/${targetMapId}`)
  }

  useEffect(() => {
    const el = trackRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setTrackW(el.clientWidth || 600))
    ro.observe(el); setTrackW(el.clientWidth || 600)
    return () => ro.disconnect()
  }, [world?.timeline?.enabled, mode]) // eslint-disable-line — `tl` is derived further down; read the world directly
  const sel = data?.placements.find((p) => p.id === selId) || null
  const map = data?.map
  const isList = map?.view === 'list'
  // the node the inspector is about: a placement's node, or a stray opened on its own
  const fn = sel ? sel.node : stray
  focusIdRef.current = fn?.id ?? null
  useEffect(() => { if (selId != null) setStray(null) }, [selId])
  useEffect(() => { document.title = `${map?.title ? `${map.title} · ` : ''}${world?.name || 'Fantasy Map Timeline'}`; return () => { document.title = 'Fantasy Map Timeline' } }, [map?.title, world?.name])
  useEffect(() => {
    if (!tlEdit) return
    const close = (e) => { if (!e.target?.closest?.('.tlcfg, .tgear')) setTlEdit(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [tlEdit])
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
  const reloadLinks = (nodeId) =>
    atlasService.getNode(nodeId).then((d) => setNodeLinks({ out: d.links, in: d.backlinks, facts: d.facts || [] })).catch(() => {})
  useEffect(() => {
    const fid = sel?.node.id ?? stray?.id
    if (!fid) { setNodeLinks({ out: [], in: [], facts: [] }); return }
    let live = true
    atlasService.getNode(fid).then((d) => { if (live) setNodeLinks({ out: d.links, in: d.backlinks, facts: d.facts || [] }) }).catch(() => {})
    return () => { live = false }
  }, [selId, stray?.id]) // eslint-disable-line
  const addLink = async (toId) => {
    setNodePicker(null)
    const fid = focusIdRef.current
    if (!fid) return
    await track(atlasService.addLink({ from_node_id: fid, to_node_id: toId }), "Couldn't link").catch(() => {})
    reloadLinks(fid)
  }
  const removeLink = async (id) => {
    const r = await track(atlasService.deleteLink(id), "Couldn't remove the link").catch(() => null)
    if (focusIdRef.current) reloadLinks(focusIdRef.current)
    if (r) setFlash({ kind: 'ok', text: 'Thread removed.', undoId: r.undoId })
  }
  const labelLink = async (id, label) => {
    await track(atlasService.patchLink(id, { label }), "Couldn't save the label").catch(() => {})
    if (focusIdRef.current) reloadLinks(focusIdRef.current)
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
    try { loc = await atlasService.locateNode(nodeId) } catch (e) {
      // a failed lookup is a failure, not "unplaced" — never invite a second placement
      setFlash({ kind: 'err', text: e?.response?.status === 404 ? 'That node no longer exists.' : "Couldn't find where that is — try again." })
      return
    }
    if (!loc || !loc.mapId) { openStray(nodeId); return }
    if (String(loc.mapId) === String(mapId)) { if (loc.placementId) setSelId(loc.placementId); return }
    if (loc.placementId) pendingSelect.current = loc.placementId
    navigate(`/w/${worldId}/m/${loc.mapId}`)
  }
  const placeStrayHere = (node) => placeExisting(node, 50, 50)
  const removeOrphanSpace = async (ownerId) => {
    const d = await atlasService.getNode(ownerId).catch(() => null)
    if (!d?.node) { setFlash({ kind: 'err', text: "Couldn't find this space's owner." }); return }
    askRemoveInterior(d.node)
  }

  // ---- node & placement actions ----------------------------------------------------
  const dropNode = (x, y, shape = null, kind = 'area') => once('drop', async () => {
    setPlacing(null) // one drop per click, even on a slow network
    const r = await track(atlasService.addNode(mapId, { x, y, ...(shape ? { shape, shape_kind: kind } : {}) }), "Couldn't add the node").catch(() => null)
    if (!r) return
    justCreated.current = r.placementId
    await refreshMap(); refreshTree(); setSelId(r.placementId)
  })
  const placeExisting = (node, x, y) => once('drop', async () => {
    setPlacing(null)
    if (node.category === 'party') return partyMoveHere(x, y)
    const r = await track(atlasService.placeNode(mapId, { node_id: node.id, x, y }), "Couldn't place it").catch(() => null)
    if (!r) return
    await refreshMap(); setSelId(r.placementId)
    setFlash({ kind: 'ok', text: `"${node.title}" placed here — same node, new spot.` })
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
    if (!partyId) { setFlash({ kind: 'info', text: 'There is no Party node yet — make one with the ⚑ The party category, then place it' }); return }
    const t = Math.round(now)
    const at = (v) => (v == null ? -Infinity : v)
    const live = trail.filter((st) => st.nodeId === partyId && at(st.start) <= t && (st.end == null || st.end >= t)).sort((a, b) => at(b.start) - at(a.start))[0]
    const startAt = live && at(live.start) === t ? t + 1 : t
    try {
      if (live && (live.end == null || live.end >= startAt)) await track(atlasService.patchPlacement(live.id, { end_time: startAt - 1 }), "Couldn't close the last footstep")
      if ((tl.max ?? 0) < startAt) await track(atlasService.patchWorld(worldId, { timeline_max_time: startAt }), "Couldn't grow the clock")
      const r = await track(atlasService.placeNode(mapId, { node_id: partyId, x, y, start_time: startAt, end_time: null }), "Couldn't record the footstep")
      setTrailTick((v) => v + 1)
      await refreshWorldMeta()
      await refreshMap()
      setNow(startAt); setSelId(r.placementId)
      const so = sessionOf(startAt, world?.eras)
      setFlash({ kind: 'ok', text: `The party moves here — ${so ? sessionLabel(so, tl.unit) : `${tl.unit} ${startAt}`}` })
    } catch (e) { /* track already told the DM */ }
  })
  // a placement of a shared node can be hidden on ONE map (the Forge's extra placements are born so)
  const setPlacementVis = (placementId, hidden) => {
    const v = hidden ? 'dm' : 'shared'
    setData((d) => d && ({ ...d, placements: d.placements.map((pp) => (pp.id === placementId ? { ...pp, visibility: v } : pp)) }))
    track(atlasService.patchPlacement(placementId, { visibility: v }), "Couldn't change who sees it here").catch(() => {})
  }
  // ---- outlines: trace a region of the art so the feature itself becomes the button ----
  // placementId null = outline first, then a new place is born from it (anchor at the centroid)
  const startOutline = (placementId, firstPt) => {
    setPlacing(null); setCtx(null)
    const cur = data?.placements.find((p) => p.id === placementId)
    const kind = cur?.shapeKind || localStorage.getItem('atlas_outline_kind') || 'button'
    setDrawing({ placementId, pts: firstPt ? [firstPt] : [], kind })
  }
  const setDrawKind = (kind) => { localStorage.setItem('atlas_outline_kind', kind); setDrawing((d) => d && ({ ...d, kind })) }
  const setOutlineKind = async (placementId, kind) => { // a preset: sets the kind and clears the toggles
    setData((prev) => prev && ({ ...prev, placements: prev.placements.map((pp) => (pp.id === placementId ? { ...pp, shapeKind: kind, shapeStyle: null } : pp)) }))
    await track(atlasService.patchPlacement(placementId, { shape_kind: kind, shape_style: null }), "Couldn't change the outline's kind").catch(() => {})
  }
  const setOutlineStyle = async (placementId, style) => {
    setData((prev) => prev && ({ ...prev, placements: prev.placements.map((pp) => (pp.id === placementId ? { ...pp, shapeStyle: style } : pp)) }))
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
      const cur = data?.placements.find((pp) => pp.id === d.placementId)
      const old = cur?.shape ? { shape: cur.shape, kind: cur.shapeKind || 'area', style: cur.shapeStyle || null } : null
      const ok = await track(atlasService.patchPlacement(d.placementId, { shape: pts, shape_kind: d.kind }), "Couldn't save the outline").then(() => true).catch(() => false)
      if (!ok) return
      await refreshMap(); setSelId(d.placementId)
      if (old) setFlash({ kind: 'ok', text: 'Outline redrawn.', undo: () => restoreOutline(d.placementId, old) })
    } else {
      const [cx, cy] = centroid(pts)
      await dropNode(cx, cy, pts, d.kind)
    }
  }
  const restoreOutline = (placementId, old) => // the old ring, kind and style go back as they were
    track(atlasService.patchPlacement(placementId, { shape: old.shape, shape_kind: old.kind, shape_style: old.style }), "Couldn't put the outline back")
      .then(() => refreshMap()).catch(() => {})
  const clearOutline = async (placementId) => {
    const cur = data?.placements.find((pp) => pp.id === placementId)
    const old = cur?.shape ? { shape: cur.shape, kind: cur.shapeKind || 'area', style: cur.shapeStyle || null } : null
    const ok = await track(atlasService.patchPlacement(placementId, { shape: null }), "Couldn't remove the outline").then(() => true).catch(() => false)
    if (!ok) return
    await refreshMap()
    if (old) setFlash({ kind: 'ok', text: 'Outline removed — back to a plain pin.', undo: () => restoreOutline(placementId, old) })
  }
  // the API speaks snake_case, the map payload camelCase: translate so a saved DM note
  // (dm_note) lands on p.node.dmNote — the key every reader and the reseeded inspector use
  const CAMEL = { dm_note: 'dmNote', pin_size: 'pinSize', image_id: 'imageId', voice_id: 'voiceId', voice_name: 'voiceName', voice_style: 'voiceStyle', voice_line: 'voiceLine', voice_url: 'voiceUrl' }
  const localPatchNode = (nodeId, patch) => {
    const local = {}
    for (const [k, v] of Object.entries(patch)) if (k !== 'reveal') local[CAMEL[k] || k] = v
    setData((d) => d && ({
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
    const node = data?.placements.find((pp) => pp.node.id === nodeId)?.node || (stray?.id === nodeId ? stray : null)
    if (!node?.interiorMapId || !node.title || node.title === title) return
    const { interiorMapId, title: old } = node
    setTree((t) => t.map((m) => (m.id === interiorMapId && m.title === old ? { ...m, title } : m)))
    setData((d) => d && ({ ...d, breadcrumb: (d.breadcrumb || []).map((b) => (b.mapId === interiorMapId && b.title === old ? { ...b, title } : b)) }))
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
      .then(() => setData((d) => (d && d.map?.id === pn.mapId) ? { ...d, map: { ...d.map, dmNote: pn.note } } : d))
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
    if (r.factId) { reloadLinks(nodeId); setFlash({ kind: 'ok', text: 'Revealed into the period text players read at canon.' }) }
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
    setFlash({ kind: 'info', text: `“${node.title}” has no interior — give it one from the inspector (＋ Interior map)` })
  }
  const createInteriorAs = (node, view) => once(`interior:${node.id}`, async () => {
    const r = await track(atlasService.createInterior(node.id, view), "Couldn't create the interior").catch(() => null)
    if (!r) return
    refreshTree(); navigate(`/w/${worldId}/m/${r.mapId}`)
  })

  const factAdd = (nodeId) => once(`fact:${nodeId}`, () => {
    const cur = data?.placements.find((p) => p.node.id === nodeId)?.node
    const body = resolveFact(nodeLinks.facts, Math.round(now)) ?? cur?.body ?? ''
    return track(atlasService.addFact(nodeId, { body, start_time: Math.round(now), end_time: null }), "Couldn't add the entry")
      .then(() => reloadLinks(nodeId)).catch(() => {})
  })
  const factPatch = (nodeId, id, data) =>
    track(atlasService.patchFact(id, data), "Couldn't save the entry").then(() => { reloadLinks(nodeId); return true }).catch(() => false)
  const factDelete = (nodeId, id) =>
    track(atlasService.deleteFact(id), "Couldn't remove the entry")
      .then((r) => { reloadLinks(nodeId); setFlash({ kind: 'ok', text: "That period's text is gone.", undoId: r?.undoId }) }).catch(() => {})

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
    if (data?.map?.ownerNodeId === node.id && world?.rootMapId) navigate(`/w/${worldId}/m/${world.rootMapId}`) // we were standing in it
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
    setSelId(null); setStray((s) => (s && s.id === node.id ? null : s)); refreshMap(); refreshTree()
    if (world?.spotlightNodeId === node.id) setWorld((w) => ({ ...w, spotlightNodeId: null })) // the lantern went out with it
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
    const cur = (data?.placements || []).find((pp) => pp.node.id === nodeId)?.node || (stray?.id === nodeId ? stray : null)
    const prev = cur ? { id: cur.imageId ?? null, url: cur.imageUrl || null } : null
    localPatchNode(nodeId, { imageUrl: imageUrl || null, imageId: imageId ?? null })
    track(atlasService.patchNode(nodeId, { image_id: imageId })).catch(() => {})
    if (imageId == null && prev?.id != null) setFlash({ kind: 'ok', text: 'Image removed from the node — it stays in the Archive.', undo: () => setNodeImage(nodeId, prev.id, prev.url) })
  }
  const setBackdrop = (imageId) => {
    const prev = map?.imageId ?? null // removing the base art can be undone from the toast
    return track(atlasService.patchMap(mapId, { image_id: imageId }), "Couldn't set the backdrop")
      .then(() => { refreshMap(); if (imageId == null && prev != null) setFlash({ kind: 'ok', text: 'Backdrop removed.', undo: () => setBackdrop(prev) }) })
      .catch(() => {})
  }
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
  const patchBackdrop = (id, data) => // resolves false when refused, so the row can go back to the stored bounds
    track(atlasService.patchBackdrop(id, data), "Couldn't save the backdrop").then(() => { refreshMap(); return true }).catch(() => false)
  const deleteBackdrop = (id) =>
    track(atlasService.deleteBackdrop(id), "Couldn't remove the backdrop")
      .then((r) => { refreshMap(); setFlash({ kind: 'ok', text: "That period's art is gone.", undoId: r?.undoId }) }).catch(() => {})

  const setMapView = (view) => {
    if (!map || map.view === view) return
    setData((d) => d && ({ ...d, map: { ...d.map, view } }))
    track(atlasService.patchMap(mapId, { view }), "Couldn't switch the view").catch(() => refreshMap())
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

  // drag the reader's left edge (View / Player postures) the same way; double-click resets
  const startReaderResize = (e) => {
    e.preventDefault()
    readerWRef.current = readerW || (e.currentTarget.parentElement?.getBoundingClientRect().width ?? 400)
    const move = (ev) => {
      readerWRef.current = Math.min(Math.max(window.innerWidth - ev.clientX, 300), Math.min(720, Math.round(window.innerWidth * 0.6)))
      if (!readerRaf.current) {
        readerRaf.current = requestAnimationFrame(() => { readerRaf.current = 0; setReaderW(readerWRef.current) })
      }
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      try { localStorage.setItem('atlas_readerw', String(readerWRef.current)) } catch (err) { /* ignore */ }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const resetReaderW = () => { setReaderW(null); try { localStorage.removeItem('atlas_readerw') } catch (e) { /* ignore */ } }
  const readerCol = readerW && wide ? `${readerW}px` : 'var(--readerw)'
  const readerGrip = (
    <div className="rgrip" title="Drag to widen the reader — double-click resets"
      onPointerDown={startReaderResize} onDoubleClick={resetReaderW} />
  )

  // edit/view judge presence by the DM's lens; the player preview judges by CANON,
  // exactly like the real share link does.
  const presentAt = (p, t) => (!tl?.enabled ? true : (p.start == null || t >= p.start) && (p.end == null || t <= p.end))
  const present = (p) => presentAt(p, mode === 'player' ? (previewT ?? canon) : now)
  const setCanonHere = () => {
    track(atlasService.patchWorld(worldId, { timeline_current_time: now }), "Couldn't set the canon moment")
      .then(() => {
        setWorld((w) => w && ({ ...w, timeline: { ...w.timeline, current: now } }))
        setFlash({ kind: 'ok', text: `Canon moment set to ${momentLabel(now, world?.eras, tl.unit)} — that's what players now see.` })
      }).catch(() => {})
  }
  const refreshWorldMeta = () => atlasService.getWorld(worldId).then(setWorld).catch(() => {})
  const eraAdd = () => once('era', () => track(atlasService.addEra(worldId, { name: 'A remembered age', start_time: tl.min, end_time: canon }), "Couldn't add the era"))
    .then(refreshWorldMeta).catch(() => {})
  const eraPatch = (id, data) => track(atlasService.patchEra(id, data), "Couldn't save the era").then(() => { refreshWorldMeta(); return true }).catch(() => false)
  const eraDelete = (id) => track(atlasService.deleteEra(id), "Couldn't delete the era")
    .then((r) => { refreshWorldMeta(); setFlash({ kind: 'ok', text: 'Era deleted — players lose that stretch of the past.', undoId: r?.undoId }) }).catch(() => {})
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
      setNow(t.current ?? t.min)
      track(atlasService.patchWorld(worldId, { timeline_enabled: true })).catch(() => {})
    } else {
      // the table convention: footsteps, ten a session — "＋ Next session" then opens Session 1 at 10–19
      setWorld((w) => w && ({ ...w, timeline: { enabled: true, min: 0, max: 9, current: 0, unit: 'footsteps' } }))
      setNow(0)
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
    setNow((v) => Math.min(Math.max(v, min), max))
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
  useEffect(() => {
    if (!sharePop) return
    const close = (e) => { if (shareRef.current && !shareRef.current.contains(e.target)) setSharePop(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [sharePop])

  const setLifespan = (placementId, which, v) => {
    // only the bound that changed is sent, merged per placement: a second tab's stale copy
    // of the OTHER bound never travels, and a quick from-then-to keeps both
    const key = which === 'start' ? 'start_time' : 'end_time'
    const cur = data?.placements.find((pp) => pp.id === placementId)
    const st = which === 'start' ? v : cur?.start ?? null, en = which === 'end' ? v : cur?.end ?? null
    setData((d) => d && ({ ...d, placements: d.placements.map((pp) => (pp.id === placementId ? { ...pp, [which]: v } : pp)) }))
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
      // the queued frame no-ops once dragRef is null, so commit the final position here;
      // an outline rides along with its anchor
      const dx = d.lastX - d.ox, dy = d.lastY - d.oy
      const shape = d.shape ? d.shape.map(([x, y]) => [Math.round(clamp(x + dx) * 100) / 100, Math.round(clamp(y + dy) * 100) / 100]) : null
      setData((prev) => prev && ({ ...prev, placements: prev.placements.map((pp) => (pp.id === d.id ? { ...pp, x: d.lastX, y: d.lastY, ...(shape ? { shape } : {}) } : pp)) }))
      track(atlasService.patchPlacement(d.id, { x: d.lastX, y: d.lastY, ...(shape ? { shape } : {}) })).catch(() => {})
    } else setSelId(d.id)
  }, [onDragMove, track])
  const onPinDown = (e, p) => {
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
    atlasService.getNodes(worldId).then(setSearchIndex).catch(() => {})
  }
  const closeSearch = () => { setSearchOpen(false); setQ(''); setSfilter('all') }
  useEffect(() => {
    if (!searchOpen) return
    const close = (e) => { if (searchRef.current && !searchRef.current.contains(e.target)) closeSearch() }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [searchOpen])
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
    return { x: clamp(((px - r.left) / r.width) * 100), y: clamp(((py - r.top) / r.height) * 100) }
  }

  useEffect(() => {
    const key = (e) => {
      const typing = /input|textarea|select/i.test(e.target.tagName)
      if (e.key === '/' && !typing) {
        e.preventDefault(); searchRef.current?.querySelector('input')?.focus()
      } else if (e.key === 'Escape') { setPlacing(null); setCtx(null); closeSearch() }
      else if ((e.key === 'n' || e.key === 'N') && !typing && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && mode === 'edit' && !drawing) {
        // keyboard twin of "+ Add node"
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
  }, [mode, placing, isList, mapId, drawing]) // eslint-disable-line
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
    const idx = new Map(searchIndex.map((n) => [n.id, n]))
    return all.filter((l) => { const o = idx.get(l.otherId); return o && o.visibility !== 'dm' && o.placed !== false })
  }, [nodeLinks, mode, searchIndex])

  const renameMap = () => {
    const t = (renaming || '').trim().slice(0, 255)
    setRenaming(null)
    if (!t || !map || t === map.title) return
    setData((d) => d && ({ ...d, map: { ...d.map, title: t } }))
    track(atlasService.patchMap(mapId, { title: t }), "Couldn't rename").then(() => { refreshTree(); refreshMap() }).catch(() => refreshMap())
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
    const seen = {} // one Party, however many footsteps it left here
    for (const p of data?.placements || []) { (seen[p.node.category] ||= new Set()).add(p.node.id) }
    for (const k of Object.keys(seen)) counts[k] = seen[k].size
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
    if (!f || !map) { setFocusEdit(null); return }
    const st = wholeOr(f.start), en = wholeOr(f.end)
    // the modal stays open on a bad pair, so the DM can fix it in place
    if (st === undefined || en === undefined) { setFlash({ kind: 'err', text: 'A focus period is whole numbers on the clock' }); return }
    if (st != null && en != null && st > en) { setFlash({ kind: 'err', text: 'A focus period ends after it starts — swap the two' }); return }
    setFocusEdit(null)
    setData((d) => d && ({ ...d, map: { ...d.map, focusStart: st, focusEnd: en } }))
    track(atlasService.patchMap(mapId, { focus_start: st, focus_end: en }), "Couldn't save the focus period").catch(() => refreshMap())
  }

  const commitMoment = () => {
    const raw = String(momentEdit ?? '').trim()
    const v = Number(raw)
    setMomentEdit(null)
    if (raw === '' || !Number.isFinite(v) || !tl) return
    const t = Math.min(Math.max(Math.round(v), tl.min), tl.max)
    setNow(t)
    if (focusOk && !focusExpand && (t < fMin || t > fMax)) setFocusExpand(true) // typed outside the window: widen so the thumb shows
  }

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

  const regionAt = (e) => { const id = regionIdAt(e); return id == null ? null : (data?.placements.find((p) => p.id === id) || null) }
  const onWorldClick = (e) => {
    if (drawing) return // the outline layer owns its own presses
    if (!placing) { const p = regionAt(e); if (p) setSelId(p.id); return }
    if (!worldRef.current) return
    const rect = worldRef.current.getBoundingClientRect()
    const x = clamp(((e.clientX - rect.left) / rect.width) * 100)
    const y = clamp(((e.clientY - rect.top) / rect.height) * 100)
    if (placing.kind === 'new') dropNode(x, y)
    else placeExisting(placing.node, x, y)
  }
  const onEmptyPointerDown = (e) => { if (!placing && !e?.target?.closest?.('.region')) setSelId(null) }
  const onWorldContext = (e) => {
    if (!worldRef.current) return
    const rect = worldRef.current.getBoundingClientRect()
    setCtx({
      sx: Math.min(e.clientX, window.innerWidth - 230), sy: Math.min(e.clientY, window.innerHeight - 110),
      px: clamp(((e.clientX - rect.left) / rect.width) * 100),
      py: clamp(((e.clientY - rect.top) / rect.height) * 100),
    })
  }

  // View is the DM's running surface: the reader stays open — the selected node's story
  // and notes, or the space's own notes when nothing is selected.
  const readerOpen = mode === 'view' ? (wide || !!sel || spaceOpen) // a phone shows the map; the space's notes open on request
    : mode === 'player' ? (!!sel && sel.node.visibility !== 'dm' && sel.visibility !== 'dm')
    : false
  const resolveFact = (facts, t) => coveringFact(facts, t)?.body ?? null // a blank period is no story yet — the base text stands
  // with the clock off there is no history: one party pin, the latest footstep on this map
  const latestParty = (() => { const at = (v) => (v == null ? -Infinity : v); let best = null; for (const p of (data?.placements || [])) if (p.node.category === 'party' && (!best || at(p.start) > at(best.start) || (at(p.start) === at(best.start) && p.id > best.id))) best = p; return best?.id ?? null })()
  const visible = (p) =>
    (mode !== 'player' || (p.node.visibility !== 'dm' && p.visibility !== 'dm' && present(p))) &&
    (mode === 'player' || !hiddenCats.has(p.node.category)) &&
    (mode === 'player' || ghostsOn || !tl?.enabled || present(p))

  // ============================================================================= render ==
  if (loading && !world) {
    return <div className="atlas"><div className="loading" style={{ gridRow: '1 / 3' }}>Loading world…</div></div>
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
    <div className={`atlas${labelsOn ? ' labelson' : ''}${drawing ? ' drawing' : ''}`}>
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
                ? <a className="here" title="Refresh this map" onClick={() => refreshMap()}>{b.title}</a>
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
        {mode === 'edit' && ( // invite*, not share*: ad-blocker social filters hide share-named elements (1224c84)
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
                    <button className={`tool ${shareAsk === 'regen' ? 'danger' : ''}`} onClick={() => askShare('regen')} title="Makes a new link; the old one stops working">
                      {shareAsk === 'regen' ? "Really? Players' current link stops working" : 'Regenerate'}</button>
                    <button className="tool danger" onClick={() => askShare('off')}>{shareAsk === 'off' ? "Really? Every player's link dies" : 'Turn off'}</button>
                  </div>
                  <div className="muted">Players see shared nodes only, at the canon moment{tl?.enabled ? ` (${momentLabel(canon, world?.eras, tl.unit)})` : ''}. Scrubbing your timeline doesn't move them — “Set canon” does.</div>
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
          <span className="nowchip" title="The canon moment — the present your players see">🕓 {momentLabel(canon, world?.eras, tl.unit)}</span>
        )}
        <Link to="/dashboard" className="exit">Exit</Link>
      </div>

      <div className={`main m-${mode}`}
        style={{ gridTemplateColumns:
          mode === 'player' ? `1fr${readerOpen ? ` ${readerCol}` : ''}`
            : mode === 'view' ? `${railOpen ? `${railW}px ` : ''}1fr${readerOpen ? ` ${readerCol}` : ''}`
              : `${railOpen ? `${railW}px ` : ''}1fr${inspOpen ? ` ${inspW}px` : ''}${forgeOn && forgeOpen ? ' 340px' : ''}` }}>
        {mode !== 'player' && railOpen && (
          <div className="rail">
            <h4>Maps</h4>
            <MapTree tree={tree} rootId={world?.rootMapId} mapId={mapId} worldId={worldId}
              onGo={(id) => (String(id) === String(mapId) ? refreshMap() : navigate(`/w/${worldId}/m/${id}`))} />
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
          {loadState === 'missing' && (
            <div className="empty-map gone">
              <div style={{ fontSize: '2rem' }}>🌫️</div>
              <div>This space no longer exists.</div>
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
              onEmptyPointerDown={onEmptyPointerDown}
              onWorldContextMenu={mode === 'edit' ? onWorldContext : undefined}
              onWorldDoubleClick={(e) => { if (placing || drawing) return false; const p = regionAt(e); if (!p) return false; openInterior(p.node); return true }}
              dblZoom={!placing && !drawing}
              grid={gridOn}
            >
              <Regions backdropUrl={activeBackdropUrl} onEnter={(it) => openInterior(it.node)}
                items={(data?.placements || []).filter(visible).filter((p) => p.shape && p.node.category !== 'party').map((p) => ({
                  id: p.id, pts: p.shape, kind: p.shapeKind, style: styleOf(p), x: p.x, y: p.y, title: p.node.title, node: p.node,
                  secret: p.visibility === 'dm' || p.node.visibility === 'dm', hasInterior: p.node.hasInterior,
                  cls: `${selId === p.id ? 'sel' : ''} ${tl?.enabled && !present(p) ? 'ghost' : ''} ${(p.visibility === 'dm' || p.node.visibility === 'dm') ? 'secret' : ''} ${world?.spotlightNodeId === p.node.id ? 'spot' : ''}`,
                }))}
                hoverId={hovId} onHover={setHovId} labelsOn={labelsOn}
                inert={!!placing}
                drawing={drawing}
                onDraw={{ add: (pts) => setDrawing((d) => d && ({ ...d, pts: [...d.pts, ...pts] })), finish: finishOutline, cancel: () => setDrawing(null) }} />
              {printsOn && tl?.enabled && (mode === 'player' || !hiddenCats.has('party')) && (
                <PartyTrail placements={data?.placements} t={mode === 'player' ? (previewT ?? canon) : now} eras={world?.eras} unit={tl?.unit}
                  onStep={mode === 'player' ? undefined : (st) => setNow(st)} />
              )}
              {(data?.placements || []).filter(visible).filter((p) => !p.shape || p.node.category === 'party').filter((p) => p.node.category !== 'party' || (tl?.enabled ? present(p) : p.id === latestParty)).map((p) => (
                <div key={p.id}
                  className={`pin ${p.node.pin === 'image' && p.node.imageUrl ? 'ipin' : ''} ${p.node.visibility === 'player' ? 'pmark' : ''} ${selId === p.id ? 'sel' : ''} ${p.node.hasInterior ? 'open2' : ''} ${tl?.enabled && !present(p) ? 'ghost' : ''} ${(p.visibility === 'dm' || p.node.visibility === 'dm') ? 'secret' : ''} ${world?.spotlightNodeId === p.node.id ? 'spot' : ''} ${p.node.category === 'party' ? 'party' : ''} ${hovId === p.id ? 'hov' : ''}`}
                  style={{ left: `${p.x}%`, top: `${p.y}%`, ...(p.node.category === 'party' ? { '--sc': sessionColor(sessionOf(p.start ?? now, world?.eras)?.idx ?? 0, latestSession(world?.eras)) } : {}) }}
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
                  {(p.node.visibility === 'dm' || p.visibility === 'dm') && <span className="lock" title={p.node.visibility === 'dm' ? 'DM only' : 'Hidden on this map — the node itself is shared'}>🔒</span>}
                  {p.node.hasInterior && <span className="open">◎</span>}
                  {mode !== 'player' && p.node.stance && <span className={`stb ${p.node.stance}`} title={`Stands as ${p.node.stance} to the party (your eyes only)`} />}
                  {p.node.category === 'party' && tl?.enabled && (() => { const so = sessionOf(p.start ?? now, world?.eras); return so ? <span className="stag" title={sessionLabel(so, tl.unit)}>{stepTag(so)}</span> : null })()}
                </div>
              ))}
            </MapPlane>
          )}

          {loadState === 'ok' && isList && (
            <div className="listview">
              {mode === 'edit' && <div className="listhead muted">An interior list — inventory, notes, what's inside. Same nodes, no map.</div>}
              {(data?.placements || []).filter(visible).map((p) => (
                <div key={p.id}
                  className={`lsrow ${selId === p.id ? 'on' : ''} ${tl?.enabled && !present(p) ? 'ghost' : ''} ${(p.visibility === 'dm' || p.node.visibility === 'dm') ? 'secret' : ''}`}
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

          {mode === 'edit' && loadState === 'ok' && (
            <div className="toolbar">
              <button className={`tool ${placing?.kind === 'new' ? 'on' : ''}`}
                title="Create a brand-new node on this map — born DM-only; reveal it when the table should see it"
                onClick={() => {
                  if (isList) dropNode(50, 50)
                  else setPlacing((v) => (v?.kind === 'new' ? null : { kind: 'new' }))
                }}>＋ Add node</button>
              <button className={`tool ${placing?.kind === 'existing' ? 'on' : ''}`}
                title="Put a node that already exists somewhere onto this map too (one node can live in many places)"
                onClick={() => setNodePicker('place')}>⤓ Place existing</button>
              {!isList && (
                <button className={`tool ${drawing && !drawing.placementId ? 'on' : ''}`}
                  title="Trace a feature of the art — a house, a district, a lake — and it becomes a clickable place"
                  onClick={() => (drawing ? setDrawing(null) : startOutline(null))}>◌ Outline</button>
              )}
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
                    {!isList && tl?.enabled && (
                      <button title="The party's ghost-print trail on this map"
                        onClick={() => { setMapMenu(false); togglePrints() }}>👣 Footprints {printsOn ? '✓' : ''}</button>
                    )}
                    {tl?.enabled && (
                      <button title="The stretch of history this place's story spans — the scrubber zooms to it here"
                        onClick={() => { setMapMenu(false); setFocusEdit({ start: map?.focusStart ?? '', end: map?.focusEnd ?? '' }) }}>
                        🎯 Focus period…{focusOk ? ' ✓' : ''}
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

          {drawing && (
            <div className="drawhud">
              <span>◌ Outlining <b>{drawing.placementId ? (data?.placements.find((p) => p.id === drawing.placementId)?.node.title || 'this place') : 'a new place'}</b>
                {' — click corners or drag to trace · '}<b>Enter</b>{' or double-click closes · Backspace undoes · Esc cancels · hold Space to pan'}</span>
              <span className="kindsel" title="Button: a house or landmark — grows on hover. Area: a district — a faint wash.">
                <button type="button" className={drawing.kind === 'button' ? 'on' : ''} onClick={() => setDrawKind('button')}>Button</button>
                <button type="button" className={drawing.kind === 'area' ? 'on' : ''} onClick={() => setDrawKind('area')}>Area</button>
              </span>
              <button className="btn" disabled={drawing.pts.length < 3} onClick={finishOutline}>✓ Done{drawing.pts.length ? ` (${drawing.pts.length})` : ''}</button>
              <button className="btn" onClick={() => setDrawing(null)}>✕</button>
            </div>
          )}
          {mode === 'edit' && placing && (
            <div className="hint">
              {placing.kind === 'new'
                ? 'Click the map to drop the new node — Enter drops it at the cursor, Esc cancels.'
                : `Click the map to place "${placing.node.title}" — Enter drops it at the cursor, Esc cancels.`}
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
                {mode === 'edit' && <div><b>N</b> starts a new node · <b>Enter</b> drops it at the cursor</div>}
                {mode !== 'player' && <div><b>/</b> finds a node · <b>Esc</b> cancels</div>}
                <div><b>Ctrl+Shift+B</b> reports a bug</div>
                <div className="legend"><b>Colours:</b> faint = DM-only (players never see it) · dashed purple = not here at this moment (⏳ on the timebar hides them) · dashed green = a player's marker · gold glow = the lantern · gold shapes = outlined places (hover for the name)</div>
                <div><b>✏ Edit</b> builds · <b>👁 View</b> reads with DM eyes · <b>🎭 Player</b> shows what the share link shows</div>
              </div>
            )}
          </div>
        </div>

          {mode !== 'player' && tl?.enabled && (
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
                <input type="range" min={dispMin} max={dispMax}
                  value={Math.min(Math.max(now, dispMin), dispMax)}
                  onChange={(e) => setNow(Number(e.target.value))} />
                {dispMax > dispMin && (data?.placements || [])
                  .filter((p) => p.node.category !== 'party') // the party's walking is the ticks above, not presence marks
                  .flatMap((p) => [p.start, p.end])
                  .filter((t) => t != null && t >= dispMin && t <= dispMax)
                  .map((t, i) => (
                    <span key={i} className="ttick" style={{ left: `${((t - dispMin) / (dispMax - dispMin)) * 100}%` }} />
                  ))}
                {canon !== now && canon >= dispMin && canon <= dispMax && dispMax > dispMin && (
                  <span className="canonmark" style={{ left: `${((canon - dispMin) / (dispMax - dispMin)) * 100}%` }}
                    title={`Canon moment (what players see): ${momentLabel(canon, world?.eras, tl.unit)}`} />
                )}
              </div>
              <span className="tlabel" title={momentLabel(dispMax, world?.eras, tl.unit)}>{dispMax}</span>
              {focusOk && (
                <button className="tgear fexp" title={focusExpand ? `Back to this place's period (${fMin}–${fMax})` : 'Show the whole timeline'}
                  onClick={() => setFocusExpand((v) => !v)}>{focusExpand ? '⤡' : '⤢'}</button>
              )}
              {momentEdit != null ? (
                <input className="tnowedit" autoFocus type="number" value={momentEdit}
                  onChange={(e) => setMomentEdit(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitMoment(); else if (e.key === 'Escape') setMomentEdit(null) }}
                  onBlur={commitMoment} />
              ) : (
                <button className="tnow tnowbtn" title="Click to type an exact moment"
                  onClick={() => setMomentEdit(String(now))}>{momentLabel(now, world?.eras, tl.unit)}</button>
              )}
              <div className="tzone">
                {canon !== now ? (
                  <>
                    <button className="tool tcanon" title="Make this the moment players see" onClick={setCanonHere}>📍 Set canon</button>
                    <button className="tgear" title={`Back to the canon moment (${momentLabel(canon, world?.eras, tl.unit)})`} onClick={() => setNow(canon)}>↩</button>
                  </>
                ) : (
                  <span className="canonchip" title="You're looking at the canon moment — what players see">canon</span>
                )}
              </div>
              <button className={`tgear${ghostsOn ? '' : ' off'}`}
                title={ghostsOn ? 'Things not present at this moment are shown with a dashed purple edge — click to hide them' : 'Things not present at this moment are hidden — click to show them'}
                onClick={() => setGhostsOn((v) => { localStorage.setItem('atlas_ghosts', v ? 'off' : 'on'); return !v })}>⏳</button>
              <button className="tgear" title="Timeline range, unit & eras" onClick={() => setTlEdit((v) => !v)}>⚙</button>
            </div>
          )}
          {mode !== 'player' && tl?.enabled && tlEdit && (
            <TimelineConfig key={`${tl.min}:${tl.max}:${tl.unit}`} tl={tl} eras={world?.eras || []} onSave={saveTimeline} onDisable={disableTimeline} onNextSession={nextSession}
              onClose={() => setTlEdit(false)} onEraAdd={eraAdd} onEraPatch={eraPatch} onEraDelete={eraDelete} />
          )}
          {mode === 'player' && tl?.enabled && (
            <EraScrub tl={tl} eras={(world?.eras || []).filter((e) => e.playerVisible)}
              value={previewT} onChange={setPreviewT} live
              win={hasFocus ? { min: map?.focusStart, max: map?.focusEnd } : null} />
          )}
        </div>

          {mode === 'view' && !wide && !sel && !spaceOpen && (
            <button className="tool spaceinfo" title="About this space" aria-label="About this space" onClick={() => setSpaceOpen(true)}>ℹ</button>
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
                <span className="rcat">This space{(data?.breadcrumb?.length || 0) > 1 ? ` · inside “${data.breadcrumb[data.breadcrumb.length - 2].title}”` : ''}</span>
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
                <p className="rnote">Nothing is known of this at {momentLabel(bdMoment, world?.eras, tl?.unit)}.</p>
                {mode === 'view' && (sel.start != null || sel.end != null) && (
                  <p className="rwhen">🕓 Its story runs {spanLabel(sel.start, sel.end, world?.eras, tl?.unit)}.</p>
                )}
              </div>
            </div>
          )}
          {readerOpen && sel && present(sel) && (
            <div className="reader">
              {readerGrip}
              <button className="rclose" title="Close" onClick={() => setSelId(null)}>✕</button>
              {sel.node.imageUrl && <div className="rhero"><img src={sel.node.imageUrl} alt="" /></div>}
              <div className="rinner">
                <div className="rhead">
                  <span className="ic" style={{ background: cat(sel.node.category).c }}>{cat(sel.node.category).i}</span>
                  <h3>{sel.node.title}</h3>
                </div>
                <span className="rcat">{cat(sel.node.category).label}{mode === 'view' && sel.node.visibility === 'dm' ? ' · 🔒 DM only' : ''}
                  {mode !== 'player' && sel.node.stance ? <span className={`stchip ${sel.node.stance}`}>{sel.node.stance}</span> : null}</span>
                {sel.node.visibility === 'player' && <div className="sby">✍ a player's marker{sel.node.author ? `, signed “${sel.node.author}”` : ''}</div>}
                {tl?.enabled && (sel.start != null || sel.end != null) && (
                  <div className="rwhen">🕓 {spanLabel(sel.start, sel.end, world?.eras, tl.unit)}</div>
                )}
                {(() => {
                  const story = tl?.enabled ? (resolveFact(nodeLinks.facts, bdMoment) ?? sel.node.body) : sel.node.body
                  return story ? <p className="rbody">{story}</p> : null
                })()}
                {mode !== 'player' && sel.node.dmNote && (
                  <div className="dmnote"><div className="dmnl">🔒 DM notes</div>{sel.node.dmNote}</div>
                )}
                {sel.node.voiceUrl && <AudioClip className="rvoice" src={sel.node.voiceUrl} caption={sel.node.voiceLine ? `“${sel.node.voiceLine}”` : 'In their own voice'} />}
                {sel.node.category === 'party' && tl?.enabled && (() => {
                  const t = mode === 'player' ? (previewT ?? canon) : now
                  const { prev, next } = partyNeighbors(trail, t)
                  const lab = (st) => { const so = sessionOf(st.start ?? t, world?.eras); return so ? ` · ${stepTag(so)}` : '' }
                  if (!prev && !next) return null
                  return (
                    <div className="rtrail">
                      {prev && <a onClick={() => goToMoment(prev.start ?? t, prev.mapId, prev.id)}>◂ From {prev.mapTitle}{lab(prev)}</a>}
                      {next && <a onClick={() => goToMoment(next.start, next.mapId, next.id)}>Then on to {next.mapTitle}{lab(next)} ▸</a>}
                    </div>
                  )
                })()}
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
        <div className="insp" ref={inspEl}>
          {!sel && !stray ? (loadState !== 'ok' ? (
            <div className="spacepanel">
              <div className="isect">This space</div>
              <div className="muted esmall">{loadState === 'missing' ? 'This space no longer exists.' : loadState === 'err' ? "Couldn't load this space." : 'Opening…'}</div>
            </div>
          ) : (
            <div className="spacepanel">
              <div className="isect">This space</div>
              <h3 className="sptitle">{map?.title}
                <button className="lx" title="Rename this space" onClick={() => setRenaming(map?.title || '')}>✎</button>
              </h3>
              {(data?.breadcrumb?.length || 0) > 1 && (
                <div className="muted spup">Inside “{data.breadcrumb[data.breadcrumb.length - 2].title}”</div>
              )}
              {(data?.breadcrumb?.length || 0) <= 1 && map?.ownerNodeId && (
                <div className="orphan">
                  <div className="muted spup">This space belongs to a node that isn't placed on any map — it lives under “Unplaced” in the tree.</div>
                  <div className="onmaprow">
                    <button className="btn" title="Open the node this space is the interior of" onClick={() => openStray(map.ownerNodeId)}>Open its owner</button>
                    <button className="btn danger" title="Delete this space — its owner node stays" onClick={() => removeOrphanSpace(map.ownerNodeId)}>✕ Remove this space</button>
                  </div>
                </div>
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
                  🎯 Focus period…{focusOk ? ' ✓' : ''}
                </button>
              )}
              <div className="isect">🔒 Map notes — players never see this</div>
              {map ? (
                <textarea key={`${map.id}:${noteVer}`} ref={noteRef} className="mapnotes" rows={7} defaultValue={map.dmNote || ''}
                  placeholder="What's going on in this space — beats, schedules, who's where, the plan."
                  onChange={(e) => saveMapNote(map.id, e.target.value)}
                  onBlur={flushNote} />
              ) : <div className="muted esmall">Opening…</div>}
              {voiceOn && voiceMeta.ambience && (
                <>
                  <div className="isect">Ambience — players can play it here</div>
                  <input key={`amb${map?.id}`} className="ambin" maxLength={400} defaultValue={map?.ambiencePrompt || ''}
                    placeholder="the sound of this place — “cold surf on slate, wind through rigging, a far bell”"
                    disabled={ambBusy}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.repeat && !ambBusy && e.target.value.trim()) setAmbience(e.target.value.trim()) }} />
                  <div className="vrow">
                    <button className="btn" disabled={ambBusy} onClick={(e) => { const v = e.currentTarget.parentElement.previousSibling.value.trim(); if (v) setAmbience(v) }}>{ambBusy ? 'Making…' : '🔊 Make it'}</button>
                    {map?.ambienceUrl && <AudioClip loop src={map.ambienceUrl} />}
                    {map?.ambienceUrl && <button className="lx" title="Remove the ambience — its audio is deleted; making it again costs a new generation" onClick={() => { if (window.confirm('Remove this ambience? Its audio is deleted, and making it again costs a new generation.')) clearAmbience() }}>✕</button>}
                  </div>
                </>
              )}
              <hr />
              <div className="empty sphint">Click a node to edit it — or use <b>+ Add node</b>, then click the map.</div>
            </div>
          )) : (
            <Inspector key={`${sel ? `p${sel.id}` : `n${stray.id}`}:${refreshVer}`}
              p={sel || { id: null, node: stray, start: null, end: null, shape: null, shapeKind: 'area', shapeStyle: null }} stray={!sel}
              onSave={saveNode}
              onCat={(c) => {
                if (fn.category === 'party' && c !== 'party' && !window.confirm("This is the Party. Changing its category drops its whole trail from the timebar and from players' phones. Change it?")) return
                saveNode(fn.id, { category: c })
              }}
              partyExists={trail.some((st) => st.nodeId !== fn.id) || (data?.placements || []).some((pp) => pp.node.category === 'party' && pp.node.id !== fn.id)}
              onOpen={() => openInterior(fn)} onCreate={(v) => createInteriorAs(fn, v)}
              onRemoveInterior={() => askRemoveInterior(fn)}
              onImage={() => setPicker({ kind: 'node', nodeId: fn.id, hasCurrent: !!fn.imageUrl })}
              onRemoveImage={() => setNodeImage(fn.id, null, null)}
              timeline={tl} onLifespan={sel ? (which, v) => setLifespan(sel.id, which, v) : undefined}
              facts={nodeLinks.facts} nowT={Math.round(now)} nowLabel={momentLabel(Math.round(now), world?.eras, tl?.unit)} eras={world?.eras || []}
              hiddenHere={sel ? sel.visibility === 'dm' : false} onHideHere={sel ? (h) => setPlacementVis(sel.id, h) : undefined}
              onFootstep={sel && fn.category === 'party' && tl?.enabled ? () => partyMoveHere(sel.x, sel.y) : undefined}
              onFactAdd={() => factAdd(fn.id)}
              onFactPatch={(id, d) => factPatch(fn.id, id, d)}
              onFactDelete={(id) => factDelete(fn.id, id)}
              links={nodeLinks} onLink={() => setNodePicker('link')} onUnlink={removeLink} onLabel={labelLink} onJump={jump}
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
              hasOutline={!!sel?.shape} onOutline={sel ? () => startOutline(sel.id) : undefined} onClearOutline={sel ? () => clearOutline(sel.id) : undefined}
              outlineKind={sel?.shapeKind || 'area'} onOutlineKind={sel ? (k) => setOutlineKind(sel.id, k) : undefined}
              outlineStyle={sel ? styleOf(sel) : null} onOutlineStyle={sel ? (k, v) => setOutlineStyle(sel.id, { ...styleOf(sel), [k]: v }) : undefined}
              onClearLine={() => clearLine(fn.id)}
              onRemoveHere={sel ? () => removeFromMap(sel) : undefined}
              onPlaceHere={sel ? undefined : () => placeStrayHere(fn)}
              onDelete={() => askDeleteNode(fn)} />
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
        <NodePicker worldId={worldId} excludeId={sel.node.id} title="Thread to…" excludedNote="Already threaded"
          excludeIds={[...(nodeLinks.out || []), ...(nodeLinks.in || [])].map((l) => l.otherId)}
          onPick={addLink} onClose={() => setNodePicker(null)} />
      )}
      {nodePicker === 'place-here' && (
        <NodePicker worldId={worldId} title="Place which node here?" unplacedFirst excludedNote="Already on this map"
          excludeIds={(data?.placements || []).filter((p) => p.node.category !== 'party').map((p) => p.node.id)}
          onPickNode={(nn) => {
            setNodePicker(null)
            const pt = placePoint.current || { x: 50, y: 50 }
            placeExisting(nn, pt.x, pt.y)
          }}
          onClose={() => setNodePicker(null)} />
      )}
      {nodePicker === 'place' && (
        <NodePicker worldId={worldId} title="Place which node?" unplacedFirst excludedNote="Already on this map"
          excludeIds={(data?.placements || []).filter((p) => p.node.category !== 'party').map((p) => p.node.id)}
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
            {confirmInterior.impact ? (
              <div className="impact">
                <p>The space inside is deleted — its map notes, backdrops and ambience go with it.</p>
                {confirmInterior.impact.nodesInside > 0 ? (
                  <p>{confirmInterior.impact.nodesInside} {confirmInterior.impact.nodesInside === 1 ? 'node' : 'nodes'} inside will be left unplaced — they still exist (findable with search).</p>
                ) : <p>Nothing is placed inside.</p>}
                {confirmInterior.impact.nestedMaps > 0 && (
                  <p>{confirmInterior.impact.nestedMaps} {confirmInterior.impact.nestedMaps === 1 ? 'space' : 'spaces'} nested deeper inside stay — their owners keep them, listed under Unplaced in the map tree.</p>
                )}
                <p className="muted">The node itself stays exactly where it is. Undo is offered afterwards.</p>
              </div>
            ) : (
              <p className="mnote muted">Couldn't check what's inside — the space, and anything placed only there, goes with it. Undo will still be offered.</p>
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
          </div>
        </div>
      )}

      {ctx && (
        <div className="apop ctxmenu" style={{ left: ctx.sx, top: ctx.sy }} onPointerDown={(e) => e.stopPropagation()}>
          <button onClick={() => { const c = ctx; setCtx(null); dropNode(c.px, c.py) }}>＋ New node here</button>
          {tl?.enabled && <button title="Record the party's next footstep at this spot: the current one ends at the lens moment" onClick={() => { const c = ctx; setCtx(null); partyMoveHere(c.px, c.py) }}>👣 The party moves here</button>}
          <button onClick={() => { const c = ctx; startOutline(null, [c.px, c.py]) }}>◌ Outline a place from here</button>
          {sel && <button onClick={() => { const c = ctx; startOutline(sel.id, [c.px, c.py]) }}>◌ Outline “{sel.node.title}” from here</button>}
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
              <React.Fragment key={b.id}>
              <div className="bdrow">
                <img className="bdthumb" src={b.url} alt="" />
                <span className="bdfrom">from</span>
                <input key={`s${b.start ?? ''}:${bdVer}`} className="enum" type="number" step={1} defaultValue={b.start ?? ''} placeholder="start"
                  onBlur={(ev) => periodBlur(ev, b, b.id, { hint: setBdHint, bump: () => setBdVer((v) => v + 1), send: (d) => patchBackdrop(b.id, d) })} />
                <span className="edash">–</span>
                <input key={`e${b.end ?? ''}:${bdVer}`} className="enum" type="number" step={1} defaultValue={b.end ?? ''} placeholder="∞"
                  onBlur={(ev) => periodBlur(ev, b, b.id, { hint: setBdHint, bump: () => setBdVer((v) => v + 1), send: (d) => patchBackdrop(b.id, d) })} />
                <button className="ex" title="Remove this period's art" onClick={() => deleteBackdrop(b.id)}>✕</button>
              </div>
              {bdHint === b.id && <div className="muted warn">{REVERSED}</div>}
              </React.Fragment>
            ))}
            <button className="tool" onClick={() => setPicker({ kind: 'backdrop-timed', hasCurrent: false })}>
              ＋ Add art for a period (starts at {momentLabel(Math.round(now), world?.eras, tl?.unit)})
            </button>
          </div>
        </div>
      )}

      {focusEdit != null && (
        <div className="modal-back" onClick={() => setFocusEdit(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h4>Focus period</h4><button onClick={() => setFocusEdit(null)}>✕</button></div>
            <p className="muted esmall">Still the one world clock — but inside this space, the scrubber's track zooms to the {tl?.unit || 'moments'} its story spans. ⤢ on the bar shows the full timeline again. Blank = the world's full range.</p>
            <div className="span" style={{ marginBottom: 12 }}>
              <input type="number" step={1} placeholder={String(tl?.min ?? '')} value={focusEdit.start}
                onChange={(e) => setFocusEdit((f) => ({ ...f, start: e.target.value }))} />
              <span>→</span>
              <input type="number" step={1} placeholder={String(tl?.max ?? '')} value={focusEdit.end}
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
            <input className="nsearch" autoFocus maxLength={255} value={renaming} onChange={(e) => setRenaming(e.target.value)}
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
          {(flash.undoId || flash.undo) && <button className="aundo" onClick={() => { if (flash.undo) { const u = flash.undo; setFlash(null); u() } else doUndo(flash.undoId) }}>↩ Undo</button>}
        </div>
      )}
    </div>
  )
}

// The Maps rail as a real tree: every space nests under the map its owner node stands on.
// Branches fold with a caret (remembered per world), the path to the current map is always
// open, a folded branch says how much it holds, and interiors whose owner is not on any
// map yet gather under "Unplaced" instead of vanishing.
function MapTree({ tree, rootId, mapId, onGo, worldId }) {
  const key = `atlas_tree_${worldId}`
  const [folded, setFolded] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')) } catch (e) { return new Set() }
  })
  const remember = (set) => { try { localStorage.setItem(key, JSON.stringify([...set])) } catch (e) { /* ignore */ } }
  const byId = useMemo(() => new Map(tree.map((m) => [m.id, m])), [tree])
  const kids = useMemo(() => {
    const k = new Map()
    for (const m of tree) {
      if (m.id === rootId) continue
      const pid = m.parentMapId != null && byId.has(m.parentMapId) ? m.parentMapId : null
      if (!k.has(pid)) k.set(pid, [])
      k.get(pid).push(m)
    }
    for (const list of k.values()) list.sort((a, b) => a.title.localeCompare(b.title))
    return k
  }, [tree, rootId, byId])
  // the current map's ancestors are never folded shut — you can always see where you are
  const openPath = useMemo(() => {
    const set = new Set(); let cur = byId.get(Number(mapId)); let guard = 0
    while (cur && cur.parentMapId != null && guard++ < 50) { set.add(cur.parentMapId); cur = byId.get(cur.parentMapId) }
    return set
  }, [byId, mapId])
  const isFolded = (id) => folded.has(id) && !openPath.has(id)
  const toggle = (id) => setFolded((f) => { const n = new Set(f); if (n.has(id)) n.delete(id); else n.add(id); remember(n); return n })
  const countUnder = (id) => (kids.get(id) || []).reduce((acc, c) => acc + 1 + countUnder(c.id), 0)
  const foldAll = () => { const n = new Set([...kids.keys()].filter((k) => k != null)); remember(n); setFolded(n) }
  const unfoldAll = () => { const n = new Set(); remember(n); setFolded(n) }

  const row = (m, depth, isRoot = false) => {
    const children = kids.get(m.id) || []
    const has = children.length > 0
    const closed = has && isFolded(m.id)
    return (
      <React.Fragment key={m.id}>
        <div className={`trow ${String(m.id) === String(mapId) ? 'on' : ''}`} style={{ paddingLeft: 6 + depth * 14 }}
          onClick={() => onGo(m.id)} title={m.title}>
          {depth > 0 && <span className="tguide" style={{ left: 6 + (depth - 1) * 14 + 5 }} />}
          {has
            ? <button type="button" className="tcaret" title={closed ? `Unfold — ${countUnder(m.id)} inside` : 'Fold this branch'}
                onClick={(e) => { e.stopPropagation(); toggle(m.id) }}>{closed ? '▸' : '▾'}</button>
            : <span className="tcaret none" />}
          {m.thumbUrl ? <img className="tthumb" src={m.thumbUrl} alt="" /> : <span className="tnothumb" />}
          <span className="ttitle">{isRoot ? (m.title || 'World map') : m.title}</span>
          {closed && <span className="tcount">+{countUnder(m.id)}</span>}
        </div>
        {!closed && children.map((c) => row(c, depth + 1))}
      </React.Fragment>
    )
  }
  const root = byId.get(rootId)
  const orphans = kids.get(null) || []
  return (
    <>
      <div className="ttools">
        <button type="button" onClick={unfoldAll} title="Open every branch">expand all</button>
        <button type="button" onClick={foldAll} title="Close every branch">collapse all</button>
      </div>
      {root && row(root, 0, true)}
      {orphans.length > 0 && (
        <>
          <div className="tsect" title="Interiors whose owner isn't placed on any map yet">Unplaced</div>
          {orphans.map((m) => row(m, 1))}
        </>
      )}
    </>
  )
}

function DeleteImpact({ impact, spotlit, party }) {
  if (!impact) return <p className="muted">This removes the node from every map, along with its links.{spotlit ? ' The lantern pointing at it goes out.' : ''}</p>
  const bits = []
  if (party) bits.push(`This erases the party's trail: ${party.steps} ${party.steps === 1 ? 'footstep' : 'footsteps'} across ${party.maps} ${party.maps === 1 ? 'map' : 'maps'}${party.first != null ? (party.first === party.last ? `, session ${party.first}` : `, sessions ${party.first}–${party.last}`) : ''} — the timebar ticks and the players' From / Then on to links with it.`)
  if (spotlit) bits.push('The lantern points at it — the trail goes out (Undo relights it).')
  const maps = impact.maps ?? impact.placements
  if (!party && maps > 1) bits.push(`It sits on ${maps} maps — it disappears from all of them.`)
  if (impact.interiorMaps > 0) {
    bits.push('Its interior is deleted too.')
    if (impact.nodesInside > 0) {
      bits.push(`${impact.nodesInside} ${impact.nodesInside === 1 ? 'node' : 'nodes'} inside will be left unplaced — they still exist (findable with search), but lose their spot.`)
    }
    if (impact.nestedMaps > 0) {
      bits.push(`${impact.nestedMaps} ${impact.nestedMaps === 1 ? 'space' : 'spaces'} nested deeper inside stay — their owners keep them, listed under Unplaced in the map tree.`)
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

function TimelineConfig({ tl, eras, onSave, onDisable, onClose, onEraAdd, onEraPatch, onEraDelete, onNextSession }) {
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
      <div className="muted esmall">Name the ages of your world. 🎭 opens that era to players — they can scrub the revealed past, never beyond canon.</div>
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
            onClick={() => onEraPatch(e.id, { player_visible: !e.playerVisible })}>🎭</button>
          <button className="ex" title="Delete this era" onClick={() => onEraDelete(e.id)}>✕</button>
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

function Inspector({ p, stray, partyExists, voicesErr, onVoicesRetry, onSave, onCat, onClaim, autoFocusTitle, onTitleFocused, onOpen, onCreate, onRemoveInterior, onImage, onRemoveImage, timeline, eras, onLifespan, facts, nowT, nowLabel, hiddenHere, onHideHere, onFootstep, onFactAdd, onFactPatch, onFactDelete, links, onLink, onUnlink, onLabel, onJump, onVis, onRemoveHere, onPlaceHere, onDelete, spotlit, onSpotlight, onStance, voiceOn, voices, voiceMeta, onVoice, onSay, onClearLine, onReveal, hasOutline, onOutline, onClearOutline, outlineKind, onOutlineKind, outlineStyle, onOutlineStyle }) {
  const seedOf = (pp) => ({ title: pp.node.title, body: pp.node.body || '', note: pp.node.dmNote || '', line: pp.node.voiceLine || '', vstyle: pp.node.voiceStyle || '', start: pp.start ?? '', end: pp.end ?? '' })
  const [title, setTitle] = useState(p.node.title)
  const [body, setBody] = useState(p.node.body || '')
  const [note, setNote] = useState(p.node.dmNote || '')
  const [line, setLine] = useState(p.node.voiceLine || '')
  const [vstyle, setVstyle] = useState(p.node.voiceStyle || '')
  const [vbusy, setVbusy] = useState(false)
  const [start, setStart] = useState(p.start ?? '')
  const titleRef = useRef(null)
  // a just-dropped node: its title is focused with 'New node' selected, ready to be typed over
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
          <input data-fld="start" type="number" step={1} placeholder="from" value={start}
            onChange={(e) => { const v = e.target.value; setStart(v); const n = wholeOr(v); if (n !== undefined) onLifespan('start', n) }} />
          <span>→</span>
          <input data-fld="end" type="number" step={1} placeholder="to" value={end}
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
      <div className="fld"><label>Title</label>
        <input data-fld="title" ref={titleRef} maxLength={255} value={title} onChange={(e) => { setTitle(e.target.value); onSave(n.id, { title: e.target.value }) }} />
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
                onClick={onRemoveInterior} aria-label="Close">✕</button>
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
        <div className="visseg" title="Who can see this node">
          <button className={n.visibility === 'shared' ? 'on' : ''} title="Everyone can see it" onClick={() => onVis('shared')}>👁 Players</button>
          <button className={n.visibility === 'dm' ? 'on' : ''} title="DM only — hidden from players" onClick={() => onVis('dm')}>🔒 DM</button>
        </div>
      </div>
      {onSpotlight && n.category !== 'party' && <button className={`btn block ${spotlit ? 'lit' : ''}`}
        title={spotlit ? 'Players see a golden trail leading here — click to put it out'
          : 'Light a golden trail for players: on each map along the way, the next step glows'}
        onClick={onSpotlight}>
        {spotlit ? '🔦 Stop showing the way' : '🔦 Show players the way here'}
      </button>}
      {n.category !== 'party' && (
      <div className="strow" title="How they stand toward the party — your eyes only, never shown to players">
        {[['friend', '🟢 Friend'], ['neutral', '⚪ Neutral'], ['foe', '🔴 Foe']].map(([v, l]) => (
          <button key={v} className={n.stance === v ? 'on' : ''}
            onClick={() => onStance(n.stance === v ? null : v)}>{l}</button>
        ))}
      </div>
      )}
      {n.category === 'party' && timeBlock}
      <div className="isect">Story</div>
      <div className="fld"><label>Description{timeline?.enabled ? ' — the default, when no period below covers the moment' : ''}</label>
        <textarea data-fld="body" rows="4" value={body} onChange={(e) => { setBody(e.target.value); onSave(n.id, { body: e.target.value }) }} />
      </div>
      <div className="fld dmnotes"><label>🔒 DM notes — players never see this</label>
        <textarea data-fld="note" rows="3" value={note} placeholder="Secrets, truths, plans — yours alone. The painter never reads this either."
          onChange={(e) => { setNote(e.target.value); onSave(n.id, { dm_note: e.target.value }) }} />
        {note.trim() && (() => {
          // players read the period text covering CANON when there is one: the secret goes there
          const covering = timeline?.enabled ? coveringFact(facts, timeline.current) : null
          return (
            <button className="btn block" style={{ marginTop: 5 }}
              title={covering ? 'Moves the note into the period text players read at the canon moment — this is how a secret becomes known'
                : 'Moves the note into the public description — this is how a secret becomes known'}
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
                <button className="lx" title="Remove this period's text" onClick={() => onFactDelete(f.id)}>✕</button>
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
              <button className={`chip ${n.pin !== 'image' ? 'on' : ''}`} onClick={() => onSave(n.id, { pin: 'chip' })}>Pin: icon + name</button>
              <button className={`chip ${n.pin === 'image' ? 'on' : ''}`} onClick={() => onSave(n.id, { pin: 'image' })}>Pin: the image</button>
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
                  {dir === 'in' && <span className="lref">refers here</span>}
                  <button className="lx" title="Label this thread — players read the label" onClick={() => setLabelEdit(l.id)}>✎</button>
                  <button className="lx" title="Remove this thread" onClick={() => onUnlink(l.id)}>✕</button>
                </>
              )}
            </div>
          ))}
          {(!links?.out?.length && !links?.in?.length) && <div className="muted">No threads yet.</div>}
        </div>
        <button className="btn block" onClick={onLink}>＋ Thread to another node</button>
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
              {[['fill', 'Fill', 'A tint inside the outline (fades with size)'], ['stroke', 'Outline', 'The drawn edge'], ['grow', 'Grow', 'Scales up 5% under the pointer'], ['glow', 'Glow', 'A halo under the pointer'], ['pop', 'Pop', 'The art inside lifts out of the map under the pointer']].map(([k, label, tip]) => (
                <button key={k} type="button" className={outlineStyle?.[k] ? 'on' : ''} title={tip} onClick={() => onOutlineStyle(k, !outlineStyle?.[k])}>{label}</button>
              ))}
            </span>
          </div>
        </div>
      )}
      {!stray && onHideHere && n.visibility !== 'dm' && (
        <button className={`btn block ${hiddenHere ? 'lit' : ''}`}
          title={hiddenHere ? 'Players cannot see it on THIS map — click to show it here' : 'Hide it on this map only — the node stays visible wherever else it is placed'}
          onClick={() => onHideHere(!hiddenHere)}>{hiddenHere ? '🔒 Hidden on this map — show it here' : '👁 Shown on this map — hide it here'}</button>
      )}
      <div className="onmaprow">
        {stray
          ? <button className="btn" title="Give it a spot on the map you are looking at" onClick={onPlaceHere}>⤓ Place on this map</button>
          : <button className="btn" title="Take it off this map only — the node itself survives" onClick={onRemoveHere}>⤒ Remove from map</button>}
        <button className="btn danger" onClick={onDelete}>🗑 Delete…</button>
      </div>
    </>
  )
}

// Upload a new image (to R2 via the existing pipeline), pick an existing one from this
// world, or — when the Forge is on — paint one for exactly the thing being decorated.
function ImagePicker({ worldId, hasCurrent, onPick, onClose, generate, onGenerated }) {
  const [images, setImages] = useState(null) // null = loading
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
    imageServiceBase64.getImages({ worldId }).then((r) => setImages(r.images || [])).catch((e) => { setImages([]); setErr(errText(e, "Couldn't load the images")) })
  }, [worldId])

  const upload = async (file) => {
    if (!file) return
    setBusy(true); setErr('')
    try {
      const r = await imageServiceBase64.uploadImage(file, worldId)
      onPick(r.image.id, r.image.url)
    } catch (e) {
      setBusy(false); setErr(errText(e, 'Upload failed'))
    }
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h4>Choose image</h4><button onClick={onClose} aria-label="Close">✕</button></div>
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
        <label className="btn block">
          {busy ? 'Uploading…' : '⬆ Upload new image'}
          <input type="file" accept="image/*" hidden disabled={busy} onChange={(e) => upload(e.target.files[0])} />
        </label>
        {hasCurrent && <button className="btn block" onClick={() => onPick(null, null)}>Remove current image</button>}
        {err && <div className="muted" style={{ color: '#ff9b9b' }}>{err}</div>}
        <div className="pick-grid">
          {images === null && <div className="muted">Loading…</div>}
          {(images || []).map((im) => (
            <button key={im.id} className="pick" onClick={() => onPick(im.id, im.url)}
              title={`${im.originalName}${usesOf(im) > 0 ? ' — in use in your world' : ' — not used anywhere yet'}`}>
              <img src={im.url} alt={im.originalName} loading="lazy" />
              <span className="pname">{im.originalName}</span>
              {usesOf(im) > 0
                ? <span className="puse on" title="In use in your world">◈</span>
                : <span className="puse" title="Not used anywhere yet">○</span>}
            </button>
          ))}
          {images !== null && images.length === 0 && !err && <div className="muted">No images in this world yet — upload one above.</div>}
        </div>
      </div>
    </div>
  )
}

// Pick a node from this world (searchable). onPick gets the id; onPickNode the whole node.
function NodePicker({ worldId, excludeId, excludeIds, excludedNote, title = 'Thread to…', unplacedFirst, onPick, onPickNode, onClose }) {
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
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h4>{title}</h4><button onClick={onClose} aria-label="Close">✕</button></div>
        <input className="nsearch" autoFocus placeholder="Search nodes…" value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && list[0]) { e.preventDefault(); pick(list[0]) } }} />
        <div className="nlist">
          {nodes === null && <div className="muted">Loading…</div>}
          {err && <div className="muted">{err} <button type="button" className="lnk" onClick={load}>Retry</button></div>}
          {list.map((n) => (
            <button key={n.id} className="nrow" onClick={() => pick(n)}>
              <span className="ic" style={{ background: cat(n.category).c }}>{cat(n.category).i}</span>
              <span className="lbl">{n.title}</span>
              {n.placed === false && <span className="gorphan">○ unplaced</span>}
              {n.hasInterior && <span className="open">◎</span>}
            </button>
          ))}
          {nodes !== null && !err && list.length === 0 && left.length === 0 && <div className="muted">No matching nodes.</div>}
          {left.length > 0 && <div className="muted esmall">{excludedNote || 'Left out'}: {left.slice(0, 6).map((n) => n.title).join(', ')}{left.length > 6 ? '…' : ''}</div>}
        </div>
      </div>
    </div>
  )
}

// ---- The Forge: the world's mind, as a conversation ------------------------------
// One box, no modes: the mind reads what the DM wants — a question, a session recap, a
// build, a painting — from the words and the standing context (current map + selected
// node, shown as a chip). Whatever it makes lands as a card threaded under the reply that
// made it, keep/unmake-able; privileged acts wait behind Allow.
// plain words for what a creation made, singular and plural
const COUNT_WORDS = {
  images: ['painting', 'paintings'], nodes: ['new thing', 'new things'], maps: ['new space', 'new spaces'],
  placements: ['spot on a map', 'spots on maps'], links: ['thread', 'threads'], eras: ['era', 'eras'],
  backdrops: ['timed backdrop', 'timed backdrops'], facts: ['period text', 'period texts'],
  enrichedBodies: ['description filled', 'descriptions filled'], enrichedNotes: ['note filled', 'notes filled'],
  enrichedImages: ['piece of art attached', 'pieces of art attached'], noteAppends: ['note extended', 'notes extended'],
  stanceChanges: ['stance set', 'stances set'], mapNoteAppends: ['map note extended', 'map notes extended'], mapBases: ['backdrop set', 'backdrops set'],
}
const countLabel = (k, v) => `${v} ${(COUNT_WORDS[k] || [k, k])[v === 1 ? 0 : 1]}`

function ForgePanel({ worldId, map, sel, onFlash, onRefresh, onClose }) {
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
  const [dropNode, setDropNode] = useState(false) // the DM cleared the selection chip for this message
  const logRef = useRef(null)
  useEffect(() => { setDropNode(false) }, [sel?.node?.id])

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
      .then(() => { base.current = { ...base.current, ...Object.fromEntries(dirty.map((k) => [k, mind[k]])) }; onFlash({ kind: 'ok', text: 'The mind took it in' }) })
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
      onFlash({ kind: 'info', text: full.length > 100000 ? 'Loaded and trimmed to 100,000 characters — Save the mind to keep it' : 'Loaded — Save the mind to keep it' })
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
    const nodeId = sel && !dropNode ? sel.node.id : undefined
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
        onFlash({ kind: 'err', text: e?.response ? errText(e, 'The mind did not answer') : 'No connection to the mind — your message is back in the box' })
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
          const names = [...(bl.placements || []).map((p) => `${p.title} (in ${p.map})`), ...(bl.maps || []).map((t) => `the space “${t}”`)]
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
          <div className="fhint">Threads, secrets, and session summaries it keeps between sessions. It reads the latest 20,000 characters every turn — edit freely.</div>
          <textarea rows={8} value={mind.lore} placeholder="Nothing remembered yet."
            onChange={(e) => setMind((m) => ({ ...m, lore: e.target.value }))} />
          <button className="tool on" disabled={savingMind || !base.current || !dirty.length} onClick={saveMind}
            title={!base.current ? 'The mind has not loaded yet' : dirty.length ? `Saves ${dirty.length} changed ${dirty.length === 1 ? 'field' : 'fields'}` : 'Nothing changed'}>
            {savingMind ? 'Saving…' : dirty.length ? 'Save the mind' : 'Saved'}</button>
        </div>
      )}
      {view === 'chat' && (<>
      <div className="flog" ref={logRef}>
        {msgs === null && <div className="fintro">Waking the mind…</div>}
        {loadErr && (
          <div className="fintro">Couldn't wake the mind — the conversation and settings did not load.
            <div className="fbrow"><button className="tool" onClick={() => refreshMind(true).catch(() => setLoadErr(true))}>Retry</button></div></div>
        )}
        {msgs !== null && msgs.length === 0 && !loadErr && (
          <div className="fintro">
            Talk to the world. Ask what anyone knows, tell it what happened last session, or say
            what to build or paint — it reads the words and does the rest. It knows what you
            have selected and where you're standing.
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
          {sel && !dropNode && (
            <span className="fchip" title="The mind sees this node in full — its story, notes, threads">
              ↳ {trunc(sel.node.title)}
              <button onClick={() => setDropNode(true)} title="Leave this node out of the message">✕</button>
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

export default AtlasWorkspace
