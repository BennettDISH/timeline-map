// The DM's map payload sends a node's long text once, on its first placement (the Party is
// placed once per footstep): copy it onto the node's other placements, so every reader of
// p.node sees the whole node. A key the server sent is never overwritten.
export const NODE_TEXT = ['body', 'dmNote', 'voiceLine', 'voiceStyle']

export function withNodeText(d) {
  const first = new Map()
  for (const p of d?.placements || []) {
    const had = first.get(p.node.id)
    if (!had) first.set(p.node.id, p.node)
    else for (const k of NODE_TEXT) if (!(k in p.node)) p.node[k] = had[k]
  }
  return d
}
