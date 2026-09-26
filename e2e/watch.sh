#!/bin/bash
# Wait for the live deploy to reach the local HEAD (the /health check names the deployed
# commit), then run every suite against it: the local contract test, the API secrecy suite,
# the Player View, DM, undo and server probes. Usage, from the repo root:
#   bash e2e/watch.sh            # waits up to 20 minutes for the deploy, then runs everything
#   SKIP_WAIT=1 bash e2e/watch.sh # runs against whatever is live right now
R=$(cd "$(dirname "$0")/.." && pwd)
BASE=${BASE_URL:-https://timeline-map-production.up.railway.app}
if [ -z "$SKIP_WAIT" ]; then
  want=$(cd "$R" && git rev-parse HEAD)
  echo "waiting for live commit $want"
  for i in $(seq 1 80); do
    live=$(curl -s --max-time 25 "$BASE/health" | grep -o '"commit":"[0-9a-f]*"' | cut -d'"' -f4)
    [ "$live" = "$want" ] && break
    sleep 15
  done
  echo "live commit: $live ($([ "$live" = "$want" ] && echo match || echo NO MATCH after 20 min))"
fi
cd "$R"
echo "--- contract (local)"; node --test server/test/contract.test.js 2>&1 | grep -E "^# (tests|pass|fail)|^not ok"
echo "--- share api"; node --test server/test/share-live.test.js 2>&1 | grep -E "^# (tests|pass|fail)|^not ok"
# the no-root Chromium libraries (see e2e/README.md)
for d in "$HOME/.cache/atlas-e2e-libs/usr/lib/x86_64-linux-gnu" "$E2E_LIBS"; do [ -n "$d" ] && [ -d "$d" ] && export LD_LIBRARY_PATH="$d" && break; done
export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1
echo "--- player suite"; node e2e/player.mjs 2>&1 | grep -v "Skipping host"
echo "--- dm suite"; node e2e/dm.mjs 2>&1 | grep -v "Skipping host"
echo "--- undo api"; node e2e/undo.mjs 2>&1
echo "--- server api"; node e2e/server.mjs 2>&1
