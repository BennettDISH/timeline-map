import React, { useState, useMemo } from 'react'

// The Maps rail as a real tree: every space nests under the map its owner node stands on.
// Branches fold with a caret (remembered per world), the path to the current map is always
// open, a folded branch says how much it holds, and interiors whose owner is not on any
// map yet gather under "Unplaced" instead of vanishing.
export default function MapTree({ tree, rootId, mapId, onGo, worldId }) {
  const key = `atlas_tree_${worldId}`
  const [folded, setFolded] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')) } catch (e) { return new Set() }
  })
  const remember = (set) => { try { localStorage.setItem(key, JSON.stringify([...set])) } catch (e) { /* ignore */ } }
  const byId = useMemo(() => new Map(tree.map((m) => [m.id, m])), [tree])
  const kids = useMemo(() => {
    const k = new Map()
    // a space whose owner stands only inside it (or a loop of such) has no way up: it is filed
    // under Unplaced rather than under itself, where nothing would ever show it
    const reaches = (m) => { let cur = m, g = 0; while (cur && g++ < 60) { if (cur.id === rootId) return true; if (cur.parentMapId == null || cur.parentMapId === cur.id) return false; cur = byId.get(cur.parentMapId) } return false }
    for (const m of tree) {
      if (m.id === rootId) continue
      const pid = m.parentMapId != null && m.parentMapId !== m.id && byId.has(m.parentMapId) && reaches(m) ? m.parentMapId : null
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
        <div className={`trow ${String(m.id) === String(mapId) ? 'on' : ''}`} style={{ paddingLeft: 6 + depth * 14 }}
          role="button" tabIndex={0} aria-current={String(m.id) === String(mapId) ? 'page' : undefined}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onGo(m.id) } }}
          onClick={() => onGo(m.id)} title={m.title}>
          {depth > 0 && <span className="tguide" style={{ left: 6 + (depth - 1) * 14 + 5 }} />}
          {has
            ? <button type="button" className={`tcaret${openPath.has(m.id) ? ' held' : ''}`} disabled={openPath.has(m.id)}
                title={openPath.has(m.id) ? "Holds the map you're on — it stays open" : closed ? `Unfold — ${countUnder(m.id)} inside` : 'Fold this branch'}
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
        <button type="button" onClick={unfoldAll} title="Open every branch">Expand all</button>
        <button type="button" onClick={foldAll} title="Close every branch">Collapse all</button>
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
