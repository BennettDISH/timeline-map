# Docs

`CLAUDE.md` at the root is the design spec: the model and every rule the code enforces. This
folder holds the rest.

## Topic docs
- [ROADMAP.md](ROADMAP.md) — open ideas, planned work, never-tested areas and small known issues.
- [UX-REDESIGN.md](UX-REDESIGN.md) — the founding vision (2026-07). Its roadmap is retired; everything in it shipped by v1.0.0 except what is in ROADMAP.md.
- [R2-SETUP.md](R2-SETUP.md) — click-by-click Cloudflare R2 setup for images.

## Dated notes
- [notes/2026-08-19-readiness-audit.md](notes/2026-08-19-readiness-audit.md) — "can this run a real session?" audit before v1.0.0; every item shipped the same week or in the cleanup.

## The 2026-09-26 cleanup (`cleanup/`)
The whole-app audit: 401 items in 28 work packages, 400 done (P112 is in ROADMAP.md). Start at
its index.
- [cleanup/README.md](cleanup/README.md) — how the list was made, progress, the items that mattered most, and the package table.
- [cleanup/appendix.md](cleanup/appendix.md) — judgment calls, deliberate designs not to "fix", rejected claims, what each lane covered.
- [WP-01](cleanup/WP-01-close-the-leaks-in-the-share-api-and-image-ids.md) — close the leaks in the share API and image ids.
- [WP-02](cleanup/WP-02-protect-the-live-campaign-data-undo-clone-and-ba.md) — protect the live campaign data: undo, clone and backups.
- [WP-03](cleanup/WP-03-autosave-that-tells-the-truth.md) — autosave that tells the truth.
- [WP-04](cleanup/WP-04-nothing-reaches-players-by-accident.md) — nothing reaches players by accident.
- [WP-05](cleanup/WP-05-the-player-view-never-strands-a-player.md) — the Player View never strands a player.
- [WP-06](cleanup/WP-06-forge-recaps-and-voice.md) — Forge recaps and voice.
- [WP-07](cleanup/WP-07-delete-the-dead-code.md) — delete the dead code.
- [WP-08](cleanup/WP-08-docs-config-and-comments-tell-the-truth.md) — docs, config and comments tell the truth.
- [WP-09](cleanup/WP-09-the-player-view-on-phones.md) — the Player View on phones.
- [WP-10](cleanup/WP-10-sessions-clock-labels-and-the-party.md) — sessions, clock labels and the Party.
- [WP-11](cleanup/WP-11-the-inspector.md) — the inspector.
- [WP-12](cleanup/WP-12-confirm-before-destroying.md) — confirm before destroying.
- [WP-13](cleanup/WP-13-the-map-surface-canvas-tree-and-outlines.md) — the map surface: canvas, tree and outlines.
- [WP-14](cleanup/WP-14-images-backdrops-and-the-archive.md) — images, backdrops and the Archive.
- [WP-15](cleanup/WP-15-validate-input-and-say-what-went-wrong.md) — validate input and say what went wrong.
- [WP-16](cleanup/WP-16-accounts-sign-in-and-the-dashboard.md) — accounts, sign-in and the Dashboard.
- [WP-17](cleanup/WP-17-layout-at-laptop-widths-and-one-look.md) — layout at laptop widths and one look.
- [WP-18](cleanup/WP-18-keyboard-dialogs-and-screen-readers.md) — keyboard, dialogs and screen readers.
- [WP-19](cleanup/WP-19-one-word-for-one-thing.md) — one word for one thing.
- [WP-20](cleanup/WP-20-structural-cleanup-split-the-workspace-share-hel.md) — structural cleanup: split the workspace, share helpers, retire legacy columns.
- [WP-21](cleanup/WP-21-the-server-stays-up-and-sign-in-keeps-working.md) — the server stays up and sign-in keeps working (second pass).
- [WP-22](cleanup/WP-22-the-dm-s-screen-shows-what-the-server-holds.md) — the DM's screen shows what the server holds (second pass).
- [WP-23](cleanup/WP-23-the-player-view-shows-the-right-map-moment-art-a.md) — the Player View shows the right map, moment, art and sound (second pass).
- [WP-24](cleanup/WP-24-the-player-view-inside-spellforge-and-on-a-slow.md) — the Player View inside Spellforge and on a slow phone (second pass).
- [WP-25](cleanup/WP-25-the-forge-nothing-public-before-keep-and-unmake.md) — the Forge: nothing public before Keep, and Unmake removes only its own (second pass).
- [WP-26](cleanup/WP-26-the-party-the-clock-and-a-long-campaign.md) — the Party, the clock and a long campaign (second pass).
- [WP-27](cleanup/WP-27-tests-that-can-fail-and-docs-that-record-the-rul.md) — tests that can fail, and docs that record the rules (second pass).
- [WP-28](cleanup/WP-28-one-click-does-one-thing-and-the-map-s-cues-tell.md) — one click does one thing, and the map's cues tell the truth (second pass).

## Elsewhere in the repo
- `e2e/README.md` — the browser suites and API probes, and the local stack they run against.
- `server/test/FIXTURE.md` — the production fixture world the secrecy suite reads.
