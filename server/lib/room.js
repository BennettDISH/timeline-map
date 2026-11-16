// How much one world holds. Every path that adds to a world counts against these: the editor's
// routes (atlas.js), the Archive's folders (imageFolders.js), a player's marker (share.js), the
// Forge's batches and ✦ Paint (forge/contract.js, forge.js) and an undo (atlas.js). A copy carries
// a world that already fits. From NEAR of the most the DM is told (the world payload's `room`, and
// the reply to an add that leaves the world that full); at the most an add is refused with one
// sentence, a 400. Images are not counted here: the day's upload allowance bounds them (spend.js).
//
// The counts are read before the add, so two adds racing for the last place may both land: a cap
// is a bound on what one world can grow to, not an exact count.
const KINDS = {
  nodes: { max: 5000, many: 'entries', sql: 'SELECT COUNT(*) FROM nodes WHERE world_id=$1' },
  maps: { max: 1000, many: 'maps', sql: 'SELECT COUNT(*) FROM maps WHERE world_id=$1' },
  placements: { max: 10000, many: 'pins', sql: 'SELECT COUNT(*) FROM placements p JOIN maps m ON m.id = p.map_id WHERE m.world_id=$1' },
  links: { max: 10000, many: 'threads', sql: 'SELECT COUNT(*) FROM links WHERE world_id=$1' },
  facts: { max: 5000, many: 'period texts', sql: 'SELECT COUNT(*) FROM node_facts f JOIN nodes n ON n.id = f.node_id WHERE n.world_id=$1' },
  eras: { max: 500, many: 'eras', sql: 'SELECT COUNT(*) FROM eras WHERE world_id=$1' },
  folders: { max: 500, many: 'folders', sql: 'SELECT COUNT(*) FROM image_folders WHERE world_id=$1' },
  backdrops: { max: 2000, many: 'period backdrops', sql: 'SELECT COUNT(*) FROM map_backdrops b JOIN maps m ON m.id = b.map_id WHERE m.world_id=$1' },
};
const NEAR = 0.8; // the share of the most from which the DM hears how full a world is

const fmt = (n) => Number(n).toLocaleString('en-US');
const fullText = (kind) => `This world holds ${fmt(KINDS[kind].max)} ${KINDS[kind].many}, the most a world can — delete some to make room`;

// { kind: count } for the kinds asked (all by default), in one query
async function counts(db, worldId, kinds = Object.keys(KINDS)) {
  const sql = `SELECT ${kinds.map((k) => `(${KINDS[k].sql})::int AS ${k}`).join(', ')}`;
  return (await db.query(sql, [worldId])).rows[0];
}

// The fullest kind at NEAR or past it, as the client reads it: { what, count, max }, or null.
function nearest(have) {
  let best = null;
  for (const [kind, count] of Object.entries(have || {})) {
    const k = KINDS[kind];
    if (!k || count < k.max * NEAR) continue;
    const share = count / k.max;
    if (!best || share > best.share) best = { share, what: k.many, count, max: k.max };
  }
  return best && { what: best.what, count: best.count, max: best.max };
}

// Before an add of `wants` ({ nodes: 1, placements: 1 }): { refused } with the sentence when any
// kind would pass its most, else { near } — what the reply says once the add has landed (null
// while the world is under NEAR of every kind it touched). Nothing is counted for a kind of 0.
async function check(db, worldId, wants) {
  const kinds = Object.keys(wants).filter((k) => wants[k] > 0);
  if (!kinds.length) return { refused: null, near: null };
  const have = await counts(db, worldId, kinds);
  for (const k of kinds) if (have[k] + wants[k] > KINDS[k].max) return { refused: fullText(k), near: null };
  return { refused: null, near: nearest(Object.fromEntries(kinds.map((k) => [k, have[k] + wants[k]]))) };
}

// After a restore inside its transaction (an undo): the sentence for the first kind it took past
// its most, or null. `before` is counts() from the start of the restore: a kind that did not grow
// never refuses it, so a world already past a most from before the caps can still undo.
async function over(db, worldId, before) {
  const have = await counts(db, worldId);
  const k = Object.keys(KINDS).find((kind) => have[kind] > KINDS[kind].max && have[kind] > before[kind]);
  return k ? fullText(k) : null;
}

// What the world payload sends: the fullest kind from NEAR on, or null
const room = async (db, worldId) => nearest(await counts(db, worldId));

module.exports = { KINDS, NEAR, check, over, room, counts, nearest, fullText };
