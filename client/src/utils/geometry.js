// Small pure helpers for outlines: polygons whose points are % of the map plane (the same
// space pins live in, so an outline is the same patch of art on every screen).

const segDist = (p, a, b) => {
  let x = a[0], y = a[1], dx = b[0] - x, dy = b[1] - y
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy)
    if (t > 1) { x = b[0]; y = b[1] } else if (t > 0) { x += dx * t; y += dy * t }
  }
  return Math.hypot(p[0] - x, p[1] - y)
}

// Ramer–Douglas–Peucker on an open polyline: drops points that stay within eps (% of the
// plane) of the line between their neighbours, so a freehand trace stores a few dozen
// corners instead of every pointer sample. Endpoints always survive.
export function simplify(pts, eps = 0.25) {
  if (pts.length < 3) return pts.slice()
  const keep = new Array(pts.length).fill(false)
  keep[0] = keep[pts.length - 1] = true
  const stack = [[0, pts.length - 1]]
  while (stack.length) {
    const [s, e] = stack.pop()
    let maxD = 0, idx = -1
    for (let i = s + 1; i < e; i++) {
      const d = segDist(pts[i], pts[s], pts[e])
      if (d > maxD) { maxD = d; idx = i }
    }
    if (maxD > eps && idx > 0) { keep[idx] = true; stack.push([s, idx], [idx, e]) }
  }
  return pts.filter((_, i) => keep[i])
}

// A closed ring ready to store: simplified, rounded, no repeated closing point, and never
// more corners than the server keeps (200) — a very long trace is simplified harder.
const MAX_CORNERS = 200
export function cleanRing(pts, eps = 0.25) {
  let out = simplify(pts, eps)
  for (let e = eps * 1.5; out.length > MAX_CORNERS && e < 50; e *= 1.5) out = simplify(pts, e)
  if (out.length > 3 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 0.3) out = out.slice(0, -1)
  return out.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100])
}

// Area-weighted centroid (the mean of the corners for a degenerate ring) — where the pin
// anchor goes when an outline is drawn first and the place is born from it.
export function centroid(pts) {
  let a = 0, cx = 0, cy = 0
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length]
    const f = x0 * y1 - x1 * y0
    a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f
  }
  if (Math.abs(a) < 1e-6) {
    const n = pts.length
    return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n]
  }
  a *= 0.5
  return [Math.round((cx / (6 * a)) * 100) / 100, Math.round((cy / (6 * a)) * 100) / 100]
}

export const polyPoints = (pts) => pts.map(([x, y]) => `${x},${y}`).join(' ')
