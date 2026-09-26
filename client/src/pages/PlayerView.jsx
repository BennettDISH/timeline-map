import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import shareService from '../services/shareService'
import MapPlane from '../components/MapPlane'
import EraScrub from '../components/EraScrub'
import AudioClip from '../components/AudioClip'
import PartyTrail from '../components/PartyTrail'
import Regions, { regionIdAt } from '../components/Regions'
import { momentLabel, sessionOf, sessionColor, partyWhere, partyNeighbors } from '../utils/moment'
import { CATS, cat } from '../utils/categories'
import '../styles/atlas.scss'

// The read-only Player View behind a share link (/p/:token). Everything secret or
// not-yet-happened is already filtered by the server; this page just draws what it's given.
// Mobile-first: players hold phones at the table — the map plane pans and pinch-zooms, and
// pins sit on the same point of the map art as on the DM's screen. It re-fetches on a slow
// poll and on tab focus so the world updates when the DM advances the clock or reveals
// something. Only a real 404 kills the link; a flaky network keeps the last good view.
function PlayerView() {
  const { token, mapId } = useParams()
  const navigate = useNavigate()

  const [world, setWorld] = useState(null)
  const [data, setData] = useState(null) // { map, placements, links, breadcrumb }
  const [detail, setDetail] = useState(null) // opened node { node, links, backlinks }
  const [gone, setGone] = useState(false)
  const [stale, setStale] = useState(false) // last refresh failed (network hiccup)
  const [flash, setFlash] = useState(null) // transient error text when a node tap fails
  const [viewT, setViewT] = useState(null) // a moment in the revealed past (null = now/canon)
  const [marking, setMarking] = useState(false) // armed: next map tap drops a marker
  const [hovId, setHovId] = useState(null) // the outlined place under the pointer (its name floats up)
  const [markForm, setMarkForm] = useState(null) // { x, y } while the little form is open
  const [markBusy, setMarkBusy] = useState(false)
  const viewTRef = useRef(null); viewTRef.current = viewT
  const worldRef = useRef(null)
  const ambRef = useRef(null)
  const [ambOn, setAmbOn] = useState(false) // the space's ambience loop, started by a tap
  useEffect(() => { const a = ambRef.current; if (a) { a.pause(); a.currentTime = 0 } setAmbOn(false) }, [mapId])
  const toggleAmb = () => {
    const a = ambRef.current
    if (!a) return
    if (ambOn) { a.pause(); setAmbOn(false) } else { a.play().then(() => setAmbOn(true)).catch(() => {}) }
  }

  // ONE windowed fetch per map: the payload carries everything visible at any revealed
  // moment (lifespans clamped server-side), so scrubbing filters locally with zero
  // round trips. viewT rides a ref — moving the era bar never refetches the map.
  const load = useCallback(() => {
    shareService.getWorld(token)
      .then((w) => {
        setWorld(w)
        return shareService.getMap(token, mapId || w.rootMapId, viewTRef.current, true)
          .then((d) => { setData(d); setStale(false) })
      })
      .catch((e) => {
        const s = e?.response?.status
        if (s === 404 || s === 410) setGone(true) // the link (or this map) really is dead
        else setStale(true) // transient failure: keep showing what we have
      })
  }, [token, mapId])

  useEffect(() => { setDetail(null); load() }, [load])

  // Keep the view current without the player doing anything.
  useEffect(() => {
    const iv = setInterval(load, 45000)
    const onVis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', onVis) }
  }, [load])

  // Node taps can fail too (flaky network, node hidden again) — say so briefly instead
  // of doing nothing, using the same flash surface as the workspace.
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 4000)
    return () => clearTimeout(t)
  }, [flash])

  const openNode = (nodeId) =>
    shareService.getNode(token, nodeId, viewT).then(setDetail)
      .catch(() => setFlash("Couldn't load that — tap it again."))
  // an open sheet keeps up with the era bar — debounced, since live scrubbing streams moments
  useEffect(() => {
    if (!detail?.node?.id) return
    const id = detail.node.id
    const timer = setTimeout(() => {
      shareService.getNode(token, id, viewT).then(setDetail)
        .catch(() => setFlash("Couldn't refresh — showing the last thing we saw."))
    }, 300)
    return () => clearTimeout(timer)
  }, [viewT]) // eslint-disable-line
  const goTo = (nodeId) =>
    shareService.locateNode(token, nodeId, viewT)
      .then(({ mapId: target }) => { if (target) navigate(`/p/${token}/m/${target}`) })
      .catch(() => setFlash("Couldn't find where that is — try again."))
  const enter = (node) => { if (node.hasInterior) navigate(`/p/${token}/m/${node.interiorMapId}`) }
  // a tap on an outlined region (resolved under the pointer — see Regions.jsx)
  const regionAt = (e) => { const id = regionIdAt(e); return id == null ? null : ((data?.placements || []).find((p) => p.id === id) || null) }
  const onRegionTap = (e) => { const p = regionAt(e); if (p) openNode(p.node.id) }

  const onMarkClick = (e) => {
    if (!marking || !worldRef.current) return
    const rect = worldRef.current.getBoundingClientRect()
    setMarkForm({
      x: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)),
    })
    setMarking(false)
  }
  const submitMarker = async (title, body, category, author) => {
    setMarkBusy(true)
    try {
      try { localStorage.setItem('atlas_marker_name', author || '') } catch (err) { /* ignore */ }
      await shareService.addMarker(token, mapId || world.rootMapId, {
        title, body, category, author, x: markForm.x, y: markForm.y,
      })
      setMarkForm(null)
      load() // live for everyone; the rest of the table catches it on their next poll
    } catch (err) { /* the form stays open to retry */ }
    setMarkBusy(false)
  }

  if (gone) {
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
  if (!world || !data) {
    return <div className="atlas pview"><div className="loading" style={{ gridRow: '1 / 3' }}>Opening the world…</div></div>
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
    rows.sort((a, b) => ((b.start ?? -Infinity) - (a.start ?? -Infinity)) || (b.id - a.id))
    return rows[0].url
  })()

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
        {stale && <span className="stalechip" title="Couldn't refresh — showing the last thing we saw">offline?</span>}
        {tl?.enabled && (
          <span className="nowchip" title={viewT != null ? 'A remembered moment — the era bar goes back to now' : 'The current moment, set by your DM'}>
            🕓 {viewT != null ? `${momentLabel(viewT, world.eras, tl.unit)} · the past` : momentLabel(tl.current, world.eras, tl.unit)}
          </span>
        )}
        {map?.ambienceUrl && (
          <button className={`ambbtn ${ambOn ? 'on' : ''}`} onClick={toggleAmb} title={ambOn ? 'Quiet the ambience' : 'Hear this place'}>
            {ambOn ? '🔊 Playing' : '🔈 Ambience'}
          </button>
        )}
        <audio ref={ambRef} loop preload="none" src={map?.ambienceUrl || undefined} />
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
                  onClick={() => { if (s.mapId !== map?.id) navigate(`/p/${token}/m/${s.mapId}`) }}>{s.title}</a>
              </React.Fragment>
            ))}
          </div>
        )}
        <div className="stage">
          {tl?.enabled && (() => {
            const at = partyWhere(data.partyTrail, tEff)
            if (!at || String(at.mapId) === String(map?.id)) return null
            const so = sessionOf(tEff, world.eras)
            return (
              <button className="partychip" onClick={() => navigate(`/p/${token}/m/${at.mapId}`)} title="Where you are at this moment — tap to go there">
                ⚑ You are at <b>{at.mapTitle}</b>{so ? ` · S${so.idx + 1}·${so.step}` : ''} — go
              </button>
            )
          })()}
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
              onEmptyPointerDown={(e) => { if (!e?.target?.closest?.('.region')) setDetail(null) }}
              onWorldClick={marking ? onMarkClick : onRegionTap}
              onWorldDoubleClick={(e) => { if (marking) return false; const p = regionAt(e); if (!p) return false; enter(p.node); return true }}
              dblZoom={!marking}
            >
              <PartyTrail placements={data.placements} t={tEff} eras={world.eras}
                onStep={(st) => { if (tl?.current == null || st <= tl.current) setViewT(st >= (tl?.current ?? st) ? null : st) }} />
              <Regions inert={marking} hoverId={hovId} onHover={setHovId}
                items={shownPlacements.filter((p) => p.shape && p.node.category !== 'party').map((p) => ({
                  id: p.id, pts: p.shape, kind: p.shapeKind, x: p.x, y: p.y, title: p.node.title, node: p.node, hasInterior: p.node.hasInterior,
                  cls: `${detail?.node?.id === p.node.id ? 'sel' : ''} ${trailIds.has(p.node.id) ? 'spot' : ''}`,
                }))}
 />
              {shownPlacements.filter((p) => !p.shape || p.node.category === 'party').map((p) => (
                <div key={p.id}
                  className={`pin ${p.node.pin === 'image' && p.node.imageUrl ? 'ipin' : ''} ${p.node.player ? 'pmark' : ''} ${detail?.node?.id === p.node.id ? 'sel' : ''} ${p.node.hasInterior ? 'open2' : ''} ${trailIds.has(p.node.id) ? 'spot' : ''} ${p.node.category === 'party' ? 'party' : ''}`}
                  style={{ left: `${p.x}%`, top: `${p.y}%`, ...(p.node.category === 'party' ? { '--sc': sessionColor(sessionOf(p.start ?? tEff, world.eras)?.idx ?? 0) } : {}) }}
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
                    <button className="open enter" title="Go inside"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); enter(p.node) }}>◎</button>
                  )}
                  {p.node.category === 'party' && tl?.enabled && (() => { const so = sessionOf(p.start ?? tEff, world.eras); return so ? <span className="stag">S{so.idx + 1}·{so.step}</span> : null })()}
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
                    <button className="open enter" title="Go inside"
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
        </div>
        {tl?.enabled && (
          <EraScrub tl={tl} eras={world.eras || []} value={viewT} onChange={setViewT} live
            win={map?.focusStart != null || map?.focusEnd != null ? { min: map.focusStart, max: map.focusEnd } : null} />
        )}
        </div>

        {markForm && (
          <MarkerForm busy={markBusy} onClose={() => setMarkForm(null)} onSubmit={submitMarker} />
        )}

        {detail && (
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <button className="sclose" onClick={() => setDetail(null)}>✕</button>
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
                const lab = (st) => { const so = sessionOf(st.start ?? tEff, world.eras); return so ? ` · S${so.idx + 1}·${so.step}` : '' }
                if (!prev && !next) return null
                return (
                  <div className="rtrail">
                    {prev && <a onClick={() => { if (prev.start != null) setViewT(prev.start >= (tl?.current ?? prev.start) ? null : prev.start); navigate(`/p/${token}/m/${prev.mapId}`) }}>◂ From {prev.mapTitle}{lab(prev)}</a>}
                    {next && <a onClick={() => { if (next.start != null) setViewT(next.start >= (tl?.current ?? next.start) ? null : next.start); navigate(`/p/${token}/m/${next.mapId}`) }}>Then on to {next.mapTitle}{lab(next)} ▸</a>}
                  </div>
                )
              })()}
              {detail.node.hasInterior && (
                <button className="tool on sgo" onClick={() => enter(detail.node)}>◎ Look inside</button>
              )}
              {(detail.links.length > 0 || detail.backlinks.length > 0) && (
                <>
                  <div className="rk">Threads</div>
                  <div className="links">
                    {[...detail.links, ...detail.backlinks].map((l) => (
                      <div key={`${l.dir}${l.id}`} className={`lrow ${l.dir}`}>
                        <span className="ic sic" style={{ background: cat(l.otherCategory).c }}>{cat(l.otherCategory).i}</span>
                        <span className="lgo" onClick={() => openNode(l.otherId)}>
                          {l.otherTitle}{l.label ? ` — ${l.label}` : ''}
                        </span>
                        <button className="tool" onClick={() => goTo(l.otherId)} title="Go there">⌖</button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {flash && <div className="aflash err">{flash}</div>}
      </div>
    </div>
  )
}

// The little form a marker is born from: name it, note it, sign it.
function MarkerForm({ busy, onClose, onSubmit }) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [category, setCategory] = useState('note')
  const [author, setAuthor] = useState(() => {
    try { return localStorage.getItem('atlas_marker_name') || '' } catch (e) { return '' }
  })
  const submit = (e) => {
    e.preventDefault()
    if (title.trim()) onSubmit(title.trim(), body.trim(), category, author.trim())
  }
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h4>Mark the map</h4><button onClick={onClose}>✕</button></div>
        <input className="nsearch" autoFocus maxLength={80} placeholder="What is here?"
          value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="mcats">
          {Object.entries(CATS).map(([k, v]) => (
            <button key={k} type="button" className={`cdot ${category === k ? 'on' : ''}`} title={v.label}
              style={{ background: v.c }} onClick={() => setCategory(k)}>{v.i}</button>
          ))}
          <span className="mcatname">{cat(category).label}</span>
        </div>
        <textarea className="mnotearea" rows="3" maxLength={500} placeholder="What do you know about it? (optional)"
          value={body} onChange={(e) => setBody(e.target.value)} />
        <input className="nsearch" maxLength={40} placeholder="Sign your name (optional)"
          value={author} onChange={(e) => setAuthor(e.target.value)} />
        <div className="mrow">
          <button className="tool" onClick={onClose}>Cancel</button>
          <button className="tool on" disabled={busy || !title.trim()} onClick={submit}>
            {busy ? 'Placing…' : 'Place it — everyone sees it'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default PlayerView
