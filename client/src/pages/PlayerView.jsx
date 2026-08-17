import React, { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import shareService from '../services/shareService'
import { cat } from '../utils/categories'
import '../styles/atlas.scss'

// The read-only Player View behind a share link (/p/:token). Everything secret or
// not-yet-happened is already filtered by the server; this page just draws what it's given.
// Mobile-first: players hold phones at the table. It re-fetches on a slow poll and on tab
// focus so the world updates when the DM advances the clock or reveals something.
function PlayerView() {
  const { token, mapId } = useParams()
  const navigate = useNavigate()

  const [world, setWorld] = useState(null)
  const [data, setData] = useState(null) // { map, placements, links, breadcrumb }
  const [detail, setDetail] = useState(null) // opened node { node, links, backlinks }
  const [gone, setGone] = useState(false)

  const load = useCallback(() => {
    shareService.getWorld(token)
      .then((w) => {
        setWorld(w)
        return shareService.getMap(token, mapId || w.rootMapId).then(setData)
      })
      .catch(() => setGone(true))
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
    shareService.getNode(token, nodeId).then(setDetail).catch(() => {})
  const goTo = (nodeId) =>
    shareService.locateNode(token, nodeId)
      .then(({ mapId: target }) => { if (target) navigate(`/p/${token}/m/${target}`) })
      .catch(() => {})
  const enter = (node) => { if (node.hasInterior) navigate(`/p/${token}/m/${node.interiorMapId}`) }

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
        {tl?.enabled && <span className="nowchip" title="The current moment, set by your DM">🕓 {tl.current} {tl.unit}</span>}
      </div>

      <div className="main">
        <div className="stage">
          <div
            className={`canvas ${map?.backdropUrl ? '' : 'grid'}`}
            style={map?.backdropUrl ? { backgroundImage: `url(${map.backdropUrl})` } : undefined}
            onClick={() => setDetail(null)}
          >
            {(data.placements || []).map((p) => (
              <div key={p.id}
                className={`pin ${detail?.node?.id === p.node.id ? 'sel' : ''} ${p.node.hasInterior ? 'open2' : ''}`}
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
                onClick={(e) => { e.stopPropagation(); openNode(p.node.id) }}
                onDoubleClick={(e) => { e.stopPropagation(); enter(p.node) }}>
                <span className="ic" style={{ background: cat(p.node.category).c }}>{cat(p.node.category).i}</span>
                <span className="lbl">{p.node.title}</span>
                {p.node.hasInterior && <span className="open">◎</span>}
              </div>
            ))}
            {data.placements.length === 0 && (
              <div className="empty-map">
                <div style={{ fontSize: '2rem' }}>🌫️</div>
                <div>Nothing known here{tl?.enabled ? ' — yet' : ''}.</div>
              </div>
            )}
          </div>
        </div>

        {detail && (
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="shead">
              <span className="ic" style={{ background: cat(detail.node.category).c }}>{cat(detail.node.category).i}</span>
              <h3>{detail.node.title}</h3>
              <span className="scat">{cat(detail.node.category).label}</span>
              <button className="sclose" onClick={() => setDetail(null)}>✕</button>
            </div>
            {detail.node.imageUrl && <img className="simg" src={detail.node.imageUrl} alt="" />}
            {detail.node.body && <p className="sbody">{detail.node.body}</p>}
            {detail.node.hasInterior && (
              <button className="tool on sgo" onClick={() => enter(detail.node)}>◎ Look inside</button>
            )}
            {(detail.links.length > 0 || detail.backlinks.length > 0) && (
              <div className="links">
                {[...detail.links, ...detail.backlinks].map((l) => (
                  <div key={`${l.dir}${l.id}`} className={`lrow ${l.dir}`}>
                    <span className="lgo" onClick={() => openNode(l.otherId)}>
                      {l.dir === 'out' ? '→' : '←'} {l.otherTitle}{l.label ? ` — ${l.label}` : ''}
                    </span>
                    <button className="tool" onClick={() => goTo(l.otherId)} title="Go there">⌖</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default PlayerView
