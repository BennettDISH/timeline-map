import React, { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import TopBar, { Compass } from '../components/TopBar'
import worldService from '../services/worldService'
import atlasService from '../services/atlasService'
import '../styles/shell.scss'
import '../styles/dashboard.scss'

const plural = (c, w) => `${c} ${w}${c === 1 ? '' : 's'}`
// golden-angle hue spread: every world without art gets its own stable tint
const hue = (id) => Math.floor((id * 137.508) % 360)

// A world's face: its root-map backdrop (or newest art), else a tinted plate
// with a watermark rose and the world's initial.
function Cover({ world, big = false }) {
  if (world.coverUrl) {
    return <div className="cover" style={{ backgroundImage: `url(${world.coverUrl})` }} />
  }
  const h = hue(world.id)
  return (
    <div className="cover ph" style={{ background: `linear-gradient(150deg, hsl(${h} 24% 17%), hsl(${(h + 45) % 360} 20% 10%))` }}>
      <Compass size={big ? 130 : 90} className="ph-rose" />
      <span className="ph-initial">{(world.name || '·').trim().charAt(0).toUpperCase()}</span>
    </div>
  )
}

function WorldMeta({ w }) {
  return (
    <div className="wmeta">
      {plural(w.mapCount ?? 0, 'map')} · {plural(w.nodeCount ?? 0, 'node')} · {plural(w.imageCount ?? 0, 'image')}
    </div>
  )
}

function WorldBadges({ w }) {
  const tl = w.timelineSettings
  if (!w.shared && !w.timelineEnabled) return null
  return (
    <div className="wbadges">
      {w.timelineEnabled && tl && <span className="badge" title="The world's current moment">🕓 {tl.currentTime} {tl.timeUnit}</span>}
      {w.shared && <span className="badge" title="Players can see this world through its share link">🔗 party link live</span>}
    </div>
  )
}

function Modal({ title, onClose, children }) {
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="smodal" onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3>{title}</h3>
          <button className="mclose" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Dashboard() {
  const navigate = useNavigate()
  const [worlds, setWorlds] = useState(null) // null while loading
  const [modal, setModal] = useState(null) // {kind:'create'|'edit'|'delete', world?}
  const [menuId, setMenuId] = useState(null)
  const [flash, setFlash] = useState(null) // {kind:'ok'|'err', text}
  const [busy, setBusy] = useState(false)
  const [templates, setTemplates] = useState([]) // clonable sample worlds

  useEffect(() => {
    document.title = 'Your worlds · Fantasy Map Timeline'
    return () => { document.title = 'Fantasy Map Timeline' }
  }, [])

  const load = () =>
    worldService.getWorlds()
      .then((r) => setWorlds(r.worlds || []))
      .catch((e) => { setWorlds([]); setFlash({ kind: 'err', text: e.message || 'Could not load your worlds' }) })
  useEffect(() => { load(); atlasService.getTemplates().then(setTemplates).catch(() => {}) }, [])

  // close any open card menu on outside click
  useEffect(() => {
    if (menuId == null) return
    const close = () => setMenuId(null)
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [menuId])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 3500)
    return () => clearTimeout(t)
  }, [flash])

  const stored = worldService.getCurrentWorld()
  const featured = useMemo(
    () => (worlds && worlds.length ? worlds.find((w) => w.id === stored?.id) || worlds[0] : null),
    [worlds] // eslint-disable-line
  )
  const rest = useMemo(() => (worlds || []).filter((w) => w.id !== featured?.id), [worlds, featured])

  const open = (w) => { worldService.setCurrentWorld(w); navigate(`/w/${w.id}`) }

  const createWorld = async (name, description, sampleId) => {
    setBusy(true)
    try {
      let w
      if (sampleId) {
        // begin from the sample: a deep clone the newcomer can safely break
        const r = await atlasService.cloneWorld(sampleId, name)
        if (description) await atlasService.patchWorld(r.worldId, { description }).catch(() => {})
        w = { id: r.worldId, name }
      } else {
        const r = await worldService.createWorld({ name, description: description || null })
        w = r.world
      }
      setModal(null)
      open(w) // straight onto the canvas — the Atlas ensures a root map
    } catch (e) {
      setFlash({ kind: 'err', text: e?.response?.data?.message || e.message || 'Could not create the world' })
    } finally { setBusy(false) }
  }

  const saveWorld = async (world, name, description) => {
    setBusy(true)
    try {
      await atlasService.patchWorld(world.id, { name, description })
      setWorlds((ws) => ws.map((w) => (w.id === world.id ? { ...w, name, description } : w)))
      if (stored?.id === world.id) worldService.setCurrentWorld({ ...stored, name, description })
      setModal(null)
    } catch (e) {
      setFlash({ kind: 'err', text: e.message || 'Could not save changes' })
    } finally { setBusy(false) }
  }

  const deleteWorld = async (world) => {
    setBusy(true)
    try {
      await worldService.deleteWorld(world.id)
      if (stored?.id === world.id) worldService.setCurrentWorld(null)
      worldService.clearLastLocation(world.id)
      setWorlds((ws) => ws.filter((w) => w.id !== world.id))
      setModal(null)
      setFlash({ kind: 'ok', text: `"${world.name}" has passed out of all knowledge.` })
    } catch (e) {
      setFlash({ kind: 'err', text: e.message || 'Could not delete the world' })
    } finally { setBusy(false) }
  }

  const cardMenu = (w) => (
    <div className="cardmenu" onPointerDown={(e) => e.stopPropagation()}>
      <button
        className="dots"
        title="World options"
        onClick={(e) => { e.stopPropagation(); setMenuId(menuId === w.id ? null : w.id) }}
      >⋯</button>
      {menuId === w.id && (
        <div className="menupop">
          <button onClick={(e) => { e.stopPropagation(); setMenuId(null); setModal({ kind: 'edit', world: w }) }}>Edit details</button>
          <Link to={`/worlds/${w.id}/images`} onClick={(e) => e.stopPropagation()}>Open the Archive</Link>
          <button className="dngr" onClick={(e) => { e.stopPropagation(); setMenuId(null); setModal({ kind: 'delete', world: w }) }}>Delete world…</button>
        </div>
      )}
    </div>
  )

  return (
    <div className="shell dash">
      <TopBar />

      <main className="dashmain">
        {worlds === null && (
          <>
            <div className="skel featured-skel" />
            <div className="wgrid">
              <div className="skel card-skel" /><div className="skel card-skel" /><div className="skel card-skel" />
            </div>
          </>
        )}

        {worlds !== null && worlds.length === 0 && (
          <div className="voidstate">
            <Compass size={92} className="void-rose" />
            <h2>Every campaign begins with a blank map</h2>
            <p>Found your first world, give it a face, and start dropping the places, people, and secrets your party will find.</p>
            <button className="sbtn primary" onClick={() => setModal({ kind: 'create' })}>Found your first world</button>
          </div>
        )}

        {featured && (
          <section
            className="featured"
            role="button"
            tabIndex={0}
            onClick={() => open(featured)}
            onKeyDown={(e) => { if (e.key === 'Enter') open(featured) }}
          >
            <Cover world={featured} big />
            <div className="fscrim" />
            <div className="fbody">
              <span className="kicker">{stored?.id === featured.id ? 'Pick up where you left off' : 'Most recently charted'}</span>
              <h2 className="fname">{featured.name}</h2>
              {featured.description && <p className="fdesc">{featured.description}</p>}
              <WorldMeta w={featured} />
              <WorldBadges w={featured} />
              <div className="factions" onClick={(e) => e.stopPropagation()}>
                <button className="sbtn primary" onClick={() => open(featured)}>Open the Atlas ▸</button>
                <Link className="sbtn" to={`/worlds/${featured.id}/images`}>The Archive</Link>
              </div>
            </div>
            {cardMenu(featured)}
          </section>
        )}

        {worlds !== null && worlds.length > 0 && (
          <section className="shelf">
            <h3 className="kicker rule">{rest.length ? 'All your worlds' : 'Chart another'}</h3>
            <div className="wgrid">
              {rest.map((w) => (
                <article
                  key={w.id}
                  className="wcard"
                  role="button"
                  tabIndex={0}
                  onClick={() => open(w)}
                  onKeyDown={(e) => { if (e.key === 'Enter') open(w) }}
                >
                  <Cover world={w} />
                  <div className="wbody">
                    <h4 className="wname">{w.name}</h4>
                    <p className={`wdesc ${w.description ? '' : 'muted'}`}>{w.description || 'No chronicle written yet.'}</p>
                    <WorldMeta w={w} />
                    <WorldBadges w={w} />
                  </div>
                  {cardMenu(w)}
                </article>
              ))}
              <button className="wcard ghostcard" onClick={() => setModal({ kind: 'create' })}>
                <Compass size={46} className="g-rose" />
                <span className="gtitle">Found a new world</span>
                <span className="gsub">A blank map, a fresh age</span>
              </button>
            </div>
          </section>
        )}
      </main>

      {modal?.kind === 'create' && (
        <CreateModal busy={busy} onClose={() => setModal(null)} onSubmit={createWorld}
          templates={templates} defaultSample={worlds !== null && worlds.length === 0} />
      )}
      {modal?.kind === 'edit' && (
        <EditModal busy={busy} world={modal.world} onClose={() => setModal(null)} onSubmit={saveWorld} />
      )}
      {modal?.kind === 'delete' && (
        <DeleteModal busy={busy} world={modal.world} onClose={() => setModal(null)} onConfirm={deleteWorld} />
      )}

      {flash && <div className={`flash ${flash.kind === 'err' ? 'err' : ''}`}>{flash.text}</div>}
    </div>
  )
}

function CreateModal({ busy, onClose, onSubmit, templates = [], defaultSample = false }) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [useSample, setUseSample] = useState(defaultSample && templates.length > 0)
  const submit = (e) => {
    e.preventDefault()
    if (name.trim()) onSubmit(name.trim(), desc.trim(), useSample && templates[0] ? templates[0].id : null)
  }
  return (
    <Modal title="Found a new world" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="fld">
          <label>Name</label>
          <input className="sinput" autoFocus value={name} onChange={(e) => setName(e.target.value)}
            placeholder="The Sunless Reach, Osterra, Vel'Naar…" maxLength={255} />
        </div>
        <div className="fld">
          <label>Chronicle — what is this place?</label>
          <textarea className="stext" value={desc} onChange={(e) => setDesc(e.target.value)}
            placeholder="A drowned empire lit by whale-oil lanterns… (optional)" />
        </div>
        {templates.length > 0 && (
          <label className="samplerow">
            <input type="checkbox" checked={useSample} onChange={(e) => setUseSample(e.target.checked)} />
            <span><b>Begin from the sample world</b> — a tiny keep that shows every trick. Safe to break.</span>
          </label>
        )}
        <div className="mrow">
          <button type="button" className="sbtn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="sbtn primary" disabled={busy || !name.trim()}>
            {busy ? 'Founding…' : useSample ? 'Clone it & open the Atlas' : 'Found it & open the Atlas'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function EditModal({ busy, world, onClose, onSubmit }) {
  const [name, setName] = useState(world.name)
  const [desc, setDesc] = useState(world.description || '')
  const submit = (e) => { e.preventDefault(); if (name.trim()) onSubmit(world, name.trim(), desc.trim() || null) }
  return (
    <Modal title="Edit world details" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="fld">
          <label>Name</label>
          <input className="sinput" autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={255} />
        </div>
        <div className="fld">
          <label>Chronicle</label>
          <textarea className="stext" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="(optional)" />
        </div>
        <div className="mrow">
          <button type="button" className="sbtn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="sbtn primary" disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}

function DeleteModal({ busy, world, onClose, onConfirm }) {
  return (
    <Modal title={`Delete “${world.name}”?`} onClose={onClose}>
      <p className="mnote">
        This erases the world entirely — {plural(world.mapCount ?? 0, 'map')}, {plural(world.nodeCount ?? 0, 'node')} and{' '}
        {plural(world.imageCount ?? 0, 'image')} go with it, and its share link stops working.
      </p>
      <p className="mwarn">There is no way back from this.</p>
      <div className="mrow">
        <button className="sbtn ghost" onClick={onClose}>Keep it</button>
        <button className="sbtn danger" disabled={busy} onClick={() => onConfirm(world)}>
          {busy ? 'Erasing…' : 'Delete the world'}
        </button>
      </div>
    </Modal>
  )
}

export default Dashboard
