# Atlas cleanup list — 2026-09-26

A whole-app pass over fantasy-map-timeline for leftovers: what does not work, what makes it feel
like a prototype, code that goes nowhere, things written over and left behind, and places a reader
or a user gets confused. 15 lanes clicked through every control on the live site (a throwaway
account in throwaway `[audit]` worlds, since deleted); 8 lanes read the code, docs, schema and
styles. Every item then survived **two independent checks**: one re-proved the claim (re-grepped,
re-read, or re-clicked on production), the other checked it against CLAUDE.md, the docs and git
history for intent and asked whether it deserves a line at all.

## How to work this list

- Take one **work package** at a time, in the order below. Each package is its own file: a
  checklist at the top, then every item in full (where, what happens, why, fix, repro, proof).
- Before fixing an item, re-check it still reproduces — line numbers are as of commit
  `32ef89c` and the code will move as you go.
- Tick the box in the package file when an item is done and put the commit hash after it.
  IDs are stable: **B** broken · **P** product polish · **D** dead code · **O** obsolete · **C** confusing.
- CLAUDE.md is the design spec. Where an item and CLAUDE.md disagree, decide which is wrong before
  changing either, and update CLAUDE.md in the same commit when behaviour changes.
- Deleting code: re-run the item's search yourself first. A sloppy grep that deletes live code is
  the worst outcome of a cleanup.
- Build-verify with `cd client && npm run build` / `node --check <file>`; verify user-visible
  fixes on the live deploy (`e2e/` has the Playwright suites). Script paths in the evidence
  (`lanes/…`, `verify/…`) were the audit's scratch files and are not in the repo.
- [appendix.md](appendix.md) holds the judgment calls, the deliberate designs not to "fix", the
  rejected claims, what each lane covered, and the gaps no lane reached.

## Summary

| | high | medium | low | total |
|---|---:|---:|---:|---:|
| B — Broken | 15 | 47 | 27 | 89 |
| P — Product polish | 0 | 33 | 65 | 98 |
| D — Dead code | 0 | 0 | 22 | 22 |
| O — Obsolete | 0 | 2 | 23 | 25 |
| C — Confusing | 0 | 24 | 68 | 92 |
| **All** | 15 | 106 | 205 | 326 |

590 raw findings from 23 lanes; 557 survived both checks, and 231 of those were the same defect found by another lane (folded in — each item lists its other sightings), leaving 326 distinct items. 21 judgment calls and 9 deliberate designs are in the appendix; 1 claim was rejected.

## The state of it

The Atlas works for day-to-day play, but a few real breaks reach Bennett's table: the share API's node endpoint returns nodes players should not see, the timeline panel can move canon to the DM's lens or wipe the clock, and Undo and world clone lose DM notes, stance, voice and ambience. The second theme is saving: two autosaves share one timer, the DM note goes stale after a node is reselected and can overwrite the saved secret, save-on-blur fields and failed saves are lost while the chip says Saved, and every Forge recap currently fails because of a mis-nested loop. The Player View works on desktop, but it strands players on 'This link isn't active' when a map is hidden, missing or not yet built at the moment they scrub to, and on phones the page is wider than the screen, the era bar shrinks to a sliver and pins steal each other's taps. Session tags and clock labels contradict each other across the DM view, the Player View and the Dashboard, because sessionOf counts every era and many readouts skip momentLabel. The rest is drift: dead routes, fields, columns and CSS, comments and docs that still describe the deleted legacy app or call the live database disposable, several names for one thing, and a 2,400-line AtlasWorkspace.jsx. Of the 557 lines, 231 repeat a defect another explorer also found, which leaves 326 distinct items in 20 packages.

## The items that matter most to the table

- **B010** (high) — Share node endpoint serves future, DM-placed, hidden-branch and unplaced nodes, and lists them as links → [WP-01](WP-01-close-the-leaks-in-the-share-api-and-image-ids.md)
- **B014** (high) — Saving the timeline panel silently moves the canon moment (what players see) to the DM's local lens → [WP-04](WP-04-nothing-reaches-players-by-accident.md)
- **B006** (high) — Node DM notes go stale in the workspace: saveNode merges snake_case `dm_note` into camelCase node state, so reselecting shows the old note and typing overwrites it → [WP-03](WP-03-autosave-that-tells-the-truth.md)
- **B008** (high) — Undo and world clone use hand-copied column lists that drifted: Undo silently drops DM notes, stance, voice and interior map notes → [WP-02](WP-02-protect-the-live-campaign-data-undo-clone-and-ba.md)
- **B028** (medium) — Node autosave and lifespan autosave share one timer; the unmount flush also cancels a pending lifespan save (live proof) → [WP-03](WP-03-autosave-that-tells-the-truth.md)
- **B003** (high) — Forge contract: enrich facts/placements never land, and any batch with map notes (every recap) crashes with 'en is not defined' → [WP-06](WP-06-forge-recaps-and-voice.md)
- **B015** (high) — Re-enabling the clock ('🕓 Timeline') overwrites the saved range, unit and canon with 0–100 days, canon 0 → [WP-04](WP-04-nothing-reaches-players-by-accident.md)
- **P026** (medium) — 'Disable timeline' instantly shows players every out-of-time thing (future and ended), with no confirmation → [WP-04](WP-04-nothing-reaches-players-by-accident.md)
- **B009** (high) — Scrubbing the past inside a later-built place turns the Player View into a permanent 'This link isn't active' screen → [WP-05](WP-05-the-player-view-never-strands-a-player.md)
- **B057** (medium) — Session numbers (S3·7 tag, tick/print titles, session colours) count every era, so DM-only and overlapping eras make them wrong → [WP-10](WP-10-sessions-clock-labels-and-the-party.md)
- **B005** (high) — No way to record a new party footstep on a map the party has already visited → [WP-10](WP-10-sessions-clock-labels-and-the-party.md)
- **B013** (high) — A blank time field is read as 0: clearing an era bound silently widens a player-visible era over hidden history → [WP-04](WP-04-nothing-reaches-players-by-accident.md)
- **C009** (medium) — New places are born public and present at all times, so session prep appears on players' phones immediately → [WP-04](WP-04-nothing-reaches-players-by-accident.md)
- **B052** (medium) — On phones the page is wider than the screen, so crumbs, the canon chip, and the DM's posture switch and Exit are off-screen and can't be reached → [WP-09](WP-09-the-player-view-on-phones.md)
- **B001** (high) — Saving the ⚙ mind settings overwrites memory the mind wrote since the panel opened (recap summaries lost) → [WP-06](WP-06-forge-recaps-and-voice.md)

## Work packages

| Package | Items | high | After |
|---|---:|---:|---|
| [WP-01 · Close the leaks in the share API and image ids](WP-01-close-the-leaks-in-the-share-api-and-image-ids.md) | 9 | 2 |  |
| [WP-02 · Protect the live campaign data: undo, clone and backups](WP-02-protect-the-live-campaign-data-undo-clone-and-ba.md) | 11 | 1 |  |
| [WP-03 · Autosave that tells the truth](WP-03-autosave-that-tells-the-truth.md) | 15 | 2 |  |
| [WP-04 · Nothing reaches players by accident](WP-04-nothing-reaches-players-by-accident.md) | 10 | 3 |  |
| [WP-05 · The Player View never strands a player](WP-05-the-player-view-never-strands-a-player.md) | 15 | 1 | WP-01 |
| [WP-06 · Forge recaps and voice](WP-06-forge-recaps-and-voice.md) | 22 | 3 |  |
| [WP-07 · Delete the dead code](WP-07-delete-the-dead-code.md) | 25 |  |  |
| [WP-08 · Docs, config and comments tell the truth](WP-08-docs-config-and-comments-tell-the-truth.md) | 20 |  | WP-07 |
| [WP-09 · The Player View on phones](WP-09-the-player-view-on-phones.md) | 16 |  | WP-05 |
| [WP-10 · Sessions, clock labels and the Party](WP-10-sessions-clock-labels-and-the-party.md) | 17 | 1 | WP-04 |
| [WP-11 · The inspector](WP-11-the-inspector.md) | 14 |  | WP-03 |
| [WP-12 · Confirm before destroying](WP-12-confirm-before-destroying.md) | 6 |  | WP-02 |
| [WP-13 · The map surface: canvas, tree and outlines](WP-13-the-map-surface-canvas-tree-and-outlines.md) | 24 |  | WP-07 |
| [WP-14 · Images, backdrops and the Archive](WP-14-images-backdrops-and-the-archive.md) | 22 |  | WP-02 |
| [WP-15 · Validate input and say what went wrong](WP-15-validate-input-and-say-what-went-wrong.md) | 13 |  | WP-07 |
| [WP-16 · Accounts, sign-in and the Dashboard](WP-16-accounts-sign-in-and-the-dashboard.md) | 21 | 2 |  |
| [WP-17 · Layout at laptop widths and one look](WP-17-layout-at-laptop-widths-and-one-look.md) | 19 |  | WP-07, WP-09 |
| [WP-18 · Keyboard, dialogs and screen readers](WP-18-keyboard-dialogs-and-screen-readers.md) | 12 |  | WP-12, WP-13 |
| [WP-19 · One word for one thing](WP-19-one-word-for-one-thing.md) | 16 |  | WP-10, WP-11 |
| [WP-20 · Structural cleanup: split the workspace, share helpers, retire legacy columns](WP-20-structural-cleanup-split-the-workspace-share-hel.md) | 19 |  | WP-02, WP-03, WP-07, WP-08, WP-10, WP-13, WP-18 |

### WP-01 · Close the leaks in the share API and image ids

Stop the public share API from giving players nodes they should not see, and stop any account from pointing its maps or nodes at another account's images. Close the smaller holes on the same public and auth edges. → [WP-01-close-the-leaks-in-the-share-api-and-image-ids.md](WP-01-close-the-leaks-in-the-share-api-and-image-ids.md)

### WP-02 · Protect the live campaign data: undo, clone and backups

Make Undo and world clone restore every column and table they drop today, and give clones their own R2 files. Stop the docs and the e2e cleanup from treating production data as disposable. → [WP-02-protect-the-live-campaign-data-undo-clone-and-ba.md](WP-02-protect-the-live-campaign-data-undo-clone-and-ba.md)

### WP-03 · Autosave that tells the truth

Every edit either reaches the server or the DM is told it did not. Split the shared debounce timer, flush on page hide, flag failed saves, and send every write through track() so the save chip is honest. → [WP-03-autosave-that-tells-the-truth.md](WP-03-autosave-that-tells-the-truth.md)

### WP-04 · Nothing reaches players by accident

The canon moment, the timeline switch and new content should change what players see only when the DM means it to. Fix the timeline panel so Save keeps canon, Enable keeps the clock, and a blank box is not read as 0. → [WP-04-nothing-reaches-players-by-accident.md](WP-04-nothing-reaches-players-by-accident.md)

### WP-05 · The Player View never strands a player

A working share link should always leave the player on a map with a way back. Tell a dead token apart from a map that is missing, hidden or not yet built, and make marker failures and stale sheets visible. → [WP-05-the-player-view-never-strands-a-player.md](WP-05-the-player-view-never-strands-a-player.md)

### WP-06 · Forge recaps and voice

Make Forge recaps apply again, and stop the Forge from losing the DM's message, memory and settings. Stop voice lines from being lost or left behind in R2. → [WP-06-forge-recaps-and-voice.md](WP-06-forge-recaps-and-voice.md)

### WP-07 · Delete the dead code

Remove routes, response fields, exports, props and CSS that nothing uses, so every later package has less code to read and change. → [WP-07-delete-the-dead-code.md](WP-07-delete-the-dead-code.md)

### WP-08 · Docs, config and comments tell the truth

Bring CLAUDE.md, README, UX-REDESIGN.md, .env.example and the code comments back in line with the code, and retire docs about the deleted legacy app. Make the test fixture rebuildable. → [WP-08-docs-config-and-comments-tell-the-truth.md](WP-08-docs-config-and-comments-tell-the-truth.md)

### WP-09 · The Player View on phones

Players mostly use phones. Make the Player View fit 390px and 320px screens, keep pins tappable and pinch-zoom working, and stop the DM's Edit posture from moving pins on touch. → [WP-09-the-player-view-on-phones.md](WP-09-the-player-view-on-phones.md)

### WP-10 · Sessions, clock labels and the Party

Number sessions from the era, read every clock label through momentLabel, and let the DM record a new Party footstep on any map. → [WP-10-sessions-clock-labels-and-the-party.md](WP-10-sessions-clock-labels-and-the-party.md)

### WP-11 · The inspector

Fix the inspector's remaining wrong or confusing behaviour: Reveal, claiming player markers, links, interior names and focus after creating a node. → [WP-11-the-inspector.md](WP-11-the-inspector.md)

### WP-12 · Confirm before destroying

Give every one-click destructive control a confirm or an undo, using one shared pattern. → [WP-12-confirm-before-destroying.md](WP-12-confirm-before-destroying.md)

### WP-13 · The map surface: canvas, tree and outlines

Fix what goes wrong while moving around and drawing on the map: outline state that follows you, lost selection, hidden categories, stacked pins, and outlines that cannot be moved or styled. → [WP-13-the-map-surface-canvas-tree-and-outlines.md](WP-13-the-map-surface-canvas-tree-and-outlines.md)

### WP-14 · Images, backdrops and the Archive

Make uploads up to the stated 10 MB work and explain any failure, and let the picker reach every image. Make the timed-backdrop and Archive controls do what they say. → [WP-14-images-backdrops-and-the-archive.md](WP-14-images-backdrops-and-the-archive.md)

### WP-15 · Validate input and say what went wrong

Reject bad values with a clear 400 instead of a 500, and show the server's message instead of axios text. Replace the endless 'Opening…' with a real not-found state. → [WP-15-validate-input-and-say-what-went-wrong.md](WP-15-validate-input-and-say-what-went-wrong.md)

### WP-16 · Accounts, sign-in and the Dashboard

Make sign-out revoke the token and clear per-user state, and stop transient errors from signing the DM out. Settle what guest accounts are, and remove the setup pages left over from before SSO. → [WP-16-accounts-sign-in-and-the-dashboard.md](WP-16-accounts-sign-in-and-the-dashboard.md)

### WP-17 · Layout at laptop widths and one look

Keep the workspace inside the window from 1024 to 1440px, with and without the Forge open. Bring the login, setup and loading screens into the app's dark theme. → [WP-17-layout-at-laptop-widths-and-one-look.md](WP-17-layout-at-laptop-widths-and-one-look.md)

### WP-18 · Keyboard, dialogs and screen readers

Give modals and popovers real dialog behaviour, make pins, tree rows and threads reachable by keyboard, and label icon buttons, toggles and fields. → [WP-18-keyboard-dialogs-and-screen-readers.md](WP-18-keyboard-dialogs-and-screen-readers.md)

### WP-19 · One word for one thing

Pick one name for each thing (node, map, lantern, links, the players' moment). Replace scene-setting copy with short labels that say what a control does. → [WP-19-one-word-for-one-thing.md](WP-19-one-word-for-one-thing.md)

### WP-20 · Structural cleanup: split the workspace, share helpers, retire legacy columns

Split the 2,400-line AtlasWorkspace.jsx, and share time resolution, pin markup and modals between the workspace and the Player View. Remove the legacy columns and soft-delete filters from the live schema. → [WP-20-structural-cleanup-split-the-workspace-share-hel.md](WP-20-structural-cleanup-split-the-workspace-share-hel.md)

