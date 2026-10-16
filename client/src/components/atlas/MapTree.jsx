import React, { useState, useMemo, useEffect, useRef } from 'react'

// The Maps rail as a real tree: every space nests under the map its owner node stands on.
// Branches fold with a caret (remembered per world), the path to the current map is always
// open, a folded branch says how much it holds, and interiors whose owner is not on any
// map yet gather under "Unplaced" instead of vanishing.
// The DM can organise the tree apart from the nodes that link maps: a ⚓ main map stands at
// the top beside the world map, and a map filed under another sits there whatever node owns
// it (drag a row onto another, or right-click a row). Filing never changes how maps link.
export default function MapTree({ tree, rootId, mapId, onGo, worldId, onFile }) {
  const key = `atlas_tree_${worldId}`
  const [folded, setFolded] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')) } catch (e) { return new Set() }
  })
  const remember = (set) => { try { localStorage.setItem(key, JSON.stringify([...set])) } catch (e) { /* ignore */ } }
  const byId = useMemo(() => new Map(tree.map((m) => [m.id, m])), [tree])
  // the tops: the world map, then every main map
  const isTop = (m) => m.id === rootId || (m.isMain && m.filedUnder == null)
  // where a map sits: under the map it is filed under, else at the top if it is a main map,
  // else under the map its owner node stands on
  const upOf = useMemo(() => {
    const up = new Map()
    for (const m of tree) {
      if (isTop(m)) continue
      const p = m.filedUnder != null && byId.has(m.filedUnder) ? m.filedUnder : m.parentMapId
      up.set(m.id, p != null && p !== m.id && byId.has(p) ? p : null)
    }
    return up
  }, [tree, byId, rootId]) // eslint-disable-line react-hooks/exhaustive-deps
  const kids = useMemo(() => {
    const k = new Map()
    // a space whose owner stands only inside it (or a loop of such) has no way up: it is filed
    // under Unplaced rather than under itself, where nothing would ever show it
    const reaches = (m) => { let cur = m, g = 0; while (cur && g++ < 60) { if (isTop(cur)) return true; const p = upOf.get(cur.id); if (p == null) return false; cur = byId.get(p) } return false }
    for (const m of tree) {
      if (isTop(m)) continue
      const pid = upOf.get(m.id) != null && reaches(m) ? upOf.get(m.id) : null
      if (!k.has(pid)) k.set(pid, [])
      k.get(pid).push(m)
    }
    for (const list of k.values()) list.sort((a, b) => a.title.localeCompare(b.title))
    return k
  }, [tree, byId, upOf]) // eslint-disable-line react-hooks/exhaustive-deps
  const tops = useMemo(() => tree.filter((m) => m.id !== rootId && isTop(m)).sort((a, b) => a.title.localeCompare(b.title)), [tree, rootId]) // eslint-disable-line react-hooks/exhaustive-deps
  // the current map's ancestors are never folded shut — you can always see where you are
  const openPath = useMemo(() => {
    const set = new Set(); let cur = byId.get(Number(mapId)); let guard = 0
    while (cur && upOf.get(cur.id) != null && guard++ < 50) { set.add(upOf.get(cur.id)); cur = byId.get(upOf.get(cur.id)) }
    return set
  }, [byId, upOf, mapId])
  // everything shown beneath a map (it can't be filed under any of these)
  const under = (id, acc = new Set()) => { for (const c of kids.get(id) || []) { if (!acc.has(c.id)) { acc.add(c.id); under(c.id, acc) } } return acc }

  // ---- organising: the row menu and drag-to-file ----
  const [menu, setMenu] = useState(null) // { m, x, y, filing }
  const menuRef = useRef(null)
  const [dragId, setDragId] = useState(null)
  const [dropId, setDropId] = useState(null)
  useEffect(() => {
    if (!menu) return
    const off = (e) => { if (!menuRef.current?.contains(e.target)) setMenu(null) }
    const esc = (e) => { if (e.key === 'Escape') setMenu(null) }
    window.addEventListener('pointerdown', off); window.addEventListener('keydown', esc)
    return () => { window.removeEventListener('pointerdown', off); window.removeEventListener('keydown', esc) }
  }, [menu])
  const canFile = (m, target) => m.id !== rootId && target.id !== m.id && !under(m.id).has(target.id) && target.id !== upOf.get(m.id)
  const file = (m, data) => { setMenu(null); onFile?.(m.id, data) }
  const openMenu = (e, m) => {
    if (!onFile || m.id === rootId) return
    e.preventDefault()
    setMenu({ m, x: Math.min(e.clientX, window.innerWidth - 240), y: Math.min(e.clientY, window.innerHeight - 200), filing: false })
  }
  const isFolded = (id) => folded.has(id) && !openPath.has(id)
  // a branch holding the open map cannot fold: the caret says so instead of recording a fold that would bite later
  const toggle = (id) => { if (openPath.has(id)) return; setFolded((f) => { const n = new Set(f); if (n.has(id)) n.delete(id); else n.add(id); remember(n); return n }) }
  const countUnder = (id) => (kids.get(id) || []).reduce((acc, c) => acc + 1 + countUnder(c.id), 0)
  const foldAll = () => { const n = new Set([...kids.keys()].filter((k) => k != null && !openPath.has(k))); remember(n); setFolded(n) }
  const unfoldAll = () => { const n = new Set(); remember(n); setFolded(n) }

  const row = (m, depth, isRoot = false) => {
    const children = kids.get(m.id) || []
    const has = children.length > 0
    const closed = has && isFolded(m.id)
    return (
      <React.Fragment key={m.id}>
        <div className={`trow ${String(m.id) === String(mapId) ? 'on' : ''}${isTop(m) ? ' top' : ''}${dropId === m.id ? ' drop' : ''}${dragId === m.id ? ' dragging' : ''}`}
          style={{ paddingLeft: 6 + depth * 14 }}
          role="button" tabIndex={0} aria-current={String(m.id) === String(mapId) ? 'page' : undefined}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onGo(m.id) } }}
          onClick={() => onGo(m.id)} title={m.title}
          onContextMenu={(e) => openMenu(e, m)}
          draggable={!!onFile && !isRoot}
          onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(m.id)); setDragId(m.id) }}
          onDragEnd={() => { setDragId(null); setDropId(null) }}
          onDragOver={(e) => { const d = byId.get(dragId); if (d && canFile(d, m)) { e.preventDefault(); if (dropId !== m.id) setDropId(m.id) } }}
          onDragLeave={() => { if (dropId === m.id) setDropId(null) }}
          onDrop={(e) => { e.preventDefault(); const d = byId.get(dragId); setDragId(null); setDropId(null); if (d && canFile(d, m)) file(d, { tree_parent_id: m.id, is_main: false }) }}>
          {depth > 0 && <span className="tguide" style={{ left: 6 + (depth - 1) * 14 + 5 }} />}
          {has
            ? <button type="button" className={`tcaret${openPath.has(m.id) ? ' held' : ''}`} disabled={openPath.has(m.id)}
                title={openPath.has(m.id) ? "Holds the map you're on — it stays open" : closed ? `Unfold — ${countUnder(m.id)} inside` : 'Fold this branch'}
                onClick={(e) => { e.stopPropagation(); toggle(m.id) }}>{closed ? '▸' : '▾'}</button>
            : <span className="tcaret none" />}
          {m.thumbUrl ? <img className="tthumb" src={m.thumbUrl} alt="" /> : <span className="tnothumb" />}
          <span className="ttitle">{isRoot ? (m.title || 'World map') : m.title}</span>
          {m.isMain && !isRoot && <span className="tmain" title="Main map">⚓</span>}
          {m.filedUnder != null && !m.isMain && <span className="tfiled" title="Filed here by hand (right-click to change)">📌</span>}
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
        <button type="button" onClick={unfoldAll} title="Open every branch">Expand all</button>
        <button type="button" onClick={foldAll} title="Close every branch">Collapse all</button>
      </div>
      {root && row(root, 0, true)}
      {tops.map((m) => row(m, 0))}
      {orphans.length > 0 && (
        <>
          <div className="tsect" title="Interiors whose owner isn't placed on any map yet">Unplaced</div>
          {orphans.map((m) => row(m, 1))}
        </>
      )}
      {menu && (() => {
        const m = byId.get(menu.m.id) || menu.m
        const targets = tree.filter((t) => canFile(m, t)).sort((a, b) => (isTop(b) - isTop(a)) || a.title.localeCompare(b.title))
        return (
          <div ref={menuRef} className="apop ctxmenu tmenu" style={{ left: menu.x, top: menu.y }}>
            <div className="apop-sep">{m.title}</div>
            {!menu.filing ? (
              <>
                <button onClick={() => file(m, m.isMain ? { is_main: false } : { is_main: true, tree_parent_id: null })}>
                  ⚓ {m.isMain ? 'Not a main map' : 'Make it a main map'}
                </button>
                <button onClick={() => setMenu({ ...menu, filing: true })}>📌 File under…</button>
                {(m.filedUnder != null || m.isMain) && (
                  <button title="Back under the map its node stands on" onClick={() => file(m, { is_main: false, tree_parent_id: null })}>↺ Back where its node stands</button>
                )}
              </>
            ) : (
              <div className="tfilelist">
                {targets.map((t) => (
                  <button key={t.id} onClick={() => file(m, { tree_parent_id: t.id, is_main: false })}>
                    {t.id === rootId ? '🗺' : isTop(t) ? '⚓' : '·'} {t.id === rootId ? (t.title || 'World map') : t.title}
                  </button>
                ))}
                {!targets.length && <div className="muted esmall">No other map to file it under.</div>}
              </div>
            )}
          </div>
        )
      })()}
    </>
  )
}
