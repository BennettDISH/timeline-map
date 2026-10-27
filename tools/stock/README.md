# Making the Atlas' stock tokens and portraits

24 tokens (cut-outs for pins: creatures, people, places) and 12 portraits, offered under an
entry's art picker as **Stock** in any world. The pictures do not live in this repo: they are
painted here, finished, and uploaded to the games' media bucket; the repo keeps the prompts, the
scripts and `server/stock/library.json`, the list the server offers (nothing outside it can be
picked). A pick copies the picture into the world's Archive (`server/routes/stock.js`).

One style for all of them, and one style anchor: the knight is painted first with no reference
and every other picture is painted with the knight beside its prompt (`prompts.mjs`), so the set
reads as one hand. Tokens are painted on magenta and keyed out to transparency.

```bash
cd ~/repos/fantasy-map-timeline            # (or a worktree)
cd tools/stock && npm install && cd ../..  # sharp, once
(cd server && npm install)                 # fleet-kit's R2 store, for step 4
# 1. paint (Gemini 2.5 Flash Image, about $0.04 a picture; a picture already there is kept)
set -a; . ~/.config/games-media/gemini.env; set +a          # the key, never printed
node tools/stock/paint.mjs --out ~/night/atlas-stock-out/raw            # --only wolf,ship --force repaints some
# 2. finish: tokens keyed and trimmed to 512 px WebP, portraits 768 px WebP
node tools/stock/finish.mjs ~/night/atlas-stock-out/raw ~/night/atlas-stock-out/final
# 3. look at them before they go anywhere
node tools/stock/sheet.mjs ~/night/atlas-stock-out/final ~/night/atlas-stock-out/sheet.png
# 4. upload (content-hashed keys, atlas/stock/<tokens|portraits>/<name>-<sha8>.webp) and write the list
set -a; . ~/.config/games-media/r2.env; set +a
node tools/stock/upload.mjs ~/night/atlas-stock-out/final
```

A changed picture gets a new key, so worlds that already copied the old one keep it, and the
next pick copies the new one. Adding or removing a picture: change `prompts.mjs`, run the four
steps, and update the counts in `server/test/stock.test.js` and `CREDITS.md`.
