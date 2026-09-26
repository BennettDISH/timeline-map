// What an image is used for, in words — shared by the Archive (tiles, the lightbox, the
// delete confirm) and the workspace's picker, so every place counts the same four uses:
// a map's base art, a timed period's art, a node's art, the Forge's style anchor.
export const usesOf = (im) => (im?.usage
  ? (im.usage.maps || 0) + (im.usage.nodes || 0) + (im.usage.backdrops || 0) + (im.usage.anchor || 0)
  : 0)
const n = (c, w) => `${c} ${w}${c === 1 ? '' : 's'}`
export const describeUse = (im) => {
  const u = im?.usage
  if (!u || !usesOf(im)) return 'Not placed anywhere yet'
  const parts = []
  if (u.maps) parts.push(`base art of ${n(u.maps, 'map')}`)
  if (u.backdrops) parts.push(`art for ${n(u.backdrops, 'timed period')}`)
  if (u.nodes) parts.push(`art of ${n(u.nodes, 'node')}`)
  if (u.anchor) parts.push("the Forge's style anchor")
  return `In use — ${parts.join(' · ')}`
}
export const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp'
