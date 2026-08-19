import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom'
import TopBar, { Compass } from '../components/TopBar'
import worldService from '../services/worldService'
import imageServiceBase64 from '../services/imageServiceBase64'
import imageFolderService from '../services/imageFolderService'
import '../styles/shell.scss'
import '../styles/archive.scss'

const PAGE = 60
const plural = (c, w) => `${c} ${w}${c === 1 ? '' : 's'}`
const usesOf = (im) => (im.usage ? (im.usage.maps || 0) + (im.usage.nodes || 0) : 0)

// The Archive: one world's art — maps, portraits, handouts. Scoped to a single world
// (switchable in the header); upload by button, by dragging anywhere, or by pasting.
function ImageManager() {
  const { worldId: paramWorldId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const [worlds, setWorlds] = useState(null)
  const [world, setWorld] = useState(null)
  const [folders, setFolders] = useState([]) // tree
  const [counts, setCounts] = useState({ total: 0, unsorted: 0 })
  const [folderSel, setFolderSel] = useState('all') // 'all' | 'unsorted' | folder id (number)
  const [collapsed, setCollapsed] = useState(() => new Set())
  const [folderMenu, setFolderMenu] = useState(null) // folder id with an open ⋯ menu
  const [folderForm, setFolderForm] = useState(null) // {parentId} | {rename: folder}

  const [images, setImages] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('') // debounced search

  const [box, setBox] = useState(-1) // lightbox index into images
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState(() => new Set())
  const [moveMenu, setMoveMenu] = useState(false) // bulk "move to" dropdown
  const [confirmDel, setConfirmDel] = useState(null) // { ids: [...] }
  const [confirmFolderDel, setConfirmFolderDel] = useState(null) // folder

  const [dragging, setDragging] = useState(false)
  const [uploads, setUploads] = useState(null) // { done, total, name, pct, fails }
  const [flash, setFlash] = useState(null)
  const dragDepth = useRef(0)
  const uploadRef = useRef(() => {})

  // ---- world resolution: /worlds/:id/images → ?world= → last used → first ----
  useEffect(() => {
    let live = true
    worldService.getWorlds().then(({ worlds: ws }) => {
      if (!live) return
      setWorlds(ws || [])
      const wanted = paramWorldId || searchParams.get('world') || worldService.getCurrentWorld()?.id
      const w = (ws || []).find((x) => String(x.id) === String(wanted)) || (ws || [])[0]
      if (!w) { setWorld(null); setLoading(false); return }
      if (String(w.id) !== String(paramWorldId)) {
        navigate(`/worlds/${w.id}/images`, { replace: true })
      } else {
        setWorld(w)
      }
    }).catch(() => { if (live) { setWorlds([]); setLoading(false); setFlash({ kind: 'err', text: 'Could not load your worlds' }) } })
    return () => { live = false }
  }, [paramWorldId]) // eslint-disable-line

  useEffect(() => {
    document.title = world ? `The Archive · ${world.name}` : 'The Archive · Fantasy Map Timeline'
    return () => { document.title = 'Fantasy Map Timeline' }
  }, [world])

  // ---- folders ----
  const loadFolders = useCallback((wid) =>
    imageFolderService.getFolders(wid).then((r) => {
      setFolders(imageFolderService.buildFolderTree(r.folders || []))
      setCounts({ total: r.total ?? 0, unsorted: r.unsorted ?? 0 })
    }).catch(() => {}), [])
  useEffect(() => { if (world) { setFolderSel('all'); loadFolders(world.id) } }, [world?.id]) // eslint-disable-line

  // ---- images ----
  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 300); return () => clearTimeout(t) }, [search])
  const loadImages = useCallback(async (reset) => {
    if (!world) return
    reset ? setLoading(true) : setLoadingMore(true)
    const params = { worldId: world.id, search: q || undefined, limit: PAGE, offset: reset ? 0 : images.length }
    if (folderSel === 'unsorted') params.unassigned = true
    else if (folderSel !== 'all') params.folderId = folderSel
    try {
      const r = await imageServiceBase64.getImages(params)
      setImages((prev) => (reset ? r.images : [...prev, ...r.images]))
      setTotal(r.total ?? r.images.length)
    } catch (e) {
      setFlash({ kind: 'err', text: e.message || 'Could not load the archive' })
    } finally { setLoading(false); setLoadingMore(false) }
  }, [world?.id, folderSel, q, images.length]) // eslint-disable-line
  useEffect(() => { if (world) { setBox(-1); setSelected(new Set()); loadImages(true) } }, [world?.id, folderSel, q]) // eslint-disable-line

  const refresh = () => { loadImages(true); if (world) loadFolders(world.id) }

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 3500)
    return () => clearTimeout(t)
  }, [flash])

  // close folder ⋯ menus on outside click
  useEffect(() => {
    if (folderMenu == null && !moveMenu) return
    const close = () => { setFolderMenu(null); setMoveMenu(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [folderMenu, moveMenu])

  // ---- upload: button, drag-anywhere, paste ----
  const doUpload = async (fileList) => {
    if (!world) return
    const files = Array.from(fileList).filter((f) => {
      const v = imageServiceBase64.validateImage(f)
      if (!v.valid) setFlash({ kind: 'err', text: `${f.name}: ${v.error}` })
      return v.valid
    })
    if (!files.length) return
    const targetFolder = typeof folderSel === 'number' ? folderSel : null
    let fails = 0
    setUploads({ done: 0, total: files.length, name: files[0].name, pct: 0 })
    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      setUploads((u) => u && ({ ...u, name: f.name, pct: 0 }))
      try {
        const r = await imageServiceBase64.uploadImage(f, world.id, '', '', (p) => setUploads((u) => u && ({ ...u, pct: p })))
        if (targetFolder && r.image) await imageServiceBase64.updateImage(r.image.id, { folder_id: targetFolder }).catch(() => {})
      } catch (e) {
        fails += 1
      }
      setUploads((u) => u && ({ ...u, done: i + 1 }))
    }
    setUploads(null)
    setFlash(fails
      ? { kind: 'err', text: `Added ${files.length - fails} of ${plural(files.length, 'image')} — ${fails} failed` }
      : { kind: 'ok', text: `${plural(files.length, 'new piece')} in the archive` })
    refresh()
  }
  uploadRef.current = doUpload

  useEffect(() => {
    const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')
    const enter = (e) => { if (hasFiles(e)) { e.preventDefault(); dragDepth.current += 1; setDragging(true) } }
    const over = (e) => { if (hasFiles(e)) e.preventDefault() }
    const leave = (e) => { if (hasFiles(e)) { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false) } }
    const drop = (e) => {
      if (!hasFiles(e)) return
      e.preventDefault(); dragDepth.current = 0; setDragging(false)
      if (e.dataTransfer.files?.length) uploadRef.current(e.dataTransfer.files)
    }
    const paste = (e) => { if (e.clipboardData?.files?.length) uploadRef.current(e.clipboardData.files) }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragover', over)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', drop)
    window.addEventListener('paste', paste)
    return () => {
      window.removeEventListener('dragenter', enter)
      window.removeEventListener('dragover', over)
      window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', drop)
      window.removeEventListener('paste', paste)
    }
  }, [])

  // ---- moving & deleting ----
  const flatFolders = useMemo(() => {
    const out = []
    const walk = (list, depth) => list.forEach((f) => { out.push({ ...f, depth }); walk(f.children || [], depth + 1) })
    walk(folders, 0)
    return out
  }, [folders])

  const moveImages = async (ids, folderId) => { // folderId: number | null (unsorted)
    let fails = 0
    for (const id of ids) {
      try { await imageServiceBase64.updateImage(id, { folder_id: folderId }) } catch (e) { fails += 1 }
    }
    const dest = folderId == null ? 'Unsorted' : (flatFolders.find((f) => f.id === folderId)?.name || 'folder')
    setFlash(fails
      ? { kind: 'err', text: `Moved ${ids.length - fails} of ${ids.length} — ${fails} failed` }
      : { kind: 'ok', text: `Filed ${plural(ids.length, 'image')} under ${dest}` })
    setSelected(new Set())
    setMoveMenu(false)
    setBox(-1)
    refresh()
  }

  const deleteImages = async (ids) => {
    let fails = 0
    for (const id of ids) {
      try { await imageServiceBase64.deleteImage(id) } catch (e) { fails += 1 }
    }
    setFlash(fails
      ? { kind: 'err', text: `Deleted ${ids.length - fails} of ${ids.length} — ${fails} failed` }
      : { kind: 'ok', text: `${plural(ids.length, 'image')} removed from the archive` })
    setConfirmDel(null)
    setSelected(new Set())
    setSelectMode(false)
    setBox(-1)
    refresh()
  }

  // ---- folder CRUD ----
  const submitFolder = async (name) => {
    try {
      if (folderForm.rename) {
        await imageFolderService.updateFolder(folderForm.rename.id, { name })
      } else {
        await imageFolderService.createFolder({ name, world_id: world.id, parent_id: folderForm.parentId || null })
      }
      setFolderForm(null)
      loadFolders(world.id)
    } catch (e) {
      setFlash({ kind: 'err', text: e.message || 'Could not save the folder' })
    }
  }
  const deleteFolder = async (folder) => {
    try {
      await imageFolderService.deleteFolder(folder.id)
      setConfirmFolderDel(null)
      if (folderSel === folder.id) setFolderSel('all')
      loadFolders(world.id)
      loadImages(true)
      setFlash({ kind: 'ok', text: `Folder "${folder.name}" removed — its images went back to Unsorted` })
    } catch (e) {
      setConfirmFolderDel(null)
      setFlash({ kind: 'err', text: e.message || 'Could not delete the folder' })
    }
  }

  // ---- selection ----
  const toggleSel = (id) => setSelected((s) => {
    const n = new Set(s)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })
  useEffect(() => {
    if (!selectMode) return
    const esc = (e) => { if (e.key === 'Escape') { setSelectMode(false); setSelected(new Set()) } }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [selectMode])

  // ================================================================ render ====
  if (worlds !== null && worlds.length === 0) {
    return (
      <div className="shell arch">
        <TopBar crumb="The Archive" />
        <div className="voidstate">
          <Compass size={92} className="void-rose" />
          <h2>The archive awaits a world</h2>
          <p>Art lives inside a world. Found one first, then fill its archive with maps and portraits.</p>
          <Link to="/dashboard" className="sbtn primary">To your worlds</Link>
        </div>
      </div>
    )
  }

  const selCount = selected.size
  const boxImg = box >= 0 ? images[box] : null

  return (
    <div className="shell arch">
      <TopBar crumb="The Archive" />

      <div className="archhead">
        <div className="atitle">
          <span className="kicker">The Archive of</span>
          {world && (
            <select
              className="worldsel"
              value={world.id}
              onChange={(e) => navigate(`/worlds/${e.target.value}/images`)}
              title="Switch world"
            >
              {(worlds || []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          )}
        </div>
        <div className="spacer" />
        <input
          className="sinput asearch"
          placeholder="Search the archive…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {world && <Link className="sbtn ghost" to={`/w/${world.id}`}>Open the Atlas ▸</Link>}
        <button
          className={`sbtn ${selectMode ? '' : 'ghost'}`}
          onClick={() => { setSelectMode((v) => !v); setSelected(new Set()) }}
          disabled={!images.length}
        >{selectMode ? 'Done' : 'Select'}</button>
        <label className="sbtn primary">
          ⬆ Add art
          <input type="file" accept="image/*" multiple hidden onChange={(e) => { doUpload(e.target.files); e.target.value = '' }} />
        </label>
      </div>

      <div className="archmain">
        <aside className="frail">
          <button className={`frow ${folderSel === 'all' ? 'on' : ''}`} onClick={() => setFolderSel('all')}>
            <span className="fico">❖</span> All art <span className="fcount">{counts.total}</span>
          </button>
          <button className={`frow ${folderSel === 'unsorted' ? 'on' : ''}`} onClick={() => setFolderSel('unsorted')}>
            <span className="fico">◌</span> Unsorted <span className="fcount">{counts.unsorted}</span>
          </button>
          {folders.length > 0 && <div className="fsep" />}
          {folders.map((f) => (
            <FolderRow key={f.id} folder={f} depth={0}
              sel={folderSel} onSel={setFolderSel}
              collapsed={collapsed}
              onToggle={(id) => setCollapsed((c) => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n })}
              menu={folderMenu} onMenu={setFolderMenu}
              onRename={(fold) => setFolderForm({ rename: fold })}
              onSub={(fold) => setFolderForm({ parentId: fold.id })}
              onDelete={(fold) => setConfirmFolderDel(fold)}
            />
          ))}
          <button className="frow newf" onClick={() => setFolderForm({ parentId: null })}>＋ New folder</button>
        </aside>

        <section className="agallery">
          {loading ? (
            <div className="tilegrid">
              {Array.from({ length: 10 }).map((_, i) => <div key={i} className="skel tile-skel" />)}
            </div>
          ) : images.length === 0 ? (
            <div className="voidstate">
              <Compass size={72} className="void-rose" />
              {q ? (
                <>
                  <h2>Nothing by that name</h2>
                  <p>No art matching “{q}”{folderSel !== 'all' ? ' in this folder' : ''}.</p>
                </>
              ) : (
                <>
                  <h2>{folderSel === 'all' ? 'The archive is empty' : 'This folder is empty'}</h2>
                  <p>Drop images anywhere on this page, paste one from your clipboard, or use “Add art”. Maps, portraits, handouts — it all lives here.</p>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="tilegrid">
                {images.map((im, idx) => {
                  const picked = selected.has(im.id)
                  return (
                    <button
                      key={im.id}
                      className={`tile ${selectMode ? 'selmode' : ''} ${picked ? 'picked' : ''}`}
                      onClick={() => (selectMode ? toggleSel(im.id) : setBox(idx))}
                      title={im.originalName}
                    >
                      <img src={im.url} alt={im.altText || im.originalName} loading="lazy" />
                      <span className="tname">{im.originalName}</span>
                      {usesOf(im) > 0 && <span className="inuse" title={`Placed in your world — ${plural(im.usage.maps, 'map')}, ${plural(im.usage.nodes, 'node')}`}>◈</span>}
                      {selectMode && <span className={`pickmark ${picked ? 'on' : ''}`}>{picked ? '✓' : ''}</span>}
                    </button>
                  )
                })}
              </div>
              {images.length < total && (
                <div className="loadmore">
                  <button className="sbtn" disabled={loadingMore} onClick={() => loadImages(false)}>
                    {loadingMore ? 'Unrolling…' : `Show more (${total - images.length} remain)`}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* full-page drop veil */}
      {dragging && (
        <div className="dropveil">
          <div className="dropframe">
            <Compass size={84} className="void-rose" />
            <h2>Add to the archive{world ? ` of ${world.name}` : ''}</h2>
            <p>{typeof folderSel === 'number'
              ? `Filed under “${flatFolders.find((f) => f.id === folderSel)?.name}”`
              : 'Release to upload'}</p>
          </div>
        </div>
      )}

      {/* upload progress */}
      {uploads && (
        <div className="upltoast">
          <div className="upl-line">Adding {uploads.done + 1 > uploads.total ? uploads.total : uploads.done + 1} of {uploads.total} — <em>{uploads.name}</em></div>
          <div className="upl-bar"><div style={{ width: `${((uploads.done + uploads.pct / 100) / uploads.total) * 100}%` }} /></div>
        </div>
      )}

      {/* bulk action bar */}
      {selectMode && selCount > 0 && (
        <div className="bulkbar" onPointerDown={(e) => e.stopPropagation()}>
          <span className="bcount">{plural(selCount, 'image')} selected</span>
          <div className="bmove">
            <button className="sbtn" onClick={() => setMoveMenu((v) => !v)}>File under ▾</button>
            {moveMenu && (
              <div className="menupop up">
                <button onClick={() => moveImages([...selected], null)}>◌ Unsorted</button>
                {flatFolders.map((f) => (
                  <button key={f.id} style={{ paddingLeft: 10 + f.depth * 14 }} onClick={() => moveImages([...selected], f.id)}>▸ {f.name}</button>
                ))}
              </div>
            )}
          </div>
          <button className="sbtn danger" onClick={() => setConfirmDel({ ids: [...selected] })}>Delete</button>
          <button className="sbtn ghost" onClick={() => { setSelectMode(false); setSelected(new Set()) }}>Cancel</button>
        </div>
      )}

      {/* lightbox */}
      {boxImg && (
        <Lightbox
          img={boxImg}
          onClose={() => setBox(-1)}
          onPrev={box > 0 ? () => setBox(box - 1) : null}
          onNext={box < images.length - 1 ? () => setBox(box + 1) : null}
          folders={flatFolders}
          onMove={(fid) => moveImages([boxImg.id], fid)}
          onDelete={() => setConfirmDel({ ids: [boxImg.id] })}
          onFlash={setFlash}
        />
      )}

      {/* folder create / rename */}
      {folderForm && (
        <FolderModal
          form={folderForm}
          parentName={folderForm.parentId ? flatFolders.find((f) => f.id === folderForm.parentId)?.name : null}
          onClose={() => setFolderForm(null)}
          onSubmit={submitFolder}
        />
      )}

      {/* delete confirms */}
      {confirmDel && (
        <ConfirmDelete
          ids={confirmDel.ids}
          images={images}
          onClose={() => setConfirmDel(null)}
          onConfirm={() => deleteImages(confirmDel.ids)}
        />
      )}
      {confirmFolderDel && (
        <Modal title={`Delete “${confirmFolderDel.name}”?`} onClose={() => setConfirmFolderDel(null)}>
          <p className="mnote">The folder goes; its {plural(confirmFolderDel.imageCount ?? 0, 'image')} stay in the archive and return to Unsorted.</p>
          {(confirmFolderDel.children?.length > 0) && <p className="mwarn">It has subfolders — delete those first.</p>}
          <div className="mrow">
            <button className="sbtn ghost" onClick={() => setConfirmFolderDel(null)}>Keep it</button>
            <button className="sbtn danger" onClick={() => deleteFolder(confirmFolderDel)}>Delete folder</button>
          </div>
        </Modal>
      )}

      {flash && <div className={`flash ${flash.kind === 'err' ? 'err' : ''}`}>{flash.text}</div>}
    </div>
  )
}

function FolderRow({ folder, depth, sel, onSel, collapsed, onToggle, menu, onMenu, onRename, onSub, onDelete }) {
  const kids = folder.children || []
  const isOpen = !collapsed.has(folder.id)
  return (
    <>
      <div className={`frow fdir ${sel === folder.id ? 'on' : ''}`} style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => onSel(folder.id)}>
        <span
          className={`caret ${kids.length ? '' : 'blank'}`}
          onClick={(e) => { if (kids.length) { e.stopPropagation(); onToggle(folder.id) } }}
        >{kids.length ? (isOpen ? '▾' : '▸') : ''}</span>
        <span className="fico">▤</span>
        <span className="fname">{folder.name}</span>
        <span className="fcount">{folder.imageCount ?? 0}</span>
        <span className="fmenu" onPointerDown={(e) => e.stopPropagation()}>
          <button className="fdots" onClick={(e) => { e.stopPropagation(); onMenu(menu === folder.id ? null : folder.id) }}>⋯</button>
          {menu === folder.id && (
            <div className="menupop">
              <button onClick={() => { onMenu(null); onRename(folder) }}>Rename</button>
              <button onClick={() => { onMenu(null); onSub(folder) }}>New subfolder</button>
              <button className="dngr" onClick={() => { onMenu(null); onDelete(folder) }}>Delete…</button>
            </div>
          )}
        </span>
      </div>
      {isOpen && kids.map((k) => (
        <FolderRow key={k.id} folder={k} depth={depth + 1} sel={sel} onSel={onSel}
          collapsed={collapsed} onToggle={onToggle} menu={menu} onMenu={onMenu}
          onRename={onRename} onSub={onSub} onDelete={onDelete} />
      ))}
    </>
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

function FolderModal({ form, parentName, onClose, onSubmit }) {
  const [name, setName] = useState(form.rename ? form.rename.name : '')
  const title = form.rename ? 'Rename folder' : parentName ? `New folder in “${parentName}”` : 'New folder'
  const submit = (e) => { e.preventDefault(); if (name.trim()) onSubmit(name.trim()) }
  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="fld">
          <label>Name</label>
          <input className="sinput" autoFocus value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Region maps, Portraits, Handouts…" maxLength={255} />
        </div>
        <div className="mrow">
          <button type="button" className="sbtn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="sbtn primary" disabled={!name.trim()}>{form.rename ? 'Rename' : 'Create'}</button>
        </div>
      </form>
    </Modal>
  )
}

function ConfirmDelete({ ids, images, onClose, onConfirm }) {
  const targets = images.filter((i) => ids.includes(i.id))
  const used = targets.filter((i) => usesOf(i) > 0)
  return (
    <Modal title={ids.length === 1 ? 'Delete this image?' : `Delete ${ids.length} images?`} onClose={onClose}>
      {used.length > 0 && (
        <p className="mwarn">
          {used.length === 1 ? 'One of them is' : `${used.length} of them are`} placed in your world —
          maps and nodes using {used.length === 1 ? 'it' : 'them'} will lose their art.
        </p>
      )}
      <p className="mnote">Gone from the archive and from storage. This cannot be undone.</p>
      <div className="mrow">
        <button className="sbtn ghost" onClick={onClose}>Keep {ids.length === 1 ? 'it' : 'them'}</button>
        <button className="sbtn danger" onClick={onConfirm}>Delete</button>
      </div>
    </Modal>
  )
}

function Lightbox({ img, onClose, onPrev, onNext, folders, onMove, onDelete, onFlash }) {
  useEffect(() => {
    const key = (e) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && onPrev) onPrev()
      else if (e.key === 'ArrowRight' && onNext) onNext()
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose, onPrev, onNext])

  const copyUrl = () => navigator.clipboard?.writeText(img.url)
    .then(() => onFlash({ kind: 'ok', text: 'Image address copied' }))
    .catch(() => onFlash({ kind: 'err', text: 'Could not copy' }))

  const uses = usesOf(img)
  const useLine = uses === 0
    ? 'Not placed anywhere yet'
    : ['In use —',
        img.usage.maps > 0 ? `backdrop of ${plural(img.usage.maps, 'map')}` : null,
        img.usage.nodes > 0 ? `art of ${plural(img.usage.nodes, 'node')}` : null,
      ].filter(Boolean).join(' ').replace('maps art', 'maps · art')

  return (
    <div className="modal-back lightbox" onClick={onClose}>
      {onPrev && <button className="lbnav prev" onClick={(e) => { e.stopPropagation(); onPrev() }} title="Previous (←)">‹</button>}
      <div className="lbframe" onClick={(e) => e.stopPropagation()}>
        <div className="lbimg">
          <img src={img.url} alt={img.altText || img.originalName} />
        </div>
        <div className="lbside">
          <h3 className="lbtitle">{img.originalName}</h3>
          <div className="lbmeta">
            {imageServiceBase64.formatFileSize(img.fileSize)} · {(img.mimeType || '').replace('image/', '')} ·{' '}
            {new Date(img.uploadedAt).toLocaleDateString()}
          </div>
          <div className={`lbuse ${uses ? 'live' : ''}`}>{uses > 0 && <span className="inuse-dot">◈</span>}{useLine}</div>
          <div className="fld">
            <label>Filed under</label>
            <select
              className="sselect"
              value={img.folderId ?? ''}
              onChange={(e) => onMove(e.target.value === '' ? null : Number(e.target.value))}
            >
              <option value="">Unsorted</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{' '.repeat(f.depth)}{f.name}</option>)}
            </select>
          </div>
          <div className="lbactions">
            <button className="sbtn" onClick={copyUrl}>Copy address</button>
            <a className="sbtn ghost" href={img.url} target="_blank" rel="noopener noreferrer">Full size</a>
            <button className="sbtn danger" onClick={onDelete}>Delete</button>
          </div>
          <button className="mclose lbclose" onClick={onClose} title="Close (Esc)">✕</button>
        </div>
      </div>
      {onNext && <button className="lbnav next" onClick={(e) => { e.stopPropagation(); onNext() }} title="Next (→)">›</button>}
    </div>
  )
}

export default ImageManager
