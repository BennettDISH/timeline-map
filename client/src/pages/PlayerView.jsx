import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import shareService from '../services/shareService'
import MapPlane from '../components/MapPlane'
import EraScrub from '../components/EraScrub'
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
  const [viewT, setViewT] = useState(null) // a moment in the revealed past (null = now/canon)
  const [marking, setMarking] = useState(false) // armed: next map tap drops a marker
  const [markForm, setMarkForm] = useState(null) // { x, y } while the little form is open
  const [markBusy, setMarkBusy] = useState(false)
  const viewTRef = useRef(null); viewTRef.current = viewT
  const worldRef = useRef(null)

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

  const openNode = (nodeId) =>
    shareService.getNode(token, nodeId, viewT).then(setDetail).catch(() => {})
  // an open sheet keeps up with the era bar — debounced, since live scrubbing streams moments
  useEffect(() => {
    if (!detail?.node?.id) return
    const id = detail.node.id
    const timer = setTimeout(() => {
      shareService.getNode(token, id, viewT).then(setDetail).catch(() => {})
    }, 300)
    return () => clearTimeout(timer)
  }, [viewT]) // eslint-disable-line
  const goTo = (nodeId) =>
    shareService.locateNode(token, nodeId, viewT)
      .then(({ mapId: target }) => { if (target) navigate(`/p/${token}/m/${target}`) })
      .catch(() => {})
  const enter = (node) => { if (node.hasInterior) navigate(`/p/${token}/m/${node.interiorMapId}`) }

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
            🕓 {viewT != null ? `${viewT} ${tl.unit} · the past` : `${tl.current} ${tl.unit}`}
          </span>
        )}
      </div>

      <div className="main">
        <div className="pcol">
        <div className="stage">
          {!isList ? (
            <MapPlane
              mapKey={mapId || 'root'}
              backdropUrl={backdropUrl}
              worldRef={worldRef}
              onEmptyPointerDown={() => setDetail(null)}
              onWorldClick={marking ? onMarkClick : undefined}
            >
              {shownPlacements.map((p) => (
                <div key={p.id}
                  className={`pin ${p.node.pin === 'image' && p.node.imageUrl ? 'ipin' : ''} ${p.node.player ? 'pmark' : ''} ${detail?.node?.id === p.node.id ? 'sel' : ''} ${p.node.hasInterior ? 'open2' : ''}`}
                  style={{ left: `${p.x}%`, top: `${p.y}%` }}
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
                  {p.node.hasInterior && <span className="open">◎</span>}
                </div>
              ))}
            </MapPlane>
          ) : (
            <div className="listview">
              {shownPlacements.map((p) => (
                <div key={p.id} className={`lsrow ${detail?.node?.id === p.node.id ? 'on' : ''}`}
                  onClick={() => openNode(p.node.id)}
                  onDoubleClick={() => enter(p.node)}>
                  <span className="ic" style={{ background: cat(p.node.category).c }}>{cat(p.node.category).i}</span>
                  <div className="lsbody"><div className="lstitle">{p.node.title}</div></div>
                  {p.node.hasInterior && <span className="open">◎</span>}
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
          {!isList && shownPlacements.length === 0 && (
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
