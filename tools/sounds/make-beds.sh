#!/usr/bin/env bash
# Turn the generated ambience takes into the longer, seamless beds the Player View plays.
#
#   bash tools/sounds/make-beds.sh <takes-dir> <out-dir>
#
# For each bed it takes <takes-dir>/amb.<bed>.a.mp3 and .b.mp3 (two 22 s takes of the same place,
# made by eleven.mjs), levels both to the same loudness, joins them with a 1.5 s crossfade (about
# 42 s), then lets games-media's make-bed.mjs cut it to a loop whose tail is crossfaded into its
# head, so the file plays 0 -> loopEnd and jumps back to loopStart with no audible seam. The
# loop points land in <out-dir>/beds.json for the manifest.
#
# Needs ffmpeg and make-bed.mjs from the games-media repo: GAMES_MEDIA (default ~/repos/games-media)
# holds both (ffmpeg-static in its node_modules); FFMPEG overrides the binary.
set -euo pipefail
takes=${1:?takes dir}
out=${2:?out dir}
gm=${GAMES_MEDIA:-$HOME/repos/games-media}
ffmpeg=${FFMPEG:-$(ls "$gm"/node_modules/ffmpeg-static/ffmpeg)}
LUFS=${LUFS:--20}
mkdir -p "$out"
tmp=$(mktemp -d)
echo '{}' > "$out/beds.json"
for bed in wilds forest town sea dungeon mountain storm; do
  a="$takes/amb.$bed.a.mp3"; b="$takes/amb.$bed.b.mp3"
  [ -f "$a" ] && [ -f "$b" ] || { echo "missing takes for $bed" >&2; exit 1; }
  "$ffmpeg" -y -hide_banner -loglevel error -i "$a" -i "$b" -filter_complex \
    "[0:a]loudnorm=I=$LUFS:TP=-1.5:LRA=7[x];[1:a]loudnorm=I=$LUFS:TP=-1.5:LRA=7[y];[x][y]acrossfade=d=1.5:c1=tri:c2=tri[o]" \
    -map '[o]' -ar 44100 -b:a 192k "$tmp/$bed.mp3"
  json=$(node "$gm/tools/make-bed.mjs" "$tmp/$bed.mp3" "$out/amb.$bed.mp3" --start 0 --length 38 --xfade 2 --lufs "$LUFS")
  node -e '
    const fs = require("fs"); const [file, name, line] = process.argv.slice(1);
    const all = JSON.parse(fs.readFileSync(file, "utf8")); const r = JSON.parse(line);
    all[name] = { loopStart: r.loopStart, loopEnd: r.loopEnd, seconds: r.seconds };
    fs.writeFileSync(file, JSON.stringify(all, null, 2) + "\n");
  ' "$out/beds.json" "amb.$bed" "$json"
  echo "amb.$bed: $json"
done
rm -rf "$tmp"
