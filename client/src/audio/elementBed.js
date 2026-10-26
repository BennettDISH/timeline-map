// A map's own ambience (the one a DM made with "Make it") is a file on the Atlas' R2 host, and
// that host sends no CORS headers this page can count on, so Web Audio could not read it. It plays
// in an <audio> element instead; these two helpers hold it to the same mute and levels as the stock
// beds and bring it in and out the way they are.

/** The volume an element should have under the player's saved prefs (the ambience bus, through the master). */
export const levelOf = (prefs) => (prefs.muted ? 0 : Math.max(0, Math.min(1, prefs.master * prefs.music)))

const ramps = new WeakMap()

/** Move `el.volume` to `target` over `ms`, replacing any ramp already running; `then` runs at the end. */
export function rampTo(el, target, ms, then) {
  clearInterval(ramps.get(el))
  const from = el.volume
  const steps = Math.max(1, Math.round(ms / 50))
  let i = 0
  const iv = setInterval(() => {
    i += 1
    el.volume = Math.max(0, Math.min(1, from + (target - from) * (i / steps)))
    if (i >= steps) { clearInterval(iv); ramps.delete(el); if (then) then() }
  }, 50)
  ramps.set(el, iv)
}
