import React, { useEffect, useRef, useState } from 'react'

// A themed audio player: one round play button, a thin progress track, a time readout.
// Replaces the browser's native controls (which ignore the app's palette) for voice
// lines and ambience. `loop` keeps ambience going; the element itself stays hidden.
const fmt = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00')

export default function AudioClip({ src, loop = false, caption, className = '' }) {
  const ref = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [t, setT] = useState(0)
  const [dur, setDur] = useState(0)
  const [err, setErr] = useState(false)

  useEffect(() => { setPlaying(false); setT(0); setDur(0); setErr(false) }, [src])

  const toggle = () => {
    const a = ref.current
    if (!a) return
    if (playing) { a.pause(); setPlaying(false) } else { a.play().then(() => setPlaying(true)).catch(() => setErr(true)) }
  }
  const seek = (e) => {
    const a = ref.current
    if (!a || !dur) return
    const r = e.currentTarget.getBoundingClientRect()
    a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur
  }

  return (
    <div className={`aclip ${playing ? 'on' : ''} ${err ? 'err' : ''} ${className}`}>
      <audio ref={ref} src={src} loop={loop} preload="metadata"
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onEnded={() => { if (!loop) setPlaying(false) }}
        onError={() => setErr(true)} />
      <button type="button" className="aplay" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} title={err ? "Couldn't load the audio" : (playing ? 'Pause' : 'Play')}>
        {err ? '!' : playing ? '❚❚' : '▶'}
      </button>
      <div className="abody">
        {caption && <div className="acap">{caption}</div>}
        <div className="atrack" onClick={seek} role="progressbar" aria-valuemin={0} aria-valuemax={dur || 0} aria-valuenow={t}>
          <div className="afill" style={{ width: dur ? `${(t / dur) * 100}%` : '0%' }} />
        </div>
      </div>
      <span className="atime">{loop && playing ? '∞' : `${fmt(t)} / ${fmt(dur)}`}</span>
    </div>
  )
}
