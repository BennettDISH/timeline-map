// The world's mind: one continuing conversation per world, grounded every turn in a fresh
// digest of what actually exists (the DB is the ground truth, not the chat history), plus
// the lore it has chosen to remember. It answers in plain words and, when asked to create,
// proposes a batch through the contract. It never writes outside the contract.

const pool = require('../config/database');
const { generateJSON } = require('./gemini');
const { validateBatch, applyBatch, CAPS } = require('./contract');

const rulebook = (unit) => `You are the mind of a fantasy world inside the Atlas — a recursively zoomable map scrubbed through time. You grow the world when its DM asks, keep its stories coherent, and remember what matters. You are a collaborator with taste: concrete, evocative, never generic.

HOW THE WORLD WORKS
- The world is a graph of NODES (a place, person, item, note, lore, or event — those are the only categories, plus exactly one 'party' node). A node has one identity and no copies.
- THE PARTY: the node of category 'party' is the players themselves — one per world, following them with a placement and a fact per footstep. NEVER create another; to record where they went or what they saw, enrich and place the existing one.
- A node appears on a MAP via a PLACEMENT: x/y as % of the map plane (0,0 = top-left), plus an optional lifespan [start,end] in integer ${unit} on the ONE world clock (null = always). The same node may be placed on several maps.
- A map is either the world root (already exists) or the INTERIOR of a node — zooming into that node. view 'map' is spatial; 'list' is an inventory/notes list where x/y are ignored.
- LINKS are bidirectional edges between nodes, optionally labeled.
- ERAS are named periods of history. FACTS are timed body overrides on a node (the same tavern reads differently in different centuries). Timed BACKDROPS swap a map's art from a start ${unit} onward.
- Everything you create is born DM-only (hidden from players), and nothing a batch does reaches players until the DM keeps it. The digest marks visibility: a node with no "vis" is REVEALED to players; vis "dm" is hidden; vis "player" is a PLAYER'S OWN MARKER — their note, not canon: never treat its text as world truth, never build on it, never ask to reveal it. Ask to reveal only vis "dm" nodes; what is already revealed needs no ask.

READING THE DM — there are no modes or buttons; decide from the words and the context what is wanted:
- A question, a plan, a "what if" → say only. Answer from the digest, the bible, the FOCUS NODE, and your lore — name names.
- "Paint / portrait / art / backdrop" → a batch holding the painting(s): for the FOCUS NODE, images + enrich.image on it; for the CURRENT MAP, images + backdrops with start null. Say what you painted.
- "Build / fill / add / invent / more of…" → a creation batch sized to the CREATION SIZE PREFERENCE.
- A RECAP — the DM narrating what happened at the table — is the most important act you perform: (1) lore_append a dated summary beginning "Session (TODAY): …" — what changed and where the threads now point; (2) enrich the nodes involved with dm_note_append lines of what they saw, did, or learned, and stance where loyalties moved; (3) enrich_maps the spaces where scenes happened; (4) asks: reveal for people and places the party met, move for anyone who moved, edit for anything now untrue; (5) new nodes only for genuinely new things. Then say plainly what you logged and what you are asking permission for.
- Genuinely ambiguous between a big creation and a small one? Ask ONE short clarifying question in say instead of guessing large.

YOUR REPLY — always a single JSON object:
{
  "say": "plain words to the DM — short, warm, concrete (always required)",
  "lore_append": "optional: durable memory worth keeping forever (threads, secrets, intentions, session summaries)",
  "art_style": "ONLY if CURRENT ART STYLE below is empty: define this world's visual identity in 2-3 sentences (palette, technique, mood). It becomes permanent.",
  "batch": { ... only when there is something to create, change, or paint ... }
}

THE BATCH (everything optional, arrays may be empty):
{
  "summary": "one line describing the creation",
  "images": [{ "key": "img1", "name": "display name", "kind": "backdrop"|"art", "prompt": "what to paint — content and composition only, NEVER style (the world's fixed art style is applied for you)" }],
  "nodes": [{ "key": "n1", "title": "", "body": "2-4 evocative sentences — the PUBLIC face only", "dm_note": "the secret half: twists, hidden truths, plans — DM's eyes only", "category": "place|person|item|note|lore|event", "image": "img1", "pin": "chip"|"image", "pin_size": 64,
              "placements": [{ "map": "m1 or an existing map's numeric id", "x": 50, "y": 50, "start": null, "end": null }],
              "facts": [{ "body": "timed override text", "start": 200, "end": 400 }] }],
  "maps": [{ "key": "m1", "title": "", "view": "map"|"list", "owner": "n1 or an existing node's numeric id — the node this map is the interior of", "backdrop": "img1", "focus_start": null, "focus_end": null }],
  "links": [{ "from": "n1 or numeric id", "to": "numeric id or key", "label": "why they connect" }],
  "eras": [{ "name": "", "start": 0, "end": 100 }],
  "backdrops": [{ "map": "m1 or numeric id", "image": "img2", "start": 300, "end": null }] — start null SETS the map's standing backdrop; a numeric start begins a timed override at that ${unit},
  "enrich": [{ "node": 97, "body": "fills the node's body ONLY if it is empty — to replace written text, use an edit ask",
               "dm_note": "fills the node's DM note only if empty",
               "dm_note_append": "ADDS a line to the node's DM notes (what happened, what they learned) — always allowed, never overwrites",
               "stance": "friend | neutral | foe — how they now stand toward the party (DM-only)",
               "image": "img1 — attach a painting from THIS batch's images to this existing node (bare nodes become image pins)",
               "facts": [{ "body": "", "start": 200, "end": 400 }],
               "place": [{ "map": 52, "x": 40, "y": 55, "start": null, "end": null }] }],
  "enrich_maps": [{ "map": 72, "dm_note_append": "ADDS a line to a map's DM running notes (what happened in this space)" }],
  "asks": [{ "op": "move", "node": 141, "map": 69, "x": 40, "y": 62, "to_map": null },
           { "op": "edit", "node": 141, "title": null, "body": "the rewrite", "category": null, "dm_note": "or a full rewrite of its notes" },
           { "op": "drop_era", "era": 23 },
           { "op": "reveal", "node": 153 }]
}

PRIVILEGED ACTS — "asks". Moving, rewriting, or deleting what already exists touches the DM's own work, so it never happens directly: asks take effect ONLY when the DM clicks Allow on the batch card. Keep them few and purposeful, and explain them in say.
- move: reposition an existing node's pin on map; to_map (a map's numeric id) carries it onto another map entirely — this is how a town's contents move into a newly built interior (new maps land instantly, so ask moves onto them by describing the plan in say and sending the moves in a FOLLOW-UP turn once the map's id is in the digest).
- edit: overwrite an existing node's title, body, category, or DM notes (null = leave that alone). This replaces the DM's words — ask only with clear cause.
- drop_era: remove an era.
- reveal: make a hidden node visible to players (its pins too). The party met them, saw it, learned of it — ask, and the DM decides.

RULES OF CRAFT
- Existing things are referenced by their numeric id from the WORLD DIGEST; new things by your own string keys. Reuse existing people and places via links and placements — never duplicate what exists.
- LIFESPANS: null start/end means "always". NEVER write {"start":0,"end":0} to mean forever — that is a single ${unit} and the thing vanishes for the rest of history. Give something an end only when history actually ends it.
- SPACING: pins draw at map scale — keep distinct nodes at least 5 apart in x/y. Never stack a person on top of their building; set them beside it, or save them for its interior.
- Caps per batch: ${CAPS.images} images, ${CAPS.nodes} nodes, ${CAPS.maps} maps, ${CAPS.links} links, ${CAPS.eras} eras. Prefer a tight, finished creation over a sprawling half-made one, sized to the CREATION SIZE PREFERENCE.
- Images cost real money (~4 cents each) and are capped at ${CAPS.images} per turn. Paint what is asked for, and what earns it: backdrops, key faces. Most nodes need no image.
- "backdrop" prompts: wide top-down painted terrain or floorplan, NO text or labels in the image. "art" prompts: one subject, token-like. Describe content, not style.
- pin "image" draws the node's art directly on the map (good for characters and landmarks with art); "chip" is the default lozenge.
- To give an EXISTING node an interior: one map with owner = that node's numeric id, then place new nodes onto it by its key.
- To FILL OUT what exists, use "enrich": give an existing node facts across the eras, place it on more maps, fill its empty body. To PAINT an existing node, put the painting in images and reference it from enrich.image — never leave finished art floating unattached in the gallery. To fill out a whole MAP, combine both — enrich the nodes already on it and add new ones placed by its numeric id. Always prefer enriching an existing thing over inventing a duplicate of it.
- A node that HAS an interior map keeps its contents INSIDE: when asked to fill out such a node or its space, place the new people and things on the interior map's numeric id (the digest's interiorMap field), not around the node outside.
- When a CAMPAIGN BIBLE is present it is canon: use its names, places, and history exactly; invent only in its gaps, and in its voice. Asked to "build from the bible", check the digest first and never rebuild what already exists.
- SECRETS HAVE THEIR OWN CHANNEL: a node's body, facts, and any image are the PUBLIC face — exactly what players see the moment the DM reveals it. Every twist, hidden allegiance, trap, or protected truth goes in dm_note and NOWHERE else. A villain's body reads as their cover story; their dm_note holds the truth.
- IMAGES ARE PUBLIC TOO: never paint a secret. Prompt the surface — the tavern's crowd, not the trapdoor beneath it; the blind shell-gatherer, not what she guards. If a place's secret is visual, paint the innocent version.
- Bodies are read at the table: 2-4 sentences, specific and sensory. No filler, no "mysterious stranger" clichés.
- Weave into what exists: match the world's tone, connect to its people, respect its timeline (${unit} are integers within the digest's range).
- If the digest shows timeline.enabled=false, the world runs WITHOUT time: create no eras, facts, or lifespans — suggest enabling the timeline instead if the story needs history.
- If the DM is only asking or planning, reply with say alone — no batch.`;

async function ensureMind(worldId) {
  await pool.query('INSERT INTO world_minds (world_id) VALUES ($1) ON CONFLICT (world_id) DO NOTHING', [worldId]);
  return (await pool.query('SELECT * FROM world_minds WHERE world_id=$1', [worldId])).rows[0];
}

// A compact, current snapshot of the world — regenerated every turn so the mind is always
// grounded in what is actually there (including hand-made edits it never saw). When a long
// campaign outgrows the caps, the newest things and the current map's survive; what fell
// off is counted, so the mind knows the list is not the world. Each node carries its
// visibility unless it is simply revealed; the Party is one entry, not a footstep per row.
async function digest(worldId, context = {}) {
  const w = (await pool.query('SELECT * FROM worlds WHERE id=$1', [worldId])).rows[0];
  const mapId = Number.isInteger(context?.mapId) ? context.mapId : null;
  const eras = (await pool.query('SELECT id, name, start_time, end_time FROM eras WHERE world_id=$1 ORDER BY start_time', [worldId])).rows;
  const maps = (await pool.query('SELECT id, title, owner_node_id, view FROM maps WHERE world_id=$1 AND is_active=true ORDER BY id', [worldId])).rows;
  const nodes = (await pool.query(
    `SELECT n.id, n.title, n.category, n.visibility, n.author, n.interior_map_id, LEFT(COALESCE(n.body,''), 160) AS body,
            LEFT(COALESCE(n.dm_note,''), 160) AS secret,
            ($2::int IS NOT NULL AND EXISTS (SELECT 1 FROM placements p WHERE p.node_id=n.id AND p.map_id=$2::int)) AS here
     FROM nodes n WHERE n.world_id=$1
     ORDER BY here DESC, (n.category = 'party') DESC, n.updated_at DESC NULLS LAST, n.id DESC LIMIT 400`, [worldId, mapId])).rows;
  const nodeCount = Number((await pool.query('SELECT COUNT(*) FROM nodes WHERE world_id=$1', [worldId])).rows[0].count);
  const links = (await pool.query('SELECT from_node_id AS f, to_node_id AS t, label FROM links WHERE world_id=$1 ORDER BY id DESC LIMIT 300', [worldId])).rows;
  const linkCount = Number((await pool.query('SELECT COUNT(*) FROM links WHERE world_id=$1', [worldId])).rows[0].count);
  const placements = (await pool.query(
    `SELECT p.node_id AS n, p.map_id AS m, p.x, p.y, p.start_time AS s, p.end_time AS e, p.visibility AS v
     FROM placements p JOIN maps mp ON p.map_id=mp.id JOIN nodes n ON n.id=p.node_id
     WHERE mp.world_id=$1 AND mp.is_active=true AND n.category <> 'party'
     ORDER BY (p.map_id = $2::int) DESC NULLS LAST, p.id DESC LIMIT 600`, [worldId, mapId])).rows;
  const placementCount = Number((await pool.query(
    `SELECT COUNT(*) FROM placements p JOIN maps mp ON p.map_id=mp.id JOIN nodes n ON n.id=p.node_id
     WHERE mp.world_id=$1 AND mp.is_active=true AND n.category <> 'party'`, [worldId])).rows[0].count);
  // the Party: where they stand at canon, and how many footsteps they have taken
  let party = null;
  const pn = (await pool.query(`SELECT id, title FROM nodes WHERE world_id=$1 AND category='party' ORDER BY id LIMIT 1`, [worldId])).rows[0];
  if (pn) {
    const steps = (await pool.query(
      `SELECT p.map_id AS m, p.x, p.y, p.start_time AS s, p.end_time AS e FROM placements p JOIN maps mp ON mp.id=p.map_id
       WHERE p.node_id=$1 AND mp.is_active=true ORDER BY p.start_time DESC NULLS LAST, p.id DESC`, [pn.id])).rows;
    const canon = w.timeline_current_time;
    const live = steps.find((p) => canon == null || ((p.s == null || p.s <= canon) && (p.e == null || p.e >= canon))) || steps[0] || null;
    party = { id: pn.id, title: pn.title, footsteps: steps.length,
      live: live ? { map: live.m, x: Number(live.x), y: Number(live.y), start: live.s, end: live.e } : null };
  }
  return {
    world: { name: w.name, description: w.description || '',
             timeline: { enabled: w.timeline_enabled, min: w.timeline_min_time, max: w.timeline_max_time, canon: w.timeline_current_time, unit: w.timeline_time_unit },
             rootMapId: w.root_map_id },
    eras: eras.map((e) => ({ id: e.id, name: e.name, start: e.start_time, end: e.end_time })),
    maps: maps.map((m) => ({ id: m.id, title: m.title, interiorOf: m.owner_node_id, view: m.view })),
    nodes: nodes.map((n) => ({ id: n.id, title: n.title, cat: n.category,
      ...(n.visibility !== 'shared' ? { vis: n.visibility } : {}),
      ...(n.visibility === 'player' && n.author ? { author: n.author } : {}),
      body: n.body, ...(n.secret ? { secret: n.secret } : {}), interiorMap: n.interior_map_id })),
    ...(nodeCount > nodes.length ? { note: `${nodeCount - nodes.length} older nodes not shown (the newest, and everything on the current map, are)` } : {}),
    party,
    links,
    ...(linkCount > links.length ? { linksNote: `${linkCount - links.length} older links not shown` } : {}),
    placements: placements.map((p) => ({ n: p.n, m: p.m, x: Number(p.x), y: Number(p.y), s: p.s, e: p.e, ...(p.v === 'dm' ? { v: 'dm' } : {}) })),
    ...(placementCount > placements.length ? { placementsNote: `${placementCount - placements.length} placements not shown (the current map's are)` } : {}),
  };
}

// How many new nodes a "fill this out" should aim for, by the DM's gen_size setting.
const SIZES = { small: '3–6', medium: '8–14', large: '18–35' };

// One turn of the conversation: ground, ask, validate (one repair round), apply, remember.
// `context` is where the DM is standing (current map / selected node), server-verified.
async function converse({ worldId, userId, message, context }) {
  const mind = await ensureMind(worldId);
  const world = (await pool.query('SELECT timeline_min_time, timeline_max_time FROM worlds WHERE id=$1', [worldId])).rows[0];
  const tail = (await pool.query(
    'SELECT role, content FROM mind_messages WHERE world_id=$1 ORDER BY id DESC LIMIT 16', [worldId])).rows.reverse();
  const d = await digest(worldId, context);
  const unit = (d && d.timeline && d.timeline.unit) || 'years';
  const system = [
    rulebook(unit),
    `TODAY: ${new Date().toISOString().slice(0, 10)}`,
    `CREATION SIZE PREFERENCE: ${mind.gen_size || 'medium'} — when filling out a space, aim for about ${SIZES[mind.gen_size] || SIZES.medium} new nodes unless the DM says otherwise.`,
    mind.bible ? `THE CAMPAIGN BIBLE (the DM's own document — canon; stay strictly consistent with it):\n${mind.bible.slice(0, 100000)}` : '',
    mind.art_style ? `CURRENT ART STYLE (applied to every painting for you; the DM can edit it):\n${mind.art_style}` : 'CURRENT ART STYLE: empty — define one in "art_style" on your next creative reply.',
    mind.lore ? `YOUR REMEMBERED LORE (the latest 20,000 characters):\n${mind.lore.slice(-20000)}` : '',
  ].filter(Boolean).join('\n\n');

  // The DM's standing context arrives in FULL detail — "paint her" and "what does she
  // know?" must never be answered from a truncated digest line.
  let where = '';
  if (context?.mapId) {
    const m = (await pool.query('SELECT id, title, dm_note, owner_node_id FROM maps WHERE id=$1', [context.mapId])).rows[0];
    if (m) where += `\n\nCURRENT MAP #${m.id} "${m.title}"${m.owner_node_id ? ` (interior of node #${m.owner_node_id})` : ''}${m.dm_note ? `\nMap DM notes: ${m.dm_note}` : ''}`;
  }
  if (context?.nodeId) {
    const n = (await pool.query(
      'SELECT id, title, category, visibility, stance, body, dm_note, interior_map_id FROM nodes WHERE id=$1', [context.nodeId])).rows[0];
    if (n) {
      const facts = (await pool.query('SELECT body, start_time, end_time FROM node_facts WHERE node_id=$1 ORDER BY start_time', [n.id])).rows;
      const links = (await pool.query(
        `SELECT CASE WHEN l.from_node_id=$1 THEN t.title ELSE f.title END AS other, l.label
         FROM links l JOIN nodes f ON f.id=l.from_node_id JOIN nodes t ON t.id=l.to_node_id
         WHERE l.from_node_id=$1 OR l.to_node_id=$1`, [n.id])).rows;
      where += `\n\nFOCUS NODE (the DM's selection, full detail) #${n.id} "${n.title}" — ${n.category}, ${n.visibility === 'dm' ? 'hidden from players' : 'revealed'}${n.stance ? `, stance ${n.stance}` : ''}${n.interior_map_id ? `, interior map #${n.interior_map_id}` : ''}`
        + `\nPublic face: ${n.body || '(none)'}`
        + `\nDM notes: ${n.dm_note || '(none)'}`
        + (facts.length ? `\nTimed facts: ${facts.map((f) => `[${f.start_time ?? '…'}–${f.end_time ?? '…'}] ${f.body}`).join(' | ')}` : '')
        + (links.length ? `\nThreads: ${links.map((l) => `${l.other}${l.label ? ` (${l.label})` : ''}`).join(', ')}` : '');
    }
  }
  const messages = [
    ...tail.map((m) => ({ role: m.role === 'mind' ? 'model' : 'user', text: m.content })),
    { role: 'user', text: `WORLD DIGEST (current and authoritative — trust it over the chat above):\n${JSON.stringify(d)}\n\nDM SAYS: ${message}${where}` },
  ];

  // what the DM said is history the moment it is sent — a model failure must not lose it
  await pool.query('INSERT INTO mind_messages (world_id, role, content) VALUES ($1,$2,$3)', [worldId, 'user', message.slice(0, 12000)]);
  let resp = await generateJSON({ system, messages });
  let applied = null, applyError = null;

  if (resp?.batch) {
    let errs = validateBatch(resp.batch, world);
    if (errs.length) {
      // one repair round: show the mind its own reply and the exact problems
      messages.push({ role: 'model', text: JSON.stringify(resp) });
      messages.push({ role: 'user', text: `Your batch has problems — return the corrected full JSON reply:\n- ${errs.join('\n- ')}` });
      resp = await generateJSON({ system, messages });
      errs = resp?.batch ? validateBatch(resp.batch, world) : [];
    }
    if (resp?.batch && !errs.length) {
      try {
        applied = await applyBatch({ worldId, userId, batch: resp.batch, artStyle: mind.art_style });
      } catch (e) {
        console.error('forge apply failed:', e);
        applyError = e.userMessage || 'something in the proposal could not be applied — ask again'; // the raw reason is in the log
        console.error('forge apply error:', e);
      }
    } else if (errs.length) {
      applyError = `the proposal stayed malformed (${errs[0]})`;
    }
  }

  const say = typeof resp?.say === 'string' && resp.say.trim() ? resp.say.trim().slice(0, 4000) : '…';
  // the log tells the truth: a creation that failed is marked, so neither the DM nor the
  // mind (which re-reads this history) believes the work was done
  const stored = applied ? `${say}\n⚒ ${applied.summary}` : applyError ? `${say}\n⚠ Nothing was changed: ${applyError}` : say;
  await pool.query('INSERT INTO mind_messages (world_id, role, content, batch_id) VALUES ($1,$2,$3,$4)',
    [worldId, 'mind', stored, applied ? applied.batchId : null]);
  await pool.query(`DELETE FROM mind_messages WHERE world_id=$1 AND id NOT IN
    (SELECT id FROM mind_messages WHERE world_id=$1 ORDER BY id DESC LIMIT 200)`, [worldId]);

  const sets = [];
  const vals = [];
  if (!applyError && typeof resp?.lore_append === 'string' && resp.lore_append.trim()) { // a failed recap writes no memory
    // appended in SQL to the memory as it is NOW, never from the start-of-turn copy: a
    // "Save the mind" made while the turn ran, or another turn's recap, survives
    sets.push(`lore = RIGHT(BTRIM(COALESCE(lore,'') || E'\\n' || $${vals.push(resp.lore_append.trim())}, E'\\n'), 20000)`);
  }
  if (typeof resp?.art_style === 'string' && resp.art_style.trim()) {
    // only ever fills an EMPTY style, judged at write time
    sets.push(`art_style = CASE WHEN COALESCE(art_style,'')='' THEN $${vals.push(resp.art_style.trim().slice(0, 4000))} ELSE art_style END`);
  }
  if (sets.length) {
    vals.push(worldId);
    await pool.query(`UPDATE world_minds SET ${sets.join(', ')}, updated_at=CURRENT_TIMESTAMP WHERE world_id=$${vals.length}`, vals);
  }

  const digestNote = [d.note, d.linksNote, d.placementsNote].filter(Boolean).join('; ') || null;
  return { say, batch: applied, applyError, digestNote };
}

module.exports = { converse, ensureMind, digest };
