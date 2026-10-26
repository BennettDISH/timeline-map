# Making the Atlas' sounds

The files do not live in this repo: they are made here, levelled, and uploaded to the games' media
bucket; the repo keeps the prompts, the scripts and the manifest that names the files.

```bash
cd ~/repos/fantasy-map-timeline            # (or a worktree)
set -a; . ~/.config/games-media/elevenlabs.env; set +a        # the key, never printed
# 1. generate: one mp3 per prompt in tools/sounds/prompts.mjs (--only a,b for some; --credits to look)
node tools/sounds/eleven.mjs --out ~/night/atlas-audio-out/takes --manifest ~/night/atlas-audio-out/takes.manifest.json
# 2. the beds: two takes each -> one long seamless loop (needs the games-media repo for ffmpeg and make-bed.mjs)
bash tools/sounds/make-beds.sh ~/night/atlas-audio-out/takes ~/night/atlas-audio-out/public-audio/eleven
# 3. the cues (ui.*): level them (about -20 LUFS, the scrub tick -26) and copy next to the beds
# 4. upload and write the manifest the page ships with (set -a; . ~/.config/games-media/r2.env; set +a)
node ~/repos/games-media/tools/upload-r2.mjs atlas ~/night/atlas-audio-out/public-audio \
  ~/night/atlas-audio-out/manifest.local.json client/public/audio/manifest.json
```

`manifest.local.json` is `{ version: 1, sounds: { name: { src: "/audio/eleven/<name>.mp3", gain, loopStart?, loopEnd? } } }`
(the loop points come from `beds.json`, which step 2 writes). The uploader hashes each file into its
bucket key and rewrites those paths to bucket URLs. Add the name to `client/src/audio/names.js` and
`CREDITS.md` too; `server/test/sound.test.js` fails until the three agree.
