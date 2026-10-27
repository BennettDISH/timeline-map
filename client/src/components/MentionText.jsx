import React from 'react'
import { splitMentions } from '../utils/mentions'

// Read text with its @-mentions (utils/mentions.js) drawn as buttons that go to the entry: the
// DM's reader and the Player View's sheet, where the server has already turned a mention of
// anything players may not know into its plain name. With no onGo they are names.
export default function MentionText({ text, onGo, label }) {
  return splitMentions(text).map((p, i) => (typeof p === 'string' ? <React.Fragment key={i}>{p}</React.Fragment>
    : onGo
      ? <button key={i} type="button" className="mention" title={label ? label(p) : `Go to “${p.name}”`} onClick={() => onGo(p.id, p.t)}>{p.name}</button>
      : <span key={i} className="mention">{p.name}</span>))
}
