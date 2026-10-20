import React from 'react'
import { Link } from 'react-router'
import { when, whenTime, size } from './Browse'

// List bodies both admin pages show: across every world (AdminPanel) or inside one (AdminWorld,
// showWorld off). Look-only.

// images as a contact sheet; each opens full size in a new tab
export function Images({ items, showWorld = true }) {
  return (
    <div className="admin-grid">{items.map((i) => (
      <figure key={i.id} className="admin-img">
        <a href={i.url} target="_blank" rel="noreferrer" title="Open the image">
          <img src={i.url} alt={i.alt || ''} loading="lazy" />
        </a>
        <figcaption>
          <div className="admin-clip" title={i.name}>{i.name}</div>
          <div className="admin-sub">
            {showWorld && <>{i.worldId ? <Link to={`/admin/worlds/${i.worldId}?tab=images`}>{i.world}</Link> : 'no world'} · </>}
            {size(i.size)} · {when(i.createdAt)}
          </div>
        </figcaption>
      </figure>
    ))}</div>
  )
}

// the Forge's conversations: the DM's words and the mind's replies, newest first
export function Messages({ items, showWorld = true }) {
  return (
    <ul className="admin-chat">{items.map((m) => (
      <li key={m.id} className={m.role === 'user' ? 'dm' : 'mind'}>
        <div className="admin-sub">
          {m.role === 'user' ? 'The DM' : 'The Forge'} · {whenTime(m.createdAt)}
          {showWorld && <> · <Link to={`/admin/worlds/${m.worldId}?tab=forge`}>{m.world}</Link></>}
          {m.batchId && <> · batch #{m.batchId}</>}
        </div>
        <div className="admin-text">{m.content}</div>
      </li>
    ))}</ul>
  )
}

// what each Forge proposal made and how it settled
export function Batches({ items, showWorld = true }) {
  return (
    <table>
      <thead><tr><th>Batch</th><th>Made</th><th>Settled</th>{showWorld && <th>World</th>}<th>When</th></tr></thead>
      <tbody>{items.map((b) => (
        <tr key={b.id}>
          <td>#{b.id} {b.summary}</td>
          <td>{Object.entries(b.made).map(([k, n]) => `${n} ${k}`).join(', ') || '—'}{b.asks ? ` · ${b.asks} asked (${b.asksState})` : ''}</td>
          <td>{b.status}</td>
          {showWorld && <td><Link to={`/admin/worlds/${b.worldId}?tab=forge&forge=batches`}>{b.world}</Link></td>}
          <td>{whenTime(b.createdAt)}</td>
        </tr>
      ))}</tbody>
    </table>
  )
}
