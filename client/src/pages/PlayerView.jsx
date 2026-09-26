import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import shareService from '../services/shareService'
import MapPlane, { embedded } from '../components/MapPlane'
import EraScrub from '../components/EraScrub'
import AudioClip from '../components/AudioClip'
import PartyTrail from '../components/PartyTrail'
import Regions, { regionIdAt, styleOf } from '../components/Regions'
import { momentLabel, sessionOf, sessionColor, sessionLabel, stepTag, partyNeighbors, latestSession } from '../utils/moment'
import { CATS, MARKABLE, cat } from '../utils/categories'
import '../styles/atlas.scss'

// The dead-link screen: ONLY when the token itself is unknown (or a mangled /p/ URL). A map
// that is hidden, gone or not built yet is a different thing — the link still works.
export function DeadLink() {
  return (
    <div className="atlas pview">
      <div className="deadlink">
        <div style={{ fontSize: '2rem' }}>🗺️</div>
        <h3>This link isn't active</h3>
        <p>Ask your DM for a fresh share link.</p>
      </div>
    </div>
  )
}

// The read-only Player View behind a share link (/p/:token). Everything secret or
// not-yet-happened is already filtered by the server; this page just draws what it's given.
// Mobile-first: players hold phones at the table — the map plane pans and pinch-zooms, and
// pins sit on the same point of the map art as on the DM's screen. It re-fetches on a slow
// poll and on tab focus so the world updates when the DM advances the clock or reveals
// something. Only the reply for the map the player is looking at NOW is ever painted; a
// flaky network keeps the last good view of the SAME map and says so.
function PlayerView() {
  const { token, mapId } = useParams()
  const navigateRaw = useNavigate()
  // inside Spellforge's frame every map move REPLACES the entry: the host's Back button
  // stays the host's, and a removed frame leaves no dead entries behind
  const navigate = (to, opts) => navigateRaw(to, { ...(opts || {}), replace: embedded || !!opts?.replace })

  const [world, setWorld] = useState(null)
  const [data, setData] = useState(null) // { map, placements, links, breadcrumb }
  const [detail, setDetail] = useState(null) // opened node { node, links, backlinks }
  const [dead, setDead] = useState(false) // the token is unknown: the link really is dead
  const [lost, setLost] = useState(null) // { mapId }: this map is not on the player's map (hidden, gone, not built yet)
  const [loadErr, setLoadErr] = useState(null) // { target }: the last fetch for that map failed (network, 500)
  const [stale, setStale] = useState(false) // last refresh failed (network hiccup)
  const [flash, setFlash] = useState(null) // { kind, text }: a brief word about what just happened
  const [viewT, setViewT] = useState(null) // a moment in the revealed past (null = now/canon)
  const [marking, setMarking] = useState(false) // armed: next map tap drops a marker
  const [hovId, setHovId] = useState(null) // the outlined place under the pointer (its name floats up)
  const [markForm, setMarkForm] = useState(null) // { x, y } while the little form is open
  const [markBusy, setMarkBusy] = useState(false)
  const [markErr, setMarkErr] = useState('')
  const [help, setHelp] = useState(false)
  const viewTRef = useRef(null); viewTRef.current = viewT
  const detailRef = useRef(null); detailRef.current = detail
  const worldRef = useRef(null)
  const ambRef = useRef(null)
  const helpRef = useRef(null)
  const loadSeq = useRef(0) // only the reply for the map the player is looking at now is painted
  const nodeSeq = useRef(0) // the last pin tapped owns the sheet
  const [ambOn, setAmbOn] = useState(false) // the space's ambience loop, started by a tap
  const ambienceUrl = data?.map?.ambienceUrl || null
  // a new map, or an ambience the DM changed or removed: the loop stops and the toggle resets
  useEffect(() => { const a = ambRef.current; if (a) { a.pause(); a.currentTime = 0 } setAmbOn(false) }, [mapId, ambienceUrl])
  const toggleAmb = () => {
    const a = ambRef.current
    if (!a) return
    if (ambOn) { a.pause(); setAmbOn(false) } else { a.play().then(() => setAmbOn(true)).catch(() => {}) }
  }
  const say = (text, kind = 'err') => setFlash({ kind, text })

  // The sheet: one request counter, so a reply that lands after a navigation, a close or a
  // later tap can never reopen an older sheet over the one the player asked for.
  const fetchSheet = useCallback((nodeId, t, onFail) => {
    const seq = ++nodeSeq.current
    return shareService.getNode(token, nodeId, t)
      .then((d) => { if (seq === nodeSeq.current) setDetail(d) })
      .catch((e) => { if (seq === nodeSeq.current) onFail?.(e) })
  }, [token])

  // ONE windowed fetch per map: the payload carries everything visible at any revealed
  // moment (lifespans clamped server-side), so scrubbing filters locally with zero
  // round trips. The map is fetched at canon whatever the era bar says — the envelope
  // already covers every allowed moment, so looking at the past never walks a map that
  // did not exist yet.
  const load = useCallback(() => {
    const seq = ++loadSeq.current
    // when the URL already names the map, both requests go out at once — a tap into a
    // building never waits a whole round trip for /world first
    const early = mapId ? shareService.getMap(token, mapId, null, true).catch((e) => ({ failed: e })) : null
    return shareService.getWorld(token)
      .then((w) => {
        if (seq !== loadSeq.current) return
        setWorld(w); setDead(false)
        // a remembered past moment the world no longer allows (its era hidden, canon pulled
        // back) drops to now — the server already resolves it there silently
        const vt = viewTRef.current
        if (vt != null) {
          const tl = w.timeline
          const ok = tl?.enabled && tl.current != null && vt < tl.current && (w.eras || []).some((e) => vt >= e.start && vt <= e.end)
          if (!ok) { setViewT(null); say("Back to now — that stretch of the past isn't open any more", 'info') }
        }
        const target = mapId || w.rootMapId
        return (early ? early.then((d) => { if (d?.failed) throw d.failed; return d }) : shareService.getMap(token, target, null, true))
          .then((d) => {
            if (seq !== loadSeq.current) return
            if (String(d?.map?.id) !== String(target)) return // never another map under this URL
            setData(d); setStale(false); setLost(null); setLoadErr(null)
            // an open sheet keeps up with the DM (a reveal, a rewrite); one hidden again closes
            const open = detailRef.current?.node?.id
            if (open) fetchSheet(open, viewTRef.current, (e) => { if (e?.response?.status === 404) { setDetail(null); say('That is no longer on your map', 'info') } })
          })
          .catch((e) => {
            if (seq !== loadSeq.current) return
            if (e?.response?.status === 404) { setLost({ mapId: target }); return } // this place, not the link
            setStale(true); setLoadErr({ target })
          })
      })
      .catch((e) => {
        if (seq !== loadSeq.current) return
        const s = e?.response?.status
        if (s === 404 || s === 410) { setDead(true); return } // the link itself is dead
        setStale(true); setLoadErr({ target: mapId || null })
      })
  }, [token, mapId, fetchSheet])

  useEffect(() => {
    nodeSeq.current++ // a sheet asked for on the previous map never opens on this one
    setDetail(null); setLost(null); setLoadErr(null); setMarking(false); setMarkForm(null); setHelp(false)
    load()
  }, [load])

  // Keep the view current without the player doing anything.
  useEffect(() => {
    const iv = setInterval(load, 45000)
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis) }
  }, [load])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 4000)
    return () => clearTimeout(t)
  }, [flash])
  useEffect(() => { document.title = world?.name ? `${world.name} — map` : 'Fantasy Map Timeline' }, [world?.name])
  // the current crumb stays in view on phones, where the trail scrolls sideways
  useEffect(() => { document.querySelector('.pview .crumbs .here')?.scrollIntoView?.({ inline: 'end', block: 'nearest' }) }, [data?.map?.id])
  useEffect(() => {
    if (!help) return
    const close = (e) => { if (helpRef.current && !helpRef.current.contains(e.target)) setHelp(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [help])

  const openNode = (nodeId) => fetchSheet(nodeId, viewT, () => say("Couldn't load that — tap it again."))
  // an open sheet keeps up with the era bar — debounced, since live scrubbing streams moments
  useEffect(() => {
    if (!detail?.node?.id) return
    const id = detail.node.id
    const timer = setTimeout(() => fetchSheet(id, viewT, () => say("Couldn't refresh — showing the last thing we saw.")), 300)
    return () => clearTimeout(timer)
  }, [viewT]) // eslint-disable-line
  const here = (id) => String(id) === String(mapId || world?.rootMapId)
  const goMap = (id) => { if (here(id)) load(); else navigate(`/p/${token}/m/${id}`) } // the URL already open refetches instead of a no-op
  // ⌖ "go there": where it stands now — or, if it only stood somewhere in the revealed past,
  // the era bar moves to that moment (the server says which) and the map follows
  const goTo = (nodeId) =>
    shareService.locateNode(token, nodeId, viewT)
      .then(({ mapId: target, t }) => {
        if (t != null && t !== viewT) {
          setViewT(t)
          say(`Looking back to ${momentLabel(t, world?.eras || [], world?.timeline?.unit)} — that is when it was there`, 'info')
        }
        if (target) goMap(target)
      })
      .catch((e) => say(e?.response?.status === 404 ? 'Not on any map at this moment' : "Couldn't find where that is — try again."))
  const enter = (node) => { if (node.hasInterior) goMap(node.interiorMapId) }
  // a tap on an outlined region (resolved under the pointer — see Regions.jsx)
  const regionAt = (e) => { const id = regionIdAt(e); return id == null ? null : ((data?.placements || []).find((p) => p.id === id) || null) }
  // a clean tap on the map: a region opens its sheet, empty map closes the open one — a drag never does
  const onRegionTap = (e) => { const p = regionAt(e); if (p) openNode(p.node.id); else setDetail(null) }

  const onMarkClick = (e) => {
    if (!marking || !worldRef.current) return
    const rect = worldRef.current.getBoundingClientRect()
    setMarkErr('')
    setMarkForm({
      x: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)),
    })
    setMarking(false)
  }
  const submitMarker = async (title, body, category, author) => {
    setMarkBusy(true); setMarkErr('')
    try {
      try { localStorage.setItem('atlas_marker_name', author || '') } catch (err) { /* ignore */ }
      await shareService.addMarker(token, mapId || world.rootMapId, {
        title, body, category, author, x: markForm.x, y: markForm.y,
      })
      setMarkForm(null)
      say('Placed — everyone at the table sees it', 'ok')
      load() // live for everyone; the rest of the table catches it on their next poll
    } catch (err) {
      // the form stays open with the words, and says why it did not land
      const s = err?.response?.status
      setMarkErr(s === 429 ? 'Too many markers from this table for now — try again in a while'
        : (err?.response?.data?.message || "Couldn't place it — check your connection and try again"))
    }
    setMarkBusy(false)
  }

  if (dead) return <DeadLink />
  if (lost) {
    return (
      <div className="atlas pview">
        <div className="deadlink">
          <div style={{ fontSize: '2rem' }}>🌫️</div>
          <h3>This place isn't on your map</h3>
          <p>It may be hidden, not built yet, or gone.{world?.name ? ` Your link to ${world.name} still works.` : ''}</p>
          <button className="tool on" onClick={() => navigate(`/p/${token}`)}>⬆ Back to the map</button>
        </div>
      </div>
    )
  }
  if (!world || !data) {
    return (
      <div className="atlas pview">
        {loadErr ? (
          <div className="deadlink">
            <div style={{ fontSize: '2rem' }}>📡</div>
            <h3>Couldn't reach the map</h3>
            <p>Check your connection, then try again.</p>
            <button className="tool on" onClick={() => load()}>Try again</button>
          </div>
        ) : <div className="loading" style={{ gridRow: '1 / 3' }}>Opening the world…</div>}
      </div>
    )
  }
  const target = mapId || world.rootMapId
  if (loadErr && String(data.map?.id) !== String(target)) {
    // a navigation whose fetch failed: the previous map is never shown under the new URL
    return (
      <div className="atlas pview">
        <div className="deadlink">
          <div style={{ fontSize: '2rem' }}>📡</div>
          <h3>Couldn't open that place</h3>
          <p>Check your connection, then try again.</p>
          <div className="mrow" style={{ justifyContent: 'center' }}>
            <button className="tool" onClick={() => navigate(`/p/${token}/m/${data.map.id}`)}>⬆ Back to {data.map.title}</button>
            <button className="tool on" onClick={() => load()}>Try again</button>
          </div>
        </div>
      </div>
    )
  }

  const tl = world.timeline
  const map = data.map
  const isList = map?.view === 'list'
  const tEff = viewT != null ? viewT : (tl?.current ?? 0)
  const present = (p) => !tl?.enabled ||
    ((p.start == null || tEff >= p.start) && (p.end == null || tEff <= p.end))
  const shownPlacements = (data.placements || []).filter(present)
  const trail = data.spotlight || [] // the DM's lantern: root -> ... -> the node they mean
  const trailIds = new Set(trail.map((t) => t.nodeId))
  const backdropUrl = (() => {
    if (!tl?.enabled || !data.backdrops || !data.backdrops.length) return map?.backdropUrl
    const rows = data.backdrops.filter((b) =>
      (b.start == null || b.start <= tEff) && (b.end == null || b.end >= tEff))
    if (!rows.length) return map?.backdropUrl
    // the server ranks rows the way the DM's lens does (latest start, then newest); the
    // snapped starts alone could tie two paintings and pick the wrong one
    rows.sort((a, b) => (a.rank != null && b.rank != null)
      ? a.rank - b.rank
      : (((b.start ?? -Infinity) - (a.start ?? -Infinity)) || (b.id - a.id)))
    return rows[0].url
  })()
  const hasParty = (data.placements || []).some((p) => p.node.category === 'party')

  return (
    <div className="atlas pview">
      <div className="top">
        <span className="brand">🧭 {world.name}</span>
        <div className="crumbs">
          {(data.breadcrumb || []).map((b, i, arr) => (
            <React.Fragment key={b.mapId}>
              {i > 0 && <span className="sep">▸</span>}
              {i === arr.length - 1
                ? <span className="here">{b.title}</span>
                : <a onClick={() => navigate(`/p/${token}/m/${b.mapId}`)}>{b.title}</a>}
            </React.Fragment>
          ))}
        </div>
        {stale && <span className="stalechip" role="status" title="Couldn't refresh — showing the last thing we saw">offline · last update shown</span>}
        {tl?.enabled && (
          <span className="nowchip" title={viewT != null ? 'A remembered moment — the era bar goes back to now' : 'The current moment, set by your DM'}>
            🕓 {viewT != null ? `${momentLabel(viewT, world.eras, tl.unit)} · the past` : momentLabel(tl.current, world.eras, tl.unit)}
          </span>
        )}
        {ambienceUrl && (
          <button className={`ambbtn ${ambOn ? 'on' : ''}`} onClick={toggleAmb} title={ambOn ? 'Quiet the ambience' : 'Hear this place'}>
            {ambOn ? '🔊 Playing' : '🔈 Ambience'}
          </button>
        )}
        {ambienceUrl && <audio ref={ambRef} loop preload="none" src={ambienceUrl} />}
      </div>

      <div className="main">
        <div className="pcol">
        {trail.length > 0 && (
          <div className="dmtrail" title="Your DM is showing the way — follow the glow">
            <span className="deye">🔦</span>
            {trail.map((s, i) => (
              <React.Fragment key={s.nodeId}>
                {i > 0 && <span className="sep">▸</span>}
                <a className={`${s.mapId === map?.id ? 'here' : ''} ${i === trail.length - 1 ? 'last' : ''}`}
                  title={s.mapId === map?.id ? 'Read about it' : 'Go to that map'}
                  onClick={() => { if (s.mapId !== map?.id) navigate(`/p/${token}/m/${s.mapId}`); else openNode(s.nodeId) }}>{s.title}</a>
              </React.Fragment>
            ))}
          </div>
        )}
        <div className={`stage ${marking ? 'marking' : ''}`}>
          {(data.breadcrumb || []).length > 1 && (
            <button className="tool backbtn" title="Back up one level"
              onClick={() => navigate(`/p/${token}/m/${data.breadcrumb[data.breadcrumb.length - 2].mapId}`)}>
              ⬆ {data.breadcrumb[data.breadcrumb.length - 2].title}
            </button>
          )}
          {!isList ? (
            <MapPlane
              mapKey={mapId || 'root'}
              backdropUrl={backdropUrl}
              worldRef={worldRef}
              onWorldClick={marking ? onMarkClick : onRegionTap}
              onWorldDoubleClick={(e) => { if (marking) return false; const p = regionAt(e); if (!p) return false; enter(p.node); return true }}
              dblZoom={!marking}
            >
              <PartyTrail placements={data.placements} t={tEff} eras={world.eras} unit={tl?.unit}
                onStep={(st) => { if (tl?.current == null || st <= tl.current) setViewT(st >= (tl?.current ?? st) ? null : st) }} />
              <Regions inert={marking} hoverId={hovId} onHover={setHovId} backdropUrl={backdropUrl} onEnter={(it) => enter(it.node)}
                items={shownPlacements.filter((p) => p.shape && p.node.category !== 'party').map((p) => ({
                  id: p.id, pts: p.shape, kind: p.shapeKind, style: styleOf(p), x: p.x, y: p.y, title: p.node.title, node: p.node, hasInterior: p.node.hasInterior,
                  cls: `${detail?.node?.id === p.node.id ? 'sel' : ''} ${trailIds.has(p.node.id) ? 'spot' : ''}`,
                }))}
 />
              {shownPlacements.filter((p) => !p.shape || p.node.category === 'party').map((p) => (
                <div key={p.id}
                  className={`pin ${p.node.pin === 'image' && p.node.imageUrl ? 'ipin' : ''} ${p.node.player ? 'pmark' : ''} ${detail?.node?.id === p.node.id ? 'sel' : ''} ${p.node.hasInterior ? 'open2' : ''} ${trailIds.has(p.node.id) ? 'spot' : ''} ${p.node.category === 'party' ? 'party' : ''}`}
                  style={{ left: `${p.x}%`, top: `${p.y}%`, ...(p.node.category === 'party' ? { '--sc': sessionColor(sessionOf(p.start ?? tEff, world.eras)?.idx ?? 0, latestSession(world.eras)) } : {}) }}
                  title={p.node.category === 'party' && tl?.enabled ? (() => { const so = sessionOf(p.start ?? tEff, world.eras); return so ? sessionLabel(so, tl.unit) : undefined })() : undefined}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); openNode(p.node.id) }}
                  onDoubleClick={(e) => { e.stopPropagation(); enter(p.node) }}>
                  {p.node.player && <span className="psig" title={p.node.author ? `A player's marker, signed “${p.node.author}”` : 'A player marked this'}>✍</span>}
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
                  {p.node.hasInterior && (
                    <button className="enter" title="Go inside" aria-label="Go inside"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); enter(p.node) }}>◎</button>
                  )}
                  {p.node.category === 'party' && tl?.enabled && (() => { const so = sessionOf(p.start ?? tEff, world.eras); return so ? <span className="stag">{stepTag(so)}</span> : null })()}
                </div>
              ))}
            </MapPlane>
          ) : (
            <div className="listview">
              {shownPlacements.map((p) => (
                <div key={p.id} className={`lsrow ${detail?.node?.id === p.node.id ? 'on' : ''} ${trailIds.has(p.node.id) ? 'spot' : ''}`}
                  onClick={() => openNode(p.node.id)}
                  onDoubleClick={() => enter(p.node)}>
                  <span className="ic" style={{ background: cat(p.node.category).c }}>{cat(p.node.category).i}</span>
                  <div className="lsbody"><div className="lstitle">{p.node.title}</div></div>
                  {p.node.hasInterior && (
                    <button className="enter" title="Go inside" aria-label="Go inside"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); enter(p.node) }}>◎</button>
                  )}
                </div>
              ))}
              {shownPlacements.length === 0 && (
                <div className="empty-map static">
                  <div style={{ fontSize: '2rem' }}>🌫️</div>
                  <div>Nothing known here{tl?.enabled ? ' — yet' : ''}.</div>
                </div>
              )}
            </div>
          )}
          {!isList && shownPlacements.length === 0 && !backdropUrl && (
            <div className="empty-map">
              <div style={{ fontSize: '2rem' }}>🌫️</div>
              <div>Nothing known here{tl?.enabled ? ' — yet' : ''}.</div>
            </div>
          )}
          {!isList && (
            <button className={`tool markbtn ${marking ? 'on' : ''}`}
              title={marking ? 'Tap the map to drop your marker — tap here to cancel' : 'Add your own marker to the map'}
              onClick={() => { setMarking((v) => !v); setDetail(null) }}>
              {marking ? '✕ cancel' : '✍ Mark the map'}
            </button>
          )}
          {marking && <div className="markhint">Tap the map where you want your marker.</div>}
          <div className="helpwrap" ref={helpRef}>
            <button className="tool round" title="What the map's marks mean" aria-label="What the map's marks mean" onClick={() => setHelp((v) => !v)}>?</button>
            {help && (
              <div className="apop helppop">
                <div><b>Tap a pin</b> or an outlined place to read about it · <b>drag</b> to look around · <b>pinch or scroll</b> to zoom</div>
                <div><b>◎</b> goes inside that place · <b>⬆</b> at the top goes back out</div>
                {hasParty && <div><b>⚑ The party</b> is you · <b>S3·7</b> means session 3, footstep 7 · the faint prints are where you have been — tap one to look back at that moment</div>}
                {tl?.enabled && <div><b>The bar at the bottom</b> looks back through the parts of the past your DM has opened · <b>⦿ Now</b> returns to the present</div>}
                <div><b>🔦 Gold glow</b> = your DM is pointing the way · <b>✍ dashed green</b> = a marker someone at the table left</div>
                <div><b>✍ Mark the map</b> leaves your own marker — everyone sees it at once</div>
              </div>
            )}
          </div>
        </div>
        {tl?.enabled && (
          <EraScrub tl={tl} eras={world.eras || []} value={viewT} onChange={setViewT} live />
        )}
        </div>

        {markForm && (
          <MarkerForm busy={markBusy} err={markErr} onClose={() => setMarkForm(null)} onSubmit={submitMarker} />
        )}

        {detail && (
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <button className="sclose" aria-label="Close" onClick={() => setDetail(null)}>✕</button>
            {detail.node.imageUrl && <div className="shero"><img src={detail.node.imageUrl} alt="" /></div>}
            <div className="sinner">
              <div className="shead">
                <span className="ic" style={{ background: cat(detail.node.category).c }}>{cat(detail.node.category).i}</span>
                <h3>{detail.node.title}</h3>
                <span className="scat">{cat(detail.node.category).label}</span>
              </div>
              {detail.node.player && (
                <div className="sby">✍ a player's marker{detail.node.author ? `, signed “${detail.node.author}”` : ''}</div>
              )}
              {detail.node.body && <p className="sbody">{detail.node.body}</p>}
              {detail.node.voiceUrl && (
                <div className="svoice">
                  <div className="rk">In their own voice</div>
                  <AudioClip src={detail.node.voiceUrl} />
                  {detail.node.voiceLine && <span className="sline">“{detail.node.voiceLine}”</span>}
                </div>
              )}
              {detail.node.category === 'party' && tl?.enabled && (() => {
                const { prev, next } = partyNeighbors(data.partyTrail, tEff)
                const lab = (st) => { const so = sessionOf(st.start ?? tEff, world.eras); return so ? ` · ${stepTag(so)}` : '' }
                if (!prev && !next) return null
                return (
                  <div className="rtrail">
                    {prev && <a onClick={() => { if (prev.start != null) setViewT(prev.start >= (tl?.current ?? prev.start) ? null : prev.start); goMap(prev.mapId) }}>◂ From {prev.mapTitle}{lab(prev)}</a>}
                    {next && <a onClick={() => { if (next.start != null) setViewT(next.start >= (tl?.current ?? next.start) ? null : next.start); goMap(next.mapId) }}>Then on to {next.mapTitle}{lab(next)} ▸</a>}
                  </div>
                )
              })()}
              {detail.node.hasInterior && (
                <button className="tool on sgo" onClick={() => enter(detail.node)}>◎ Look inside</button>
              )}
              {detail.links.length > 0 && (
                <>
                  <div className="rk">Threads</div>
                  <div className="links">
                    {detail.links.map((l) => (
                      <div key={`out${l.id}`} className="lrow out">
                        <span className="ic sic" style={{ background: cat(l.otherCategory).c }}>{cat(l.otherCategory).i}</span>
                        <span className="lgo" onClick={() => openNode(l.otherId)}>
                          {l.otherTitle}{l.label ? ` — ${l.label}` : ''}
                        </span>
                        <button className="tool" onClick={() => goTo(l.otherId)} title="Go there" aria-label="Go there">⌖</button>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {detail.backlinks.length > 0 && (
                <>
                  <div className="rk">Mentioned by</div>
                  <div className="links">
                    {detail.backlinks.map((l) => (
                      <div key={`in${l.id}`} className="lrow in">
                        <span className="ic sic" style={{ background: cat(l.otherCategory).c }}>{cat(l.otherCategory).i}</span>
                        <span className="lgo" onClick={() => openNode(l.otherId)} title={`“${l.otherTitle}” refers here${l.label ? `: ${l.label}` : ''}`}>
                          <span className="ldir">←</span>{l.otherTitle}{l.label ? ` — ${l.label}` : ''}
                        </span>
                        <button className="tool" onClick={() => goTo(l.otherId)} title="Go there" aria-label="Go there">⌖</button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {flash && <div className={`aflash ${flash.kind}`}>{flash.text}</div>}
      </div>
    </div>
  )
}

// The little form a marker is born from: name it, note it, sign it. Return places it; a
// failure says why and keeps the words; a double-click can never cancel it.
function MarkerForm({ busy, err, onClose, onSubmit }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [category, setCategory] = useState('note')
  const [author, setAuthor] = useState(() => {
    try { return localStorage.getItem('atlas_marker_name') || '' } catch (e) { return '' }
  })
  const openedAt = useRef(Date.now())
  const downOnBack = useRef(false)
  const submit = (e) => {
    e.preventDefault()
    if (busy) return
    if (title.trim()) onSubmit(title.trim(), body.trim(), category, author.trim())
  }
  return (
    <div className="modal-back"
      onPointerDown={(e) => { downOnBack.current = e.target === e.currentTarget }}
      onClick={(e) => { if (e.target === e.currentTarget && downOnBack.current && Date.now() - openedAt.current > 400) onClose() }}>
      <form className="modal mform" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-head"><h4>Mark the map</h4><button type="button" onClick={onClose} aria-label="Close">✕</button></div>
        <input className="nsearch" autoFocus maxLength={80} placeholder="What is here?"
          value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="mcats">
          {MARKABLE.map((k) => (
            <button key={k} type="button" className={`cdot ${category === k ? 'on' : ''}`} title={CATS[k].label}
              style={{ background: CATS[k].c }} onClick={() => setCategory(k)}>{CATS[k].i}</button>
          ))}
          <span className="mcatname">{cat(category).label}</span>
        </div>
        <textarea className="mnotearea" rows="3" maxLength={500} placeholder="What do you know about it? (optional)"
          value={body} onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(e) } }} />
        <input className="nsearch" maxLength={40} placeholder="Sign your name (optional)"
          value={author} onChange={(e) => setAuthor(e.target.value)} />
        {err && <div className="merr">⚠ {err}</div>}
        <div className="mrow">
          <button type="button" className="tool" onClick={onClose}>Cancel</button>
          <button type="submit" className="tool on placebtn" disabled={busy || !title.trim()}>
            {busy ? 'Placing it…' : 'Place it — everyone sees it'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default PlayerView
