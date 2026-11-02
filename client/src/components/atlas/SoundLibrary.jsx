import React, { useEffect, useRef, useState } from 'react'
import { MANIFEST_URL } from '../../audio'
import { parseManifest } from '../../audio/audio'
import { BEDS, BED_LABELS, SOUND_NAMES } from '../../audio/names'

// The editor's stock sounds, in the map panel beside the generated ambience: the beds to pick from
// for this map, and the world's switch for the cues. A map and a world start silent.
// A preview plays here and nowhere else: one <audio> element on the DM's own page, nothing saved and
// nothing sent, gone when the panel closes or the map changes (the panel is keyed by map). The
// element, not the Player View's audio module, so a mute saved in this browser can't silence it.

const CUE_SAMPLE = 'ui.reveal'
let manifest = null // the file's sounds, fetched once, on the first preview
const sounds = () => {
  if (!manifest) {
    manifest = fetch(MANIFEST_URL, { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
      .then((raw) => parseManifest(raw, new Set(SOUND_NAMES)).sounds)
      .catch((e) => { manifest = null; throw e })
  }
  return manifest
}

export default function SoundLibrary({ bed, own, canRemove, onPick, cues, onCues, children }) {
  const el = useRef(null)
  const asked = useRef(null) // the last preview asked for: a slow fetch never starts one the DM has moved on from
  const [playing, setPlaying] = useState(null)
  const [err, setErr] = useState(false)

  const stop = () => {
    asked.current = null
    setPlaying(null)
    const a = el.current
    if (a) { a.pause(); a.removeAttribute('src') }
  }
  useEffect(() => stop, []) // eslint-disable-line

  const preview = async (name) => {
    if (playing === name) { stop(); return }
    stop()
    setErr(false)
    asked.current = name
    setPlaying(name)
    try {
      const url = (await sounds()).get(name)?.urls[0]
      if (asked.current !== name) return
      if (!url) throw new Error('no file')
      const a = el.current
      a.src = url
      a.loop = BEDS.includes(name)
      a.volume = 0.7
      await a.play()
    } catch (e) {
      if (asked.current === name) { setErr(true); stop() }
    }
  }
  const previewBtn = (name, label) => (
    <button type="button" className="btn bedplay" aria-pressed={playing === name} aria-label={`${playing === name ? 'Stop the preview of' : 'Preview'} ${label}`}
      title={playing === name ? 'Stop the preview' : 'Preview: only you hear it'} onClick={() => preview(name)}>{playing === name ? '■' : '▶'}</button>
  )

  return (
    <div className="soundlib">
      <div className="isect">Ambience — silent until you choose one</div>
      <audio ref={el} preload="none" onEnded={() => { if (!el.current?.loop) stop() }} />
      <div className="muted esmall bedstate" role="status">
        {own ? "Players hear this map's own ambience." : bed ? `Players hear ${BED_LABELS[bed]} on this map.` : 'Players hear nothing on this map.'}
      </div>
      <ul className="bedlist" aria-label="Stock ambience">
        {BEDS.map((b) => (
          <li key={b} className="bedrow">
            {previewBtn(b, BED_LABELS[b])}
            <span className="bedname">{BED_LABELS[b]}</span>
            <button type="button" className={`btn beduse ${bed === b ? 'lit' : ''}`} aria-pressed={bed === b} disabled={own}
              aria-label={bed === b ? `${BED_LABELS[b]} is in use: stop using it` : `Use ${BED_LABELS[b]} on this map`}
              title={own ? "This map's own ambience plays instead" : bed === b ? 'Stop using it: this map goes silent' : 'Players hear it on this map'}
              onClick={() => onPick(bed === b ? null : b)}>{bed === b ? '✓ In use' : 'Use'}</button>
          </li>
        ))}
      </ul>
      {own && canRemove && <div className="muted esmall bedhint">Remove your own ambience (✕ below) to use one of these.</div>}
      {children}
      <div className="isect">Sound cues — off until you turn them on</div>
      <div className="bedrow">
        {previewBtn(CUE_SAMPLE, 'the sound cues')}
        <span className="bedname">A soft sound when a pin appears and as the era bar moves</span>
        <button type="button" className={`btn beduse ${cues ? 'lit' : ''}`} aria-pressed={cues}
          aria-label={cues ? 'Sound cues are on in this world: turn them off' : 'Turn sound cues on for this world'}
          title="For this whole world, not only this map" onClick={onCues}>{cues ? '✓ On' : 'Turn on'}</button>
      </div>
      <div className="muted esmall">For this whole world.</div>
      {err && <div className="muted warn esmall" role="alert">That sound wouldn't play. Try again.</div>}
    </div>
  )
}
