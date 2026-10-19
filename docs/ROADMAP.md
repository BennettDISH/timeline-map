# Roadmap

The one list of open ideas, planned work and known issues. One line per item. When something
ships, delete its line (git keeps the history).

## Ideas (the "later" shelf)
- Per-fact visibility: hide one period text from players while the entry stays visible.
- Branching campaigns.
- @-mention an entry while writing to make a thread to it.
- A create-world wizard (name → backdrop → land on a real map).
- Portals: threads that carry a kind or a moment in the UI.

## Planned
- Guests keep their worlds when they become a real account: Waypoint can claim a guest (keeping its central id, so the worlds would stay theirs), but only from its own account page, which a guest the Atlas made through the proxy never signs into. The Atlas needs a proxy claim endpoint and a button.
- P112: each lens tick re-renders the whole workspace (about 15 fps scrubbing the crowded root on a 4x-slower CPU). Parked by Bennett on 2026-09-28 until the Atlas is at a good V1; see `docs/cleanup/WP-26-the-party-the-clock-and-a-long-campaign.md`.

## Never tested
- The Player View in real WebKit (every iPhone and iPad browser).
- The Forge's write path end to end against a sandbox with a scripted model.

## Small known issues (judgment calls still open in `docs/cleanup/appendix.md`, re-checked 2026-09-29)
- Hard-coded colours duplicate the style tokens (four reds for danger, two golds, `#38b6a3` beside `--party`).
- The public image-serve route looks images up by filename with no index (fine while the table is small).
- The server accepts a zero-area outline (the UI only makes one from three corners in a line).
- With no ambience provider, the DM has no control to remove an existing map ambience (unreachable today: no map holds one).
- `@types/react` and `@types/react-dom` sit unused in the client's devDependencies (harmless; stock Vite template).
