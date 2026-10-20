import React, { useEffect, useRef } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useAuth } from '../utils/AuthContext'
import TopBar, { Compass } from '../components/TopBar'
import MapPlane from '../components/MapPlane'
import { PinBody, pinClass } from '../components/Pin'
import { cat } from '../utils/categories'
import { usePaged, useAdminGet, SearchBox, Pager, ListState, when, seenBy } from '../components/admin/Browse'
import { Images, Messages, Batches } from '../components/admin/Lists'
import '../styles/shell.scss'
import '../styles/atlas.scss'

// One world as its DM has it, for the admin, read-only: its maps with every pin (DM-only ones
// faded), every entry with its DM note, timed facts, links and placements, the eras with their
// session notes, the images and the Forge's mind and history. Nothing here writes; the
// workspace (/w/…) stays its owner's. Where you are lives in the URL (?tab, ?map, ?node, ?q, ?page).
const span = (start, end) => (start == null && end == null ? 'always' : `${start ?? '…'}–${end ?? '…'}`)

function AdminWorld() {
  const { user } = useAuth()
  const { worldId } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'maps'
  const nodeId = params.get('node')
  // change some of where you are, keeping the rest; an empty value drops the key
  const set = (next) => setParams(Object.fromEntries(Object.entries({ ...Object.fromEntries(params), ...next }).filter(([, v]) => v)))
  const ws = useAdminGet(user?.isAdmin ? `/worlds/${worldId}` : null)

  if (!user?.isAdmin) {
    return (
      <div className="shell">
        <TopBar crumb="Admin" />
        <div className="voidstate">
          <Compass size={92} className="void-rose" />
          <h2>This door is for the admin</h2>
          <p>Nothing here is yours to change. Your worlds are where you left them.</p>
          <Link to="/dashboard" className="sbtn primary">To your worlds</Link>
        </div>
      </div>
    )
  }
  const w = ws.data?.world
  const tabs = w ? [
    ['maps', 'Maps', w.counts.maps], ['entries', 'Entries', w.counts.nodes], ['eras', 'Eras', w.counts.eras],
    ['images', 'Images', w.counts.images], ['forge', 'Forge', w.counts.messages + w.counts.batches],
  ] : []

  return (
    <div className="shell">
      <TopBar crumb={<><Link to="/admin?tab=worlds">Admin</Link><span className="sep"> ▸ </span>{w?.name || 'World'}</>} />
      <main className="dashmain admin-panel">
        <div className="admin-container">
          {ws.error && <div className="voidstate" role="alert"><h2>Couldn't open this world</h2><p>{ws.error}</p><Link to="/admin?tab=worlds" className="sbtn">All worlds</Link></div>}
          {!w && !ws.error && <p className="muted">Loading…</p>}
          {w && (
            <>
              <h1>{w.name}</h1>
              <p className="admin-meta">
                {w.owner ? <>Owned by <Link to={`/admin?tab=worlds&owner=${w.owner.id}`}>{w.owner.username}</Link>{w.owner.isGuest && ' (guest)'}</> : 'No owner'}
                {' · '}made {when(w.createdAt)} · changed {when(w.updatedAt)}
                {w.isTemplate && <span className="badge">template</span>}{w.shared && <span className="badge" title="Its Player View link is on">shared</span>}
                <span className="badge">read-only</span>
              </p>
              <p className="admin-meta">
                Clock: {w.timeline.enabled ? `${w.timeline.min}–${w.timeline.max} ${w.timeline.unit || ''}, now at ${w.timeline.current}` : 'off'}
              </p>
              {w.description && <p className="admin-text">{w.description}</p>}
              <nav className="admin-tabs" aria-label="This world">
                {tabs.map(([k, label, n]) => (
                  <button key={k} className={k === tab ? 'on' : ''} aria-current={k === tab ? 'page' : undefined}
                    onClick={() => setParams(k === 'maps' ? {} : { tab: k })}>{label}<span className="admin-count">{n}</span></button>
                ))}
              </nav>
              <div className="admin-section">
                {tab === 'maps' && <MapsTab world={w} mapId={params.get('map')} set={set} />}
                {tab === 'entries' && <PagedTab path="/nodes" world={w.id} params={params} set={set} hint="Title, text or DM note" empty="No entries yet.">
                  {(items) => (
                    <table>
                      <thead><tr><th>Entry</th><th>Seen by</th><th>Placed</th><th>Changed</th></tr></thead>
                      <tbody>{items.map((n) => (
                        <tr key={n.id}>
                          <td>
                            <span className="admin-cat" style={{ color: cat(n.category).c }}>{cat(n.category).i}</span>{' '}
                            <button className="admin-link" onClick={() => set({ node: String(n.id) })}>{n.title}</button>
                            {n.excerpt && <div className="admin-sub admin-clip2">{n.excerpt}</div>}
                          </td>
                          <td>{seenBy(n.visibility)}</td><td>{n.placements}</td><td>{when(n.updatedAt)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  )}
                </PagedTab>}
                {tab === 'eras' && <ErasTab world={w} />}
                {tab === 'images' && <PagedTab path="/images" world={w.id} params={params} set={set} hint="File name or alt text" empty="No images yet.">
                  {(items) => <Images items={items} showWorld={false} />}
                </PagedTab>}
                {tab === 'forge' && <ForgeTab world={w} params={params} set={set} />}
              </div>
            </>
          )}
        </div>
      </main>
      {nodeId && <EntrySheet id={nodeId} set={set} />}
    </div>
  )
}

// one of the world's lists, searchable and paged like the admin panel's
function PagedTab({ path, world, params, set, hint, empty, children }) {
  const q = params.get('q') || ''
  const page = Number(params.get('page')) || 1
  const state = usePaged(path, { world, q, page })
  return (
    <>
      <div className="admin-tools"><SearchBox value={q} placeholder={hint} onSearch={(v) => set({ q: v, page: '' })} /></div>
      <ListState state={state} empty={empty}>{children(state.data?.items || [])}</ListState>
      <Pager data={state.data} onPage={(p) => set({ page: p > 1 ? String(p) : '' })} />
    </>
  )
}

function MapsTab({ world, mapId, set }) {
  const shown = mapId || world.rootMapId || world.maps[0]?.id
  if (!world.maps.length) return <p className="muted">This world has no maps yet.</p>
  return (
    <div className="admin-maps">
      <ul className="admin-maplist">{world.maps.map((m) => (
        <li key={m.id}>
          <button className={String(m.id) === String(shown) ? 'on' : ''} onClick={() => set({ map: String(m.id), node: '' })}>
            {m.thumbUrl ? <img src={m.thumbUrl} alt="" loading="lazy" /> : <span className="admin-nothumb" />}
            <span>
              <span className="admin-clip">{m.title}</span>
              <span className="admin-sub">{m.isRoot ? 'world map' : m.inside ? `inside ${m.inside}` : m.isMain ? 'main map' : 'map'} · {m.placements} placed</span>
            </span>
          </button>
        </li>
      ))}</ul>
      <MapView mapId={shown} set={set} />
    </div>
  )
}

function MapView({ mapId, set }) {
  const st = useAdminGet(mapId ? `/maps/${mapId}` : null)
  const worldRef = useRef(null)
  if (st.error) return <p className="admin-error" role="alert">{st.error}</p>
  if (!st.data) return <p className="muted">Loading…</p>
  const { map, placements, backdrops } = st.data
  const open = (id) => set({ node: String(id) })
  return (
    <div className="admin-mapview">
      <h2>{map.title}{map.inside && <span className="admin-sub"> inside {map.inside}</span>}</h2>
      {map.view === 'list' ? <p className="muted">A list space: its entries are in the table below.</p> : (
        <div className="atlas admin-map">
          <div className="stage">
            <MapPlane mapKey={map.id} backdropUrl={map.backdropUrl} worldRef={worldRef}>
              {placements.map((p) => (
                <div key={p.id}
                  className={pinClass(p, { marker: p.node.visibility === 'player', extra: p.visibility === 'dm' || p.node.visibility === 'dm' ? 'secret' : '' })}
                  style={{ left: `${p.x}%`, top: `${p.y}%` }} role="button" tabIndex={0} aria-label={p.node.title}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); open(p.node.id) }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(p.node.id) } }}>
                  <PinBody node={p.node} />
                  {p.node.hasInterior && (
                    <button className="enter" title="Go inside" aria-label="Go inside"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); set({ map: String(p.node.interiorMapId), node: '' }) }}>◎</button>
                  )}
                </div>
              ))}
            </MapPlane>
          </div>
        </div>
      )}
      <p className="admin-sub">Every placement at every moment; the faded ones are DM-only.</p>
      {map.dmNote && <><h3>DM notes</h3><div className="admin-text">{map.dmNote}</div></>}
      {backdrops.length > 0 && (
        <>
          <h3>Art through time</h3>
          <div className="admin-grid">{backdrops.map((b) => (
            <figure key={b.id} className="admin-img"><a href={b.url} target="_blank" rel="noreferrer"><img src={b.url} alt="" loading="lazy" /></a>
              <figcaption className="admin-sub">{span(b.start, b.end)}</figcaption></figure>
          ))}</div>
        </>
      )}
      <h3>On this map</h3>
      {!placements.length ? <p className="muted">Nothing placed here.</p> : (
        <table>
          <thead><tr><th>Entry</th><th>Seen by</th><th>When</th><th>Where</th></tr></thead>
          <tbody>{placements.map((p) => (
            <tr key={p.id}>
              <td><span className="admin-cat" style={{ color: cat(p.node.category).c }}>{cat(p.node.category).i}</span>{' '}
                <button className="admin-link" onClick={() => open(p.node.id)}>{p.node.title}</button></td>
              <td>{p.visibility === 'dm' ? 'DM only (this placement)' : seenBy(p.node.visibility)}</td>
              <td>{span(p.start, p.end)}</td>
              <td>{Math.round(p.x)}%, {Math.round(p.y)}%{p.outlined && ' · outlined'}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  )
}

function ErasTab({ world }) {
  if (!world.eras.length) return <p className="muted">No eras on this world's clock.</p>
  return (
    <ul className="admin-eras">{world.eras.map((e) => (
      <li key={e.id}>
        <div><strong>{e.name}</strong> <span className="admin-sub">{e.start}–{e.end} {world.timeline.unit || ''} · {e.playerVisible ? 'players see it' : 'DM only'}</span></div>
        {e.prepNote && <details><summary>Prep</summary><div className="admin-text">{e.prepNote}</div></details>}
        {e.recapNote && <details><summary>Recap</summary><div className="admin-text">{e.recapNote}</div></details>}
      </li>
    ))}</ul>
  )
}

function ForgeTab({ world, params, set }) {
  const which = params.get('forge') === 'batches' ? 'batches' : 'messages'
  const m = world.mind
  return (
    <>
      <h2>The mind</h2>
      {!m ? <p className="muted">The Forge was never woken on this world.</p> : (
        <div className="admin-mind">
          {m.styleImageUrl && <a href={m.styleImageUrl} target="_blank" rel="noreferrer" title="Its style anchor"><img src={m.styleImageUrl} alt="The style anchor" /></a>}
          <div>
            <p className="admin-sub">Makes {m.genSize} batches</p>
            {[['Art style', m.artStyle], ['Lore it has gathered', m.lore], ["The DM's campaign bible", m.bible]].map(([label, text]) => (
              <details key={label}><summary>{label}{!text && ' (empty)'}</summary>{text && <div className="admin-text">{text}</div>}</details>
            ))}
          </div>
        </div>
      )}
      <nav className="admin-tabs admin-subtabs" aria-label="Forge history">
        <button className={which === 'messages' ? 'on' : ''} onClick={() => set({ forge: '', q: '', page: '' })}>Conversation<span className="admin-count">{world.counts.messages}</span></button>
        <button className={which === 'batches' ? 'on' : ''} onClick={() => set({ forge: 'batches', q: '', page: '' })}>Batches<span className="admin-count">{world.counts.batches}</span></button>
      </nav>
      {which === 'messages'
        ? <PagedTab key="m" path="/forge/messages" world={world.id} params={params} set={set} hint="What was said" empty="No conversation yet.">{(items) => <Messages items={items} showWorld={false} />}</PagedTab>
        : <PagedTab key="b" path="/forge/batches" world={world.id} params={params} set={set} hint="Summary" empty="No batches yet.">{(items) => <Batches items={items} showWorld={false} />}</PagedTab>}
    </>
  )
}

// one entry whole, over the page: its text, DM note, facts through time, links and placements
function EntrySheet({ id, set }) {
  const st = useAdminGet(`/nodes/${id}`)
  const close = () => set({ node: '' })
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }) // eslint-disable-line
  const n = st.data?.node
  return (
    <div className="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget) close() }}>
      <div className="smodal admin-sheet" role="dialog" aria-modal="true" aria-label={n?.title || 'Entry'}>
        <div className="mhead">
          <h3>{n ? <><span style={{ color: cat(n.category).c }}>{cat(n.category).i}</span> {n.title}</> : 'Entry'}</h3>
          <button className="mclose" onClick={close} aria-label="Close">✕</button>
        </div>
        {st.error && <p className="admin-error">{st.error}</p>}
        {!n && !st.error && <p className="muted">Loading…</p>}
        {n && (
          <>
            <p className="admin-sub">
              {cat(n.category).label} · {seenBy(n.visibility)}{n.stance && ` · ${n.stance}`}{n.author && ` · signed “${n.author}”`} · changed {when(n.updatedAt)}
            </p>
            {n.imageUrl && <a href={n.imageUrl} target="_blank" rel="noreferrer"><img className="admin-sheetimg" src={n.imageUrl} alt="" /></a>}
            {n.body ? <div className="admin-text">{n.body}</div> : <p className="muted">No text.</p>}
            {n.dmNote && <><h4>DM note</h4><div className="admin-text">{n.dmNote}</div></>}
            {n.voiceLine && <><h4>{n.voiceName || 'Voice'} says</h4><div className="admin-text">{n.voiceLine}</div></>}
            {n.facts.length > 0 && (
              <><h4>Through time</h4>
                <ul className="admin-plain">{n.facts.map((f) => <li key={f.id}><span className="admin-sub">{span(f.start, f.end)}</span> {f.body}</li>)}</ul></>
            )}
            {n.links.length > 0 && (
              <><h4>Linked</h4>
                <ul className="admin-plain">{n.links.map((l) => (
                  <li key={l.id}><button className="admin-link" onClick={() => set({ node: String(l.nodeId) })}>{l.title}</button>{l.label && <span className="admin-sub"> — {l.label}</span>}</li>
                ))}</ul></>
            )}
            <h4>Placed</h4>
            {!n.placements.length ? <p className="muted">On no map.</p> : (
              <ul className="admin-plain">{n.placements.map((p) => (
                <li key={p.id}>
                  <button className="admin-link" onClick={() => set({ tab: '', map: String(p.mapId), node: '', q: '', page: '' })}>{p.map}</button>
                  <span className="admin-sub"> · {span(p.start, p.end)}{p.visibility === 'dm' ? ' · DM only' : ''}</span>
                </li>
              ))}</ul>
            )}
            {n.interiorMapId && <p><button className="sbtn" onClick={() => set({ tab: '', map: String(n.interiorMapId), node: '', q: '', page: '' })}>◎ Go inside</button></p>}
          </>
        )}
      </div>
    </div>
  )
}

export default AdminWorld
