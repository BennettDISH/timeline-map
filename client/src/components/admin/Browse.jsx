import React, { useState, useEffect, useRef } from 'react'
import http, { errText } from '../../services/http'

// The admin pages' shared parts: a paged list read from /api/admin (50 a page, ?q= search),
// the search box and the pager. Look-only: nothing here writes.

// { loading, error, data: { items, total, page, pages, pageSize, q } } for one admin list
export function usePaged(path, params) {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  const key = JSON.stringify([path, params])
  useEffect(() => {
    let live = true
    setState((s) => ({ ...s, loading: true, error: null }))
    const clean = Object.fromEntries(Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== ''))
    http.get(`/api/admin${path}`, { params: clean })
      .then((r) => { if (live) setState({ loading: false, error: null, data: r.data }) })
      .catch((e) => { if (live) setState({ loading: false, error: errText(e, "Couldn't load this list"), data: null }) })
    return () => { live = false }
  }, [key]) // eslint-disable-line
  return state
}

// one admin read that is not a list (a world, a map, an entry)
export function useAdminGet(path) {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  useEffect(() => {
    if (!path) { setState({ loading: false, error: null, data: null }); return undefined }
    let live = true
    setState((s) => ({ ...s, loading: true, error: null }))
    http.get(`/api/admin${path}`)
      .then((r) => { if (live) setState({ loading: false, error: null, data: r.data }) })
      .catch((e) => { if (live) setState({ loading: false, error: errText(e, "Couldn't load this"), data: null }) })
    return () => { live = false }
  }, [path])
  return state
}

// the search box: typing settles for a moment before it searches
export function SearchBox({ value, onSearch, placeholder }) {
  const [text, setText] = useState(value || '')
  const timer = useRef(null)
  useEffect(() => { setText(value || '') }, [value])
  useEffect(() => () => clearTimeout(timer.current), [])
  const change = (v) => {
    setText(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => onSearch(v.trim()), 350)
  }
  return (
    <div className="admin-search">
      <input className="sinput" type="search" value={text} placeholder={placeholder || 'Search'} aria-label="Search"
        onChange={(e) => change(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { clearTimeout(timer.current); onSearch(text.trim()) } }} />
    </div>
  )
}

export function Pager({ data, onPage }) {
  if (!data) return null
  const { page, pages, total, pageSize } = data
  const from = total ? (page - 1) * pageSize + 1 : 0
  const to = Math.min(total, page * pageSize)
  return (
    <div className="admin-pager">
      <span className="muted">{total ? `${from}–${to} of ${total}` : 'Nothing found'}</span>
      {pages > 1 && (
        <span className="admin-pages">
          <button className="sbtn ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ Previous</button>
          <span>Page {page} of {pages}</span>
          <button className="sbtn ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next ›</button>
        </span>
      )}
    </div>
  )
}

// a list's loading, error and empty states around its rows
export function ListState({ state, empty = 'Nothing here.', children }) {
  if (state.error) return <p className="admin-error" role="alert">{state.error}</p>
  if (state.loading && !state.data) return <p className="muted">Loading…</p>
  if (state.data && !state.data.items.length) return <p className="muted">{state.data.q ? `Nothing matches “${state.data.q}”.` : empty}</p>
  return <div className={state.loading ? 'admin-stale' : ''}>{children}</div>
}

export const when = (d) => (d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—')
export const whenTime = (d) => (d ? new Date(d).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—')
export const size = (n) => (n == null ? '—' : n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`)
// who may see an entry or a placement, in the workspace's words
export const seenBy = (v) => ({ dm: 'DM only', shared: 'Players', player: "A player's marker" }[v] || v)
