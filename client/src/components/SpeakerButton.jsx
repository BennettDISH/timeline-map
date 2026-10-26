import React, { useEffect, useRef, useState } from 'react'
import { getAudio } from '../audio'

const WAVES = <><path d="M16 8.5a4.5 4.5 0 0 1 0 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M18.5 5.5a8 8 0 0 1 0 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></>
const CROSS = <path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />

// The speaker button in the Player View's top bar: whether the ambience plays (remembered by the
// page — on until someone turns it off), mute, and the ambience and effects levels (remembered by
// the audio module). The icon is the state: waves when sound is on, a cross when it is muted or
// the ambience is off. Opening it is a gesture, so it wakes the audio too. `onLevels` hears every
// change to mute or the levels (the DM-made ambience, which plays in an <audio> element, follows);
// `trouble` says that ambience would not play.
export default function SpeakerButton({ ambience, onAmbience, onLevels, trouble = false }) {
  const audio = getAudio()
  const [open, setOpen] = useState(false)
  const [prefs, setPrefs] = useState(() => ({ ...audio.prefs }))
  const wrap = useRef(null)

  const change = (next) => {
    audio.unlock()
    audio.setPrefs(next)
    setPrefs({ ...audio.prefs })
    onLevels?.(audio.prefs)
  }

  // the panel folds away on a press anywhere else, and on Escape
  useEffect(() => {
    if (!open) return undefined
    const away = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc) }
  }, [open])

  const silent = prefs.muted || !ambience
  return (
    <div className="speaker" ref={wrap}>
      <button type="button" className={`ambbtn speaker-btn${silent ? '' : ' on'}`} aria-expanded={open}
        title={trouble ? "The ambience wouldn't play — tap again, or check the sound" : prefs.muted ? 'Sound is muted' : ambience ? 'Sound' : 'The ambience is off'} aria-label={prefs.muted ? 'Sound (muted)' : 'Sound'}
        onClick={() => { audio.unlock(); setOpen((o) => !o) }}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />{silent ? CROSS : WAVES}</svg>
      </button>
      {open && (
        <div className="speaker-panel" role="group" aria-label="Sound">
          <label className="speaker-row">
            <span>Play ambience</span>
            <input type="checkbox" checked={ambience} onChange={(e) => { audio.unlock(); onAmbience(e.target.checked) }} />
          </label>
          <label className="speaker-row">
            <span>Mute</span>
            <input type="checkbox" checked={prefs.muted} onChange={(e) => change({ muted: e.target.checked })} />
          </label>
          <label className="speaker-row">
            <span>Ambience</span>
            <input type="range" min={0} max={100} step={1} value={Math.round(prefs.music * 100)} aria-label="Ambience volume"
              onChange={(e) => change({ music: Number(e.target.value) / 100 })} />
          </label>
          <label className="speaker-row">
            <span>Effects</span>
            <input type="range" min={0} max={100} step={1} value={Math.round(prefs.sfx * 100)} aria-label="Effects volume"
              onChange={(e) => change({ sfx: Number(e.target.value) / 100 })} />
          </label>
        </div>
      )}
    </div>
  )
}
