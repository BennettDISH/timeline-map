// @-mentions in an entry's text: `@[Name](node:12)`, or `@[Name](node:12@37)` with the moment
// on the clock it was written at (the DM's lens then), which "go there" moves the lens to. The
// client writes and reads them (client/src/utils/mentions.js keeps the same pattern); the server
// only rewrites them where text leaves for someone else: players and the painter.

const MENTION = /@\[([^\]\n]{1,255})\]\(node:(\d{1,10})(?:@(-?\d{1,10}))?\)/g;

// every entry named, in order, once each
function mentionIds(text) {
  const out = [];
  for (const m of String(text || '').matchAll(MENTION)) {
    const id = Number(m[2]);
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

// the names alone: what an image prompt reads
const plainMentions = (text) => (text == null ? text : String(text).replace(MENTION, (_, name) => name));

// What players read: a mention of an entry they may know exists stays a mention (its moment
// dropped: the DM's lens is the DM's); any other is its name as plain text, so neither an id
// nor a moment of something hidden leaves the server.
const mentionsForPlayers = (text, known) => (text == null ? text
  : String(text).replace(MENTION, (_, name, id) => (known.has(Number(id)) ? `@[${name}](node:${Number(id)})` : name)));

module.exports = { MENTION, mentionIds, plainMentions, mentionsForPlayers };
