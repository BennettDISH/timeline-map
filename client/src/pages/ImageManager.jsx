import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import TopBar, { Compass } from '../components/TopBar'
import worldService from '../services/worldService'
import imageServiceBase64 from '../services/imageServiceBase64'
import imageFolderService from '../services/imageFolderService'
import { errText } from '../services/http'
import { usesOf, describeUse, ACCEPT } from '../utils/images'
import '../styles/shell.scss'
import '../styles/archive.scss'

const PAGE = 60
const plural = (c, w) => `${c} ${w}${c === 1 ? '' : 's'}`

// The Archive: one world's art — maps, portraits, handouts. Scoped to a single world
// (switchable in the header); upload by button, by dragging anywhere, or by pasting.
function ImageManager() {
  const { worldId: paramWorldId } = useParams()
  const navigate = useNavigate()

  const [worlds, setWorlds] = useState(null)
  const [world, setWorld] = useState(null)
  const [worldsErr, setWorldsErr] = useState(null) // the world list did not load
  const [missing, setMissing] = useState(false) // the URL names a world that is not in this account
  const [foldersErr, setFoldersErr] = useState(null)
  const [imagesErr, setImagesErr] = useState(null)
  const [tick, setTick] = useState(0) // ⟳ Try again
  const fileRef = useRef(null)
  const loadSeq = useRef(0) // a late reply never overwrites a newer view
  const folderWorld = useRef(null) // the world the selected folder belongs to
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
  const [pendingWorld, setPendingWorld] = useState(null) // a world browsed to with the arrow keys, not yet chosen
  const viaKeys = useRef(false)
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

  // ---- world resolution: the URL names the world; one that is not yours says so ----
  useEffect(() => {
    let live = true
    setWorldsErr(null); setMissing(false)
    worldService.getWorlds().then(({ worlds: ws }) => {
      if (!live) return
      setWorlds(ws || [])
      const w = (ws || []).find((x) => String(x.id) === String(paramWorldId))
      if (!w) { setWorld(null); setLoading(false); if ((ws || []).length) setMissing(true); return }
      setWorld(w)
    }).catch((e) => { if (live) { setWorlds(null); setLoading(false); setWorldsErr(errText(e, "Couldn't load your worlds")) } })
    return () => { live = false }
  }, [paramWorldId, tick]) // eslint-disable-line

  useEffect(() => {
    document.title = world ? `The Archive · ${world.name}` : 'The Archive · Fantasy Map Timeline'
    return () => { document.title = 'Fantasy Map Timeline' }
  }, [world])

  // ---- folders ----
  const loadFolders = useCallback((wid) => {
    setFoldersErr(null)
    return imageFolderService.getFolders(wid).then((r) => {
      setFolders(imageFolderService.buildFolderTree(r.folders || []))
      setCounts({ total: r.total ?? 0, unsorted: r.unsorted ?? 0 })
    }).catch((e) => setFoldersErr(errText(e, "Couldn't load the folders")))
  }, [])
  useEffect(() => { if (world) { setFolderSel('all'); loadFolders(world.id) } }, [world?.id]) // eslint-disable-line
  // a folder is chosen for the world it belongs to: a switch to another world never queries with it
  const pickFolder = (sel) => { folderWorld.current = world?.id ?? null; setFolderSel(sel) }

  // ---- images ----
  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 300); return () => clearTimeout(t) }, [search])
  const loadImages = useCallback(async (reset) => {
    if (!world) return
    if (typeof folderSel === 'number' && folderWorld.current !== world.id) return // another world's folder: the reset lands next
    const seq = ++loadSeq.current
    reset ? setLoading(true) : setLoadingMore(true)
    setImagesErr(null)
    const params = { worldId: world.id, search: q || undefined, limit: PAGE, offset: reset ? 0 : images.length }
    if (folderSel === 'unsorted') params.unassigned = true
    else if (folderSel !== 'all') params.folderId = folderSel
    try {
      const r = await imageServiceBase64.getImages(params)
      if (seq !== loadSeq.current) return // a newer view was asked for since
      setImages((prev) => (reset ? r.images : [...prev, ...r.images]))
      setTotal(r.total ?? r.images.length)
    } catch (e) {
      if (seq !== loadSeq.current) return
      setImagesErr(errText(e, "Couldn't load the archive"))
      if (reset) { setImages([]); setTotal(0) }
    } finally { if (seq === loadSeq.current) { setLoading(false); setLoadingMore(false) } }
  }, [world?.id, folderSel, q, images.length]) // eslint-disable-line
  useEffect(() => { if (world) { setBox(-1); setSelected(new Set()); loadImages(true) } }, [world?.id, folderSel, q]) // eslint-disable-line

  const refresh = () => { loadImages(true); if (world) loadFolders(world.id) }

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), flash.sticky ? 12000 : 3500) // a list of what went wrong stays long enough to read
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
    // every file gets a verdict; the summary names each one that was skipped or failed, and why
    const skipped = [], failed = [], files = []
    for (const f of Array.from(fileList)) {
      const v = imageServiceBase64.validateImage(f)
      if (v.valid) files.push(f); else skipped.push(`${f.name}: ${v.error}`)
    }
    const targetFolder = typeof folderSel === 'number' ? folderSel : null
    if (files.length) setUploads({ done: 0, total: files.length, name: files[0].name, pct: 0 })
    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      setUploads((u) => u && ({ ...u, name: f.name, pct: 0 }))
      try {
        await imageServiceBase64.uploadImage(f, world.id, '', '', (p) => setUploads((u) => u && ({ ...u, pct: p })), targetFolder)
      } catch (e) {
        failed.push(`${f.name}: ${errText(e, 'upload failed')}`)
      }
      setUploads((u) => u && ({ ...u, done: i + 1 }))
    }
    setUploads(null)
    const added = files.length - failed.length
    const problems = [...failed, ...skipped]
    if (!problems.length) setFlash({ kind: 'ok', text: `${plural(added, 'new piece')} in the archive` })
    else setFlash({ kind: added ? 'err' : 'err', sticky: true, text: `${added ? `${plural(added, 'image')} added · ` : ''}${problems.slice(0, 3).join(' · ')}${problems.length > 3 ? ` · and ${problems.length - 3} more` : ''}` })
    if (added) refresh()
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

  const moveImages = async (ids, folderId) => { // folderId: number | null (unsorted) — one request for all of them
    const dest = folderId == null ? 'Unsorted' : (flatFolders.find((f) => f.id === folderId)?.name || 'folder')
    try {
      await imageServiceBase64.moveImages(ids, folderId)
      setFlash({ kind: 'ok', text: `Filed ${plural(ids.length, 'image')} under ${dest}` })
    } catch (e) {
      setFlash({ kind: 'err', text: errText(e, "Couldn't file them") })
    }
    setSelected(new Set())
    setMoveMenu(false)
    setBox(-1)
    refresh()
  }

  const busyRef = useRef(false) // one request per intent, whatever the keyboard repeats
  const [busyAct, setBusyAct] = useState(false)
  const guarded = async (fn) => { if (busyRef.current) return; busyRef.current = true; setBusyAct(true); try { await fn() } finally { busyRef.current = false; setBusyAct(false) } }
  const deleteImages = (ids) => guarded(async () => {
    try {
      await imageServiceBase64.deleteImages(ids)
      setFlash({ kind: 'ok', text: `${plural(ids.length, 'image')} removed from the archive` })
    } catch (e) {
      setFlash({ kind: 'err', text: errText(e, "Couldn't delete them") })
    }
    setConfirmDel(null)
    setSelected(new Set())
    setSelectMode(false)
    setBox(-1)
    refresh()
  })

  // ---- folder CRUD ----
  const submitFolder = (name) => guarded(async () => {
    try {
      if (folderForm.rename) {
        await imageFolderService.updateFolder(folderForm.rename.id, { name })
      } else {
        await imageFolderService.createFolder({ name, world_id: world.id, parent_id: folderForm.parentId || null })
      }
      setFolderForm(null)
      loadFolders(world.id)
    } catch (e) {
      setFlash({ kind: 'err', text: errText(e, "Couldn't save the folder") })
    }
  })
  const deleteFolder = (folder) => guarded(async () => {
    try {
      await imageFolderService.deleteFolder(folder.id)
      setConfirmFolderDel(null)
      if (folderSel === folder.id) setFolderSel('all')
      loadFolders(world.id)
      loadImages(true)
      setFlash({ kind: 'ok', text: `Folder "${folder.name}" removed${folder.children?.length ? ' with its subfolders' : ''} — its images went back to Unsorted` })
    } catch (e) {
      setConfirmFolderDel(null)
      setFlash({ kind: 'err', text: errText(e, "Couldn't delete the folder") })
    }
  })

  // a name or caption edited in the lightbox lands on the server and in the grid at once
  const editImage = async (id, patch) => {
    try {
      const r = await imageServiceBase64.updateImage(id, patch)
      setImages((list) => list.map((im) => (im.id === id ? { ...im, originalName: r.image?.originalName ?? im.originalName, altText: r.image?.altText ?? null } : im)))
      return true
    } catch (e) {
      setFlash({ kind: 'err', text: errText(e, "Couldn't save that") })
      return false
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
    // only when nothing sits above the tiles: a confirm, a folder dialog or the viewer owns Esc
    const esc = (e) => { if (e.key === 'Escape' && !confirmDel && !confirmFolderDel && !folderForm && box < 0) { setSelectMode(false); setSelected(new Set()) } }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [selectMode, confirmDel, confirmFolderDel, folderForm, box])

  // ================================================================ render ====
  if (worldsErr) {
    return (
      <div className="shell arch">
        <TopBar crumb="The Archive" />
        <div className="voidstate">
          <Compass size={92} className="void-rose" />
          <h2>The archive is out of reach</h2>
          <p>{worldsErr}</p>
          <div className="mrow"><button className="sbtn primary" onClick={() => setTick((t) => t + 1)}>⟳ Try again</button><Link to="/dashboard" className="sbtn ghost">To your worlds</Link></div>
        </div>
        {flash && <div className={`flash ${flash.kind === 'err' ? 'err' : ''}`}>{flash.text}</div>}
      </div>
    )
  }
  if (missing) {
    return (
      <div className="shell arch">
        <TopBar crumb="The Archive" />
        <div className="voidstate">
          <Compass size={92} className="void-rose" />
          <h2>That world isn't in your atlas</h2>
          <p>The link names a world this account does not have — it may have been deleted, or it belongs to someone else.</p>
          <Link to="/dashboard" className="sbtn primary">To your worlds</Link>
        </div>
      </div>
    )
  }
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
        {flash && <div className={`flash ${flash.kind === 'err' ? 'err' : ''}`}>{flash.text}</div>}
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
              value={pendingWorld ?? world.id}
              onKeyDown={(e) => { if (e.key.startsWith('Arrow')) viaKeys.current = true; else if (e.key === 'Enter' && pendingWorld != null) { const w = pendingWorld; setPendingWorld(null); navigate(`/worlds/${w}/images`) } }}
              onChange={(e) => { if (viaKeys.current) setPendingWorld(e.target.value); else navigate(`/worlds/${e.target.value}/images`) }}
              onBlur={() => { viaKeys.current = false; if (pendingWorld != null && String(pendingWorld) !== String(world.id)) { const w = pendingWorld; setPendingWorld(null); navigate(`/worlds/${w}/images`) } }}
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
        <button type="button" className="sbtn primary" onClick={() => fileRef.current?.click()}>⬆ Add art</button>
        <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { doUpload(e.target.files); e.target.value = '' }} />
      </div>

      <div className="archmain">
        <aside className="frail">
          <button className={`frow ${folderSel === 'all' ? 'on' : ''}`} onClick={() => pickFolder('all')}>
            <span className="fico">❖</span> All art <span className="fcount">{counts.total}</span>
          </button>
          <button className={`frow ${folderSel === 'unsorted' ? 'on' : ''}`} onClick={() => pickFolder('unsorted')}>
            <span className="fico">◌</span> Unsorted <span className="fcount">{counts.unsorted}</span>
          </button>
          {foldersErr && <div className="ferr">{foldersErr} <button type="button" className="lnk" onClick={() => world && loadFolders(world.id)}>Retry</button></div>}
          {folders.length > 0 && <div className="fsep" />}
          {folders.map((f) => (
            <FolderRow key={f.id} folder={f} depth={0}
              sel={folderSel} onSel={pickFolder}
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
          ) : imagesErr && images.length === 0 ? (
            <div className="voidstate">
              <Compass size={72} className="void-rose" />
              <h2>The archive didn't answer</h2>
              <p>{imagesErr}</p>
              <button className="sbtn primary" onClick={() => loadImages(true)}>⟳ Try again</button>
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
                      {usesOf(im) > 0 && <span className="inuse" title={describeUse(im)}>◈</span>}
                      {selectMode && <span className={`pickmark ${picked ? 'on' : ''}`}>{picked ? '✓' : ''}</span>}
                    </button>
                  )
                })}
              </div>
              {images.length < total && (
                <div className="loadmore">
                  {imagesErr && <div className="muted" style={{ marginBottom: 6 }}>{imagesErr}</div>}
                  <button className="sbtn" disabled={loadingMore} onClick={() => loadImages(false)}>
                    {loadingMore ? 'Unrolling…' : imagesErr ? '⟳ Try again' : `Show more (${total - images.length} remain)`}
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
          onEdit={(patch) => editImage(boxImg.id, patch)}
          blocked={!!confirmDel}
        />
      )}

      {/* folder create / rename */}
      {folderForm && (
        <FolderModal busy={busyAct}
          form={folderForm}
          parentName={folderForm.parentId ? flatFolders.find((f) => f.id === folderForm.parentId)?.name : null}
          onClose={() => setFolderForm(null)}
          onSubmit={submitFolder}
        />
      )}

      {/* delete confirms */}
      {confirmDel && (
        <ConfirmDelete busy={busyAct}
          ids={confirmDel.ids}
          images={images}
          onClose={() => setConfirmDel(null)}
          onConfirm={() => deleteImages(confirmDel.ids)}
        />
      )}
      {confirmFolderDel && (
        <Modal title={`Delete “${confirmFolderDel.name}”?`} onClose={() => setConfirmFolderDel(null)}>
          <p className="mnote">The folder goes; its {plural(confirmFolderDel.imageCount ?? 0, 'image')} stay in the archive and return to Unsorted.</p>
          {(confirmFolderDel.children?.length > 0) && <p className="mwarn">Its {plural(confirmFolderDel.children.length, 'subfolder')} go with it — every image inside returns to Unsorted.</p>}
          <div className="mrow">
            <button className="sbtn ghost" onClick={() => setConfirmFolderDel(null)}>Keep it</button>
            <button className="sbtn danger" disabled={busyAct} onClick={() => deleteFolder(confirmFolderDel)}>{busyAct ? 'Deleting…' : 'Delete folder'}</button>
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
        role="button" tabIndex={0} aria-label={`Folder ${folder.name}`}
        onClick={() => onSel(folder.id)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSel(folder.id) } else if (e.key === 'ArrowRight' && kids.length && !isOpen) onToggle(folder.id); else if (e.key === 'ArrowLeft' && kids.length && isOpen) onToggle(folder.id) }}>
        {kids.length
          ? <button type="button" className="caret" aria-label={isOpen ? 'Fold' : 'Unfold'} title={isOpen ? 'Fold' : 'Unfold'}
              onClick={(e) => { e.stopPropagation(); onToggle(folder.id) }}>{isOpen ? '▾' : '▸'}</button>
          : <span className="caret blank" />}
        <span className="fico">▤</span>
        <span className="fname">{folder.name}</span>
        <span className="fcount">{folder.imageCount ?? 0}</span>
        <span className="fmenu" onPointerDown={(e) => e.stopPropagation()}>
          <button className="fdots" aria-label={`Options for ${folder.name}`} title="Folder options" onClick={(e) => { e.stopPropagation(); onMenu(menu === folder.id ? null : folder.id) }}>⋯</button>
          {menu === folder.id && (
            <div className="menupop" onClick={(e) => e.stopPropagation()}>
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
    <div className="modal-back"
      onPointerDown={(e) => { e.currentTarget.dataset.down = e.target === e.currentTarget ? '1' : '' }}
      onClick={(e) => { if (e.target === e.currentTarget && e.currentTarget.dataset.down === '1') onClose() }}>
      <div className="smodal" onClick={(e) => e.stopPropagation()}>
        <div className="mhead">
          <h3>{title}</h3>
          <button className="mclose" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function FolderModal({ form, parentName, busy, onClose, onSubmit }) {
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
          <button type="submit" className="sbtn primary" disabled={busy || !name.trim()}>{busy ? (form.rename ? 'Renaming…' : 'Creating…') : (form.rename ? 'Rename' : 'Create')}</button>
        </div>
      </form>
    </Modal>
  )
}

function ConfirmDelete({ ids, images, busy, onClose, onConfirm }) {
  const targets = images.filter((i) => ids.includes(i.id))
  const used = targets.filter((i) => usesOf(i) > 0)
  const periods = targets.reduce((a, i) => a + (i.usage?.backdrops || 0), 0)
  const anchors = targets.reduce((a, i) => a + (i.usage?.anchor || 0), 0)
  return (
    <Modal title={ids.length === 1 ? 'Delete this image?' : `Delete ${ids.length} images?`} onClose={onClose}>
      {used.length > 0 && (
        <p className="mwarn">
          {ids.length === 1 ? `This image is ${describeUse(targets[0]).replace(/^In use — /, '')}.` : `${used.length === 1 ? 'One of them is' : `${used.length} of them are`} placed in your world.`}
          {' '}Maps and nodes using {ids.length === 1 ? 'it' : 'them'} lose their art
          {periods > 0 ? `, and ${plural(periods, 'timed backdrop period')} ${periods === 1 ? 'is' : 'are'} removed with it` : ''}
          {anchors > 0 ? `; the Forge loses its style anchor` : ''}.
        </p>
      )}
      <p className="mnote">Gone from the archive and from storage. This cannot be undone.</p>
      <div className="mrow">
        <button className="sbtn ghost" onClick={onClose}>Keep {ids.length === 1 ? 'it' : 'them'}</button>
        <button className="sbtn danger" disabled={busy} onClick={onConfirm}>{busy ? 'Deleting…' : 'Delete'}</button>
      </div>
    </Modal>
  )
}

function Lightbox({ img, onClose, onPrev, onNext, folders, onMove, onDelete, onFlash, onEdit, blocked = false }) {
  // browsing the folder list with the arrow keys must not file the image: Move (or Enter) does
  const cur = img.folderId == null ? '' : String(img.folderId)
  const [pick, setPick] = useState(cur)
  useEffect(() => { setPick(cur) }, [cur])
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState(img.originalName || '')
  const [caption, setCaption] = useState(img.altText || '')
  useEffect(() => { setName(img.originalName || ''); setCaption(img.altText || ''); setNaming(false) }, [img.id]) // eslint-disable-line
  const saveName = async () => { const v = name.trim(); setNaming(false); if (!v || v === img.originalName) { setName(img.originalName || ''); return } if (!(await onEdit?.({ original_name: v }))) setName(img.originalName || '') }
  const saveCaption = async () => { const v = caption.trim(); if (v === (img.altText || '')) return; if (!(await onEdit?.({ alt_text: v }))) setCaption(img.altText || '') }
  useEffect(() => {
    const key = (e) => {
      if (blocked) return // a confirm sits on top: Esc is its alone
      if (/select|input|textarea/i.test(e.target?.tagName)) return // a field keeps its own keys
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && onPrev) onPrev()
      else if (e.key === 'ArrowRight' && onNext) onNext()
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose, onPrev, onNext, blocked])

  const copyUrl = () => navigator.clipboard?.writeText(img.url)
    .then(() => onFlash({ kind: 'ok', text: 'Image address copied' }))
    .catch(() => onFlash({ kind: 'err', text: 'Could not copy' }))

  const uses = usesOf(img)
  const useLine = describeUse(img)

  return (
    <div className="modal-back lightbox" onClick={onClose}>
      {onPrev && <button className="lbnav prev" onClick={(e) => { e.stopPropagation(); onPrev() }} title="Previous (←)">‹</button>}
      <div className="lbframe" onClick={(e) => e.stopPropagation()}>
        <div className="lbimg">
          <img src={img.url} alt={img.altText || img.originalName} />
        </div>
        <div className="lbside">
          {naming
            ? <input className="sinput lbname" autoFocus value={name} maxLength={255} onChange={(e) => setName(e.target.value)}
                onBlur={saveName} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); else if (e.key === 'Escape') { setName(img.originalName || ''); setNaming(false) } }} />
            : <h3 className="lbtitle" title="Click to rename" onClick={() => onEdit && setNaming(true)}>{img.originalName}{onEdit && <span className="lbedit" aria-hidden="true"> ✎</span>}</h3>}
          <div className="lbmeta">
            {imageServiceBase64.formatFileSize(img.fileSize)} · {(img.mimeType || '').replace('image/', '')} ·{' '}
            {new Date(img.uploadedAt).toLocaleDateString()}
          </div>
          <div className={`lbuse ${uses ? 'live' : ''}`}>{uses > 0 && <span className="inuse-dot">◈</span>}{useLine}</div>
          {onEdit && (
            <div className="fld">
              <label>Caption — searched, shown to no one else</label>
              <input className="sinput" value={caption} maxLength={2000} placeholder="a note to find it by…" onChange={(e) => setCaption(e.target.value)}
                onBlur={saveCaption} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }} />
            </div>
          )}
          <div className="fld">
            <label>Filed under</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <select
                className="sselect"
                value={pick}
                onChange={(e) => setPick(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && pick !== cur) { e.preventDefault(); onMove(pick === '' ? null : Number(pick)) } }}
              >
              <option value="">Unsorted</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{' '.repeat(f.depth)}{f.name}</option>)}
              </select>
              {pick !== cur && <button className="sbtn primary" onClick={() => onMove(pick === '' ? null : Number(pick))}>Move</button>}
            </div>
          </div>
          <div className="lbactions">
            <button className="sbtn" onClick={copyUrl}>Copy address</button>
            <a className="sbtn ghost" href={img.url} target="_blank" rel="noopener noreferrer">Full size</a>
            <button className="sbtn danger" onClick={onDelete}>Delete</button>
          </div>
          <button className="mclose lbclose" onClick={onClose} title="Close (Esc)" aria-label="Close">✕</button>
        </div>
      </div>
      {onNext && <button className="lbnav next" onClick={(e) => { e.stopPropagation(); onNext() }} title="Next (→)">›</button>}
    </div>
  )
}

export default ImageManager
