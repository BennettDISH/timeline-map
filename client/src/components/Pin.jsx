import React from 'react'
import { cat } from '../utils/categories'

// The one pin body, drawn the same for the DM and for players: the node's own art (an image
// pin, frameless) or its category chip. The page around it owns the wrapper's classes,
// handlers and badges — pinClass gives the class fragments both pages share.
export function PinBody({ node }) {
  return node.pin === 'image' && node.imageUrl ? (
    <>
      <img className="iart" src={node.imageUrl} alt="" draggable={false}
        style={{ width: node.pinSize || 64, height: node.pinSize || 64, objectFit: 'contain' }} />
      <span className="ilbl">{node.title}</span>
    </>
  ) : (
    <>
      <span className="ic" style={{ background: cat(node.category).c }}>{cat(node.category).i}</span>
      <span className="lbl">{node.title}</span>
    </>
  )
}

// image pin · a player's marker · selected · has an interior · the party — plus the page's own
export const pinClass = (p, { selected = false, marker = false, extra = '' } = {}) => [
  'pin',
  p.node.pin === 'image' && p.node.imageUrl ? 'ipin' : '',
  marker ? 'pmark' : '',
  selected ? 'sel' : '',
  p.node.hasInterior ? 'open2' : '',
  p.node.category === 'party' ? 'party' : '',
  extra,
].filter(Boolean).join(' ')
