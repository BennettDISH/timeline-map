import React, { useEffect, useRef, useState } from 'react'
import Modal from '../Modal'
import atlasService from '../../services/atlasService'
import { errText } from '../../services/http'
import { cat } from '../../utils/categories'
import { QUIET, quietEntries, whyLine, readAside, writeAside, readDays, writeDays } from '../../utils/looseEnds'

// Loose ends, under the session notes: the entries that have not come up in a while (no edit,
// period text, thread or placement, and not named in a session's notes), oldest first, so the DM
// can bring them back or tie them off. "Go" shows the entry; "Not now" sets it aside in this
// browser until it comes up again or stays quiet for another spell. DM-only: nothing here is shared.
export default function LooseEnds({ worldId, onJump }) {
  const [data, setData] = useState(null) // null = loading, false = failed, else { entries, now }
  const [open, setOpen] = useState(false)
  const [days, setDays] = useState(readDays)
  const [aside, setAside] = useState(() => readAside(worldId))
  const seq = useRef(0)
  const load = () => {
    const my = ++seq.current
    atlasService.getLooseEnds(worldId)
      .then((d) => { if (my === seq.current) setData({ entries: d.entries || [], now: Date.parse(d.now) || Date.now(), err: null }) })
      .catch((e) => { if (my === seq.current) setData((x) => (x ? { ...x, err: errText(e, "Couldn't load the loose ends") } : false)) })
  }
  useEffect(() => { load() }, [worldId]) // eslint-disable-line react-hooks/exhaustive-deps

  const now = data?.now || Date.now()
  const { shown, hidden } = data ? quietEntries(data.entries, { now, days, aside }) : { shown: [], hidden: [] }
  const label = QUIET.find((q) => q.days === days)?.label
  const pickDays = (d) => { setDays(d); writeDays(d) }
  const setAsideNow = (id) => { const next = { ...aside, [id]: now }; setAside(next); writeAside(worldId, next) }
  const bringBack = () => {
    const next = { ...aside }
    for (const e of hidden) delete next[e.id]
    setAside(next); writeAside(worldId, next)
  }

  return (
    <section className="loose" aria-label="Loose ends">
      <button type="button" className="loosebtn" title="Entries that have not come up in a while" onClick={() => { setOpen(true); load() }}>
        <span className="loosename">🧵 Loose ends</span>
        {data && <span className="tcount">{shown.length}</span>}
      </button>
      {open && (
        <Modal title="Loose ends" className="loosemodal" onClose={() => setOpen(false)}>
          <div className="muted esmall">Entries with no edit, period text, thread or placement for {label}, and not named in a session’s notes since. Oldest first.</div>
          <div className="loosedays" role="group" aria-label="Quiet for at least">
            <span className="muted esmall">Quiet for</span>
            {QUIET.map((q) => (
              <button key={q.days} type="button" className={`chip ${q.days === days ? 'on' : ''}`} aria-pressed={q.days === days}
                onClick={() => pickDays(q.days)}>{q.label}</button>
            ))}
          </div>
          {data === null ? <div className="muted">Loading…</div>
            : data === false ? <div className="mrow"><span className="muted warn">Couldn't load the loose ends</span><button className="tool" onClick={load}>Try again</button></div>
            : (
              <>
                {data.err && <div className="muted warn esmall">{data.err}</div>}
                {!shown.length ? <div className="muted loosenone">Nothing has gone quiet for {label}</div> : (
                  <ul className="looselist">
                    {shown.map((e) => (
                      <li key={e.id}>
                        <span className="ic" style={{ background: cat(e.category).c }} aria-hidden="true">{cat(e.category).i}</span>
                        <span className="loosewhat">
                          <span className="loosetitle">{e.title}{e.visibility === 'dm' && <span className="glock" title="DM only"> 🔒</span>}</span>
                          <span className="muted esmall">{whyLine(e, now)}</span>
                        </span>
                        <button type="button" className="tool" title={`Show “${e.title}”`} onClick={() => { setOpen(false); onJump(e.id) }}>Go ▸</button>
                        <button type="button" className="tool" title="Set it aside until it comes up again" onClick={() => setAsideNow(e.id)}>Not now</button>
                      </li>
                    ))}
                  </ul>
                )}
                {hidden.length > 0 && (
                  <div className="mrow">
                    <span className="muted esmall">{hidden.length} set aside for now</span>
                    <button type="button" className="tool" onClick={bringBack}>Bring {hidden.length === 1 ? 'it' : 'them'} back</button>
                  </div>
                )}
              </>
            )}
        </Modal>
      )}
    </section>
  )
}
