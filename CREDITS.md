# Credits and licences

## Sound

Every sound file was generated with **ElevenLabs Sound Effects** on Bennett's paid (Starter) plan,
whose terms allow commercial use of the output. The prompt for each is in `tools/sounds/prompts.mjs`
and `tools/sounds/eleven.mjs` regenerates any of them (`tools/sounds/README.md` has the steps). The
files are served from the games' media bucket,
`https://media.bennettdishmanmedia.com/atlas/audio/eleven/<name>-<hash>.mp3`, with content-hashed,
immutable names; `client/public/audio/manifest.json` says which file plays for which sound. The
originals are kept with the games-media tooling, outside this repo.

### Ambience beds

Seven places, each made from **two 22 s takes** of the same place with different detail in the
foreground (`amb.<bed>.a`, `.b`), levelled to −20 LUFS, joined with a 1.5 s crossfade and cut to a
38 s loop whose tail is crossfaded into its head (`tools/sounds/make-beds.sh`, which uses the
games-media repo's `make-bed.mjs`), so a bed does not repeat itself every twenty seconds and loops
without a seam. The manifest carries each bed's loop points (2 s to 40 s).

| Bed | The place |
|---|---|
| `amb.wilds` | open grassland: breeze through grass, distant songbirds, insects (the default) |
| `amb.forest` | deep old forest: layered birdsong, rustling leaves, a stream |
| `amb.town` | a market town: muffled crowd murmur, cart wheels, a distant hammer, a far bell |
| `amb.sea` | a rocky harbour and open water: waves, gulls, creaking timber |
| `amb.dungeon` | dark stone: slow echoing drips, a cold draught, a distant clink |
| `amb.mountain` | a high pass: thin wind over rock, a distant eagle, shifting stones |
| `amb.storm` | a night thunderstorm: heavy rain, rolling thunder, wind |

### Cues

| Name | Where it plays |
|---|---|
| `ui.reveal` (2 takes) | a new pin appears on the map being looked at |
| `ui.scrub` (3 takes) | each step of the era bar |
| `ui.era` | crossing into another era |
| `ui.now` | ⦿ Now, back to the present |

Nothing else in the app makes sound. When a file is replaced or added, update this file, the
manifest and `client/src/audio/names.js` together.
