import React, { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useAuth } from '../utils/AuthContext'
import http, { errText } from '../services/http'
import TopBar, { Compass } from '../components/TopBar'
import { usePaged, SearchBox, Pager, ListState, when, seenBy } from '../components/admin/Browse'
import { Images, Messages, Batches } from '../components/admin/Lists'
import { cat } from '../utils/categories'
import '../styles/shell.scss'

// The admin's look-only window on everything: every account, world, map, entry, era, image and
// Forge conversation, searchable, 50 a page; a world opens read-only (AdminWorld). Admin is a
// Waypoint identity (ADMIN_CENTRAL_USER_IDS on the server); the server enforces it, this only
// hides. Where you are (tab, search, page, filter) lives in the URL, so Back returns to it.
const TABS = [
  { key: 'users', label: 'Accounts', path: '/users', count: 'users', hint: 'Name or email' },
  { key: 'worlds', label: 'Worlds', path: '/worlds', count: 'worlds', hint: 'World, description or owner' },
  { key: 'maps', label: 'Maps', path: '/maps', count: 'maps', hint: 'Map, world or the entry it is inside' },
  { key: 'nodes', label: 'Entries', path: '/nodes', count: 'nodes', hint: 'Title, text or DM note' },
  { key: 'eras', label: 'Eras', path: '/eras', count: 'eras', hint: 'Era, world or session notes' },
  { key: 'images', label: 'Images', path: '/images', count: 'images', hint: 'File name, alt text or world' },
  { key: 'messages', label: 'Forge chats', path: '/forge/messages', count: 'messages', hint: 'What was said, or the world' },
  { key: 'batches', label: 'Forge batches', path: '/forge/batches', count: 'batches', hint: 'Summary or world' },
]

function AdminPanel() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab = TABS.find((t) => t.key === params.get('tab')) || TABS[0]
  const q = params.get('q') || ''
  const page = Number(params.get('page')) || 1
  const world = params.get('world') || ''
  const owner = params.get('owner') || ''
  const [counts, setCounts] = useState(null)

  useEffect(() => {
    if (!user?.isAdmin) return
    http.get('/api/admin/summary').then((r) => setCounts(r.data.counts)).catch(() => setCounts(null))
  }, [user])

  // one change to where you are; a new search or filter starts at page 1
  const go = (next) => {
    const merged = { tab: tab.key, q, page: String(page), world, owner, ...next }
    if (!('page' in next)) merged.page = '1'
    setParams(Object.fromEntries(Object.entries(merged).filter(([k, v]) => v && !(k === 'page' && v === '1') && !(k === 'tab' && v === 'users'))))
  }

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

  return (
    <div className="shell">
      <TopBar crumb="Admin" />
      <main className="dashmain admin-panel">
        <div className="admin-container">
          <h1>Admin panel</h1>
          <p>Everything on the Atlas, look-only. Nothing here changes a world.</p>
          <nav className="admin-tabs" aria-label="What to browse">
            {TABS.map((t) => (
              <button key={t.key} className={t.key === tab.key ? 'on' : ''} aria-current={t.key === tab.key ? 'page' : undefined}
                onClick={() => setParams(t.key === 'users' ? {} : { tab: t.key })}>
                {t.label}{counts?.[t.count] != null && <span className="admin-count">{counts[t.count]}</span>}
              </button>
            ))}
          </nav>
          <div className="admin-section">
            <div className="admin-tools">
              <SearchBox key={tab.key} value={q} placeholder={tab.hint} onSearch={(v) => go({ q: v })} />
              {world && <button className="badge admin-filter" onClick={() => go({ world: '' })} title="Show every world">World #{world} ✕</button>}
              {owner && <button className="badge admin-filter" onClick={() => go({ owner: '' })} title="Show every owner">Owner #{owner} ✕</button>}
            </div>
            <TabList tab={tab} q={q} page={page} world={world} owner={owner} go={go} />
          </div>
          <DbStatus />
        </div>
      </main>
    </div>
  )
}

function TabList({ tab, q, page, world, owner, go }) {
  const state = usePaged(tab.path, { q, page, world: tab.key === 'users' || tab.key === 'worlds' ? undefined : world, owner: tab.key === 'worlds' ? owner : undefined })
  const items = state.data?.items || []
  const W = ({ r }) => <Link to={`/admin/worlds/${r.worldId}`}>{r.world}</Link>
  return (
    <>
      <ListState state={state}>
        {tab.key === 'users' && (
          <table>
            <thead><tr><th>Account</th><th>Email</th><th>Waypoint id</th><th>Worlds</th><th>Joined</th><th>Last seen</th></tr></thead>
            <tbody>{items.map((u) => (
              <tr key={u.id}>
                <td>{u.username} {u.isAdmin && <span className="badge">admin</span>} {u.isGuest && <span className="badge">guest</span>}</td>
                <td>{u.email || '—'}</td>
                <td>{u.centralUserId ?? '—'}</td>
                <td>{u.worlds ? <button className="admin-link" onClick={() => go({ tab: 'worlds', owner: String(u.id), q: '', world: '' })}>{u.worlds}</button> : 0}</td>
                <td>{when(u.createdAt)}</td>
                <td>{when(u.lastSeenAt)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {tab.key === 'worlds' && (
          <table>
            <thead><tr><th>World</th><th>Owner</th><th>Maps</th><th>Entries</th><th>Images</th><th>Eras</th><th>Forge</th><th>Changed</th></tr></thead>
            <tbody>{items.map((w) => (
              <tr key={w.id}>
                <td>
                  <Link to={`/admin/worlds/${w.id}`}>{w.name}</Link>
                  {w.isTemplate && <span className="badge">template</span>} {w.shared && <span className="badge" title="Its Player View link is on">shared</span>}
                  {w.description && <div className="admin-sub admin-clip2">{w.description}</div>}
                </td>
                <td>{w.owner ? <>{w.owner.username}{w.owner.isGuest && <span className="badge">guest</span>}</> : '—'}</td>
                <td>{w.counts.maps}</td><td>{w.counts.nodes}</td><td>{w.counts.images}</td><td>{w.counts.eras}</td><td>{w.counts.messages}</td>
                <td>{when(w.updatedAt)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {tab.key === 'maps' && (
          <table>
            <thead><tr><th /><th>Map</th><th>World</th><th>Inside</th><th>Placed</th><th>Changed</th></tr></thead>
            <tbody>{items.map((m) => (
              <tr key={m.id}>
                <td className="admin-thumbcell">{m.thumbUrl ? <img className="admin-thumb" src={m.thumbUrl} alt="" loading="lazy" /> : null}</td>
                <td><Link to={`/admin/worlds/${m.worldId}?map=${m.id}`}>{m.title}</Link>{m.isRoot && <span className="badge">world map</span>}{m.view === 'list' && <span className="badge">list</span>}</td>
                <td><W r={m} /></td>
                <td>{m.inside || '—'}</td>
                <td>{m.placements}</td>
                <td>{when(m.updatedAt)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {tab.key === 'nodes' && (
          <table>
            <thead><tr><th>Entry</th><th>Seen by</th><th>World</th><th>Placed</th><th>Changed</th></tr></thead>
            <tbody>{items.map((n) => (
              <tr key={n.id}>
                <td>
                  <span className="admin-cat" style={{ color: cat(n.category).c }}>{cat(n.category).i}</span>{' '}
                  <Link to={`/admin/worlds/${n.worldId}?tab=entries&node=${n.id}`}>{n.title}</Link>
                  {n.author && <span className="admin-sub"> signed “{n.author}”</span>}
                  {n.excerpt && <div className="admin-sub admin-clip2">{n.excerpt}</div>}
                </td>
                <td>{seenBy(n.visibility)}</td>
                <td><W r={n} /></td>
                <td>{n.placements}</td>
                <td>{when(n.updatedAt)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {tab.key === 'eras' && (
          <table>
            <thead><tr><th>Era</th><th>Span</th><th>Players see it</th><th>Notes</th><th>World</th></tr></thead>
            <tbody>{items.map((e) => (
              <tr key={e.id}>
                <td><Link to={`/admin/worlds/${e.worldId}?tab=eras`}>{e.name}</Link></td>
                <td>{e.start}–{e.end} {e.unit || ''}</td>
                <td>{e.playerVisible ? 'yes' : 'no'}</td>
                <td>{[e.hasPrep && 'prep', e.hasRecap && 'recap'].filter(Boolean).join(' + ') || '—'}</td>
                <td><W r={e} /></td>
              </tr>
            ))}</tbody>
          </table>
        )}
        {tab.key === 'images' && <Images items={items} />}
        {tab.key === 'messages' && <Messages items={items} />}
        {tab.key === 'batches' && <Batches items={items} />}
      </ListState>
      <Pager data={state.data} onPage={(p) => go({ page: String(p) })} />
    </>
  )
}

// the database's health, as before
function DbStatus() {
  const [db, setDb] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    http.get('/api/admin/db-status').then((r) => setDb(r.data)).catch((e) => setError(errText(e, "Couldn't check the database")))
  }, [])
  return (
    <details className="admin-section admin-db">
      <summary>Database</summary>
      {error ? <p className="admin-error">{error}</p> : !db ? <p>Loading…</p> : (
        <div className="db-status">
          <p><strong>Status:</strong> {db.message}</p>
          <p><strong>Tables:</strong> {db.details?.tablesFound?.join(', ')}</p>
          {db.details?.missingTables?.length > 0 && <p><strong>Missing:</strong> {db.details.missingTables.join(', ')}</p>}
          <p><strong>Accounts:</strong> {db.details?.userCount}</p>
        </div>
      )}
    </details>
  )
}

export default AdminPanel
