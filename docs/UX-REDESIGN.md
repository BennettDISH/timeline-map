# timeline-map — Ground-Up Redesign Plan (vision locked)

A plan, not changes. Built from a multi-agent UX deep dive, a study of comparable tools (World Anvil,
LegendKeeper, Kanka, Foundry VTT, Campfire, Obsidian+Leaflet, Aeon Timeline, kepler.gl, tldraw/Figma),
and the owner's own concrete vision. This version reflects the decided direction.

> **De-risking fact:** the current data is disposable test data, and this is a push-freely dev site. The
> scariest part of a ground-up rethink — migrating the messy schema — mostly evaporates: we build the
> clean model and reseed a sample world instead of back-filling. The ambitious version is affordable here.

---

## The vision (what we're building)

**A recursively zoomable world you scrub through time — and can share a filtered slice of with players.**

Upload a world map. Cover it with nodes: cool things that happened, lore, places, people. Some nodes
*open* — click a city node and you're inside the city map; a house node opens the house; a room; a chest
that holds an inventory; even "inside an NPC's mind." **There is no floor to the nesting.** Any node can
also *reference* any other ("comes from the city of X" → jump to X). That builds a complete static
snapshot of a kingdom.

**The timeline brings it to life.** One world clock, at whatever granularity the DM wants (day, session,
even ten minutes). The NPC is in the tavern on day 1; slide to day 2 and they're dead in the dirt. A DM
preps a whole series of events; players walk into the tavern and the DM knows exactly who's there. Add the
players to the timeline and — if the DM is meticulous — a later party can revisit the same world and meet
their past selves.

**DM view vs Player view.** The DM authors the full truth, including secrets and the planned future. A
player sees only what's been revealed, and only up to the current moment — no spoilers.

**Friction is the whole point.** This much detail is expensive to capture, which is exactly why it's an
app and not paper. Every flow is optimized so a DM can build faster than they could scribble notes.

### The three primitives (everything serves these)
- **Nest** — any node can contain its own Map; opening it *is* zooming in. Unbounded depth.
- **Link** — any node can reference/point to any other, independent of where it sits.
- **Time** — one clock filters the whole nested graph: what exists *now*.
- (+ **Reveal** — a visibility layer: DM-only vs player-visible, gated by time.)

### Decisions locked
1. **Entity vs. placement: yes.** A node exists once in the world; it can be *placed* and *referenced* in
   many spaces and times without copying. (This is what lets one NPC be in the tavern, be linked from a
   lore note, and be revisited later.)
2. **The rigid type "zoo" is gone.** A node is defined by three capabilities (can it open? what does it
   link to? when does it exist?) plus a lightweight **Category** (icon + color + legend: Place, Person,
   Item, Lore, Event…), user-extensible. **Every node is the same primitive** — behavior comes from *facets* you add (an interior,
   a lifespan, links, an image), not from a type; Category is a pure label you set or swap **after**
   placement in one click, with no consequences. Info/NPC/Item stop being separate behaviors.
3. **A node's interior can be a Map *or* a List** (a chest → inventory list; a mind → notes), switchable
   per node.
4. **Time filters *presence* first** (nodes appear/disappear by their lifespan). Versioning a node's
   *content* over time (the tavern described differently in war vs peace) is a planned **advanced** layer,
   not v1.
5. **One canonical timeline per world.** Replaying just adds later events; "past selves" are earlier points.
   (Branching campaigns are a possible future axis, not now.)
6. **v1 optimizes for build-fast-use-live:** ruthless authoring speed first, live at-the-table lookup and
   scrubbing riding along.

---

## The model (plain vocabulary)

- **World** — your whole setting. Owns one Timeline and one asset pool. Has a top-level Map.
- **Node** — anything you place: a place, person, item, event, or note. The atomic thing. A node has:
  content (title + body), a **Category** (icon/color), an optional **interior** (its own Map or List — this
  is what makes it *openable*), and a **visibility** (DM-only vs shared).
- **Map** — a canvas of placed nodes with an optional backdrop image. A node's interior, or the World's
  top map. Viewable as a spatial **Map** or a plain **List** when position doesn't matter.
- **Placement** — a node sits on a parent Map at a position, with a **lifespan** (when it exists) and a
  visibility. A node can have several placements (tavern on day 1, elsewhere later) — same node, no copies.
- **Link** — a reference between two nodes (bidirectional, so both ends know). A **Portal** link is one you
  click to travel; a plain link is a mention. Links can carry a time context ("as of year X").
- **Timeline** — the one world clock; scrubbing filters what's present. "Always present" = an unbounded
  lifespan (the default).
- **Reveal** — DM-only vs player-visible, per node/placement. The **Player View** is a read-only lens that
  shows only shared content, only up to the current shared time.

> **Data-model note (for the build):** this is the classic entity + placement + edge graph. Kill
> `tooltip_text`; promote category/geometry/style to real columns; a `nodes` table (identity+content+
> interior_map_id+visibility), a `placements` table (node_id, map_id, x, y, start, end, visibility), a
> `links` edges table (from, to, kind, time_context), and `maps` (backdrop image, viewed-as). One
> coordinate system. Because data is disposable, this is a fresh schema, not a migration.

---

## Why the current app fights this vision (condensed diagnosis)

- **No app frame; the world is invisible.** 15 flat routes, each with its own header and a different
  "back" link; the active world hides in `localStorage`, not the URL. You can never tell *where am I* —
  fatal for an app whose whole point is *depth of place*.
- **Nesting exists only by accident.** Maps can nest (`parent_map_id`) and nodes can "link," but there's
  no map tree, no breadcrumb, no "open this node," no "up." The signature zoom-in is undiscoverable.
- **A node is three things in a lie.** Identity + map-object + content, with type/geometry/style/links all
  crammed into a column named `tooltip_text`. Hence: can't pick a type at creation, Info/NPC/Item are
  identical, type vanishes when you add an image, "Map Link" is dead, the map never shows its own image.
- **Split-brain save, broken-on-first-touch timeline, three image UIs, no onboarding.** (Full inventory in
  git history / the earlier audit.)

None of this is fatal — but it's all skin over the schema, so the redesign is mostly re-architecting the
*model* and wrapping it in *one coherent shell*.

---

## System design (how each primitive becomes UX)

### 1. Nesting & navigation — the headline
- **One persistent shell**, world in the URL (`/w/:worldId/...`). Left rail is a **nesting tree** (World ▸
  Kingdom ▸ City ▸ House ▸ Room…) that mirrors the real containment; a **breadcrumb** across the top shows
  your depth with one-click "up."
- **Open = zoom in.** Double-click a node (or hit Enter) to enter its interior. If it has none yet, opening
  *creates* it instantly and drops you inside — descending is one gesture, never a separate "add sub-map"
  chore. **Unbounded depth.** A back/up control and the breadcrumb mean you never get lost.
- Log in → land in your last map (0–1 clicks), not a dashboard crawl.

### 2. Nodes, categories & the palette
- **One add gesture, categorize after.** Drop a node with a single "+ Add" (or double-click empty space);
  it starts as a neutral Note. Set or change its **Category** anytime from the inspector in one click — it's
  just a label, never a behavioral fork, so relabeling is free. (The *current* app's pain wasn't post-hoc
  typing — it was that the reclassify was buried, the types secretly forked behavior, and the type vanished
  when you added an image. We fix those, not the timing.)
- **One icon+color+label vocabulary** drives the category picker, the pin, and an **always-on legend that doubles
  as a show/hide filter.** Category survives adding an image (a colored ring persists) and reaches the
  Player View. This is the direct fix for "hard to know what does what."
- **Interior = Map or List**, toggled per node. A chest opens to an inventory List; a city opens to a Map.

### 3. Links & references — build the web while you write
- **@-mention in any body text** to link another node; if it doesn't exist yet, the mention *creates a stub*
  ("comes from the city of X" makes X on the spot, flesh it out later). Zero context switch — a huge
  friction win.
- Links are **bidirectional** with **auto-backlinks** ("mentioned by / connected to / appears on") on every
  node. **Portal** links get a distinct look and click-to-travel. Links can draw as edges on the map.

### 4. Time — one clock, visible on first touch
- Every placement has a **lifespan**; "always present" (unbounded) is the default, so enabling time *does
  something visible* immediately. One switch: **Filter by time / Show all** — no more three colliding toggles.
- The scrubber is a real timeline: **histogram of when things exist**, era labels, tick marks; nodes
  **fade/grey** rather than vanish so spatial context holds. A real **Play** button animates forward.
  Config (unit/range/eras) lives inline on the bar.
- **One-click time-stamping:** "this exists from the current moment" / "this happens now" sets a lifespan
  to the scrub position — fast capture during prep or live play.
- Playhead is an explicit lens ("Viewing the world as of {day 2}"), ephemeral per session, with a separate
  deliberate "set the canon moment."

### 5. DM view vs Player view — the reveal layer
- Every node/placement carries a **visibility** (DM-only / shared). Toggle it in one click ("reveal").
- **Player View** = a read-only lens (eventually a shareable link) that shows only shared content and only
  up to the current shared time — no future spoilers, no secret nodes. The DM authors the whole truth in
  one place and controls what leaks.
- (Advanced, later: per-fact visibility and content that changes over time.)

### 6. The canvas & editing — one gesture, one truth
- **One Inspector** replaces the InfoPanel/NodeEditor split: select → read-only, **Edit** → editable in
  place, common fields first + progressive disclosure. No hidden global View/Edit mode, no dual layouts.
- **Autosave + Undo.** Everything commits the same way; a small "Saved ✓" status; no far-away Save All, no
  silent loss on navigate-away.
- **Fit to content**, zoom +/–/slider, trackpad/pinch. Selecting anything (tree, search, a link) frames and
  highlights it on the map.

### 7. Assets — the map shows its own image
- **Backdrop is a first-class Map property** (wire `maps.image_id`), rendered on the canvas and as the tree
  thumbnail. Retire "Background Map" as a node type.
- **One asset surface** everywhere (library == inline picker: same search, no 50-cap). **Upload at the point
  of need** with a visible destination. Usage shown before delete.

### 8. Onboarding & the friction budget (the north star)
Because capturing this density is the cost, v1 lives or dies on these:
- **Descend with one key**, create-interior-on-open, **@-mention-to-create**, inline quick-title, **autosave**.
- **Duplicate / templates** (clone an NPC or a house; category starter fields instead of a blank box).
- **Global search + jump**; keyboard-driven placement; new nodes inherit the current context.
- **One-click reveal** and **one-click time-stamp**.
- First run: separate operator setup from user onboarding; a **create-world wizard** (name → backdrop →
  land on a real map) with a **clonable sample world** (a nested city, a few linked people, a working
  timeline, a revealed-vs-secret example) so the whole idea lands in under a minute; a **live state-aware
  checklist**.

---

## Roadmap (the list), sequenced by value ÷ risk

Data is disposable, so "migration" ≈ "new schema + reseed a sample world."

### Phase 0 — Shell & IA  *(pure UI; wraps existing pages; immediate "where am I" win)*
- [ ] Persistent shell; world in the URL (`/w/:worldId/...`)
- [ ] Left **nesting tree** + breadcrumb (with one-click "up") + world switcher + global search + account menu
- [ ] Land in last map on login; one canonical route per screen; real 404; remove dead routes/cards/dead-ends

### Phase 1 — The nested canvas  *(the headline interaction)*
- [ ] Map renders its own backdrop; real thumbnails
- [ ] **Open a node → enter its interior; create-on-open; unbounded depth; back/up**
- [ ] Interior as **Map or List** toggle
- [ ] "+ Add node" (one gesture) + one-click category swap in the inspector + always-on legend/filter (shared icon+color vocabulary; category survives images)
- [ ] One Inspector; fit-to-content + zoom controls; selection frames on map

### Phase 2 — Model & save  *(the clean schema — cheap, disposable data)*
- [ ] New schema: nodes + placements + links + maps; kill `tooltip_text`; one coordinate system
- [ ] **Entity/placement split** (one node, many placements/references, no copies)
- [ ] Autosave + Undo (kill split-brain save)
- [ ] Links as first-class bidirectional edges; **@-mention-to-link/create**; portals click-to-travel; backlinks

### Phase 3 — Time
- [ ] Lifespans (unbounded default); one "Filter by time / Show all" switch
- [ ] Histogram + era labels + fade-not-vanish + real Play + inline config
- [ ] One-click time-stamp; playhead-as-lens vs "set canon moment"

### Phase 4 — Reveal (DM vs Player)
- [ ] Per-node/placement visibility; one-click reveal
- [ ] Player View lens (shared-only, up-to-now); later: shareable link

### Phase 5 — Assets, onboarding & friction polish
- [ ] Unified assets + upload-at-point-of-need + usage-before-delete
- [ ] Create-world wizard + clonable sample world + live checklist; separate operator setup
- [ ] Duplicate/templates; keyboard placement; the friction-budget items above

### Later / advanced
- [ ] Content that changes over time (versioned facts) · per-fact visibility · branching campaigns · zones/regions

---

## Anti-patterns to avoid
Icon-soup pins with no legend · a *buried or behavioral* reclassify (one-click, non-behavioral re-categorizing is good) · sticky invisible modes · panels that
occlude the canvas · time-states saved as duplicate maps · "delete" that's ambiguous between "remove from
this map" and "destroy the node" (now that nodes are shared) · content trapped in the map instead of
reachable from a list/search/URL.
