// Stopping when Railway asks: every deploy stops the old server with SIGTERM, and a stop that doesn't end
// in exit 0 is mailed to Bennett as "Deploy crashed". Every update did that until 11-26. `npm start`
// ran `cd server && npm start`, which ran `sh -c "node server.js"`. npm handed its SIGTERM to sh, and
// sh died of it (npm exit 143). node, orphaned, never heard it and was killed with the container. Both
// start scripts now exec, so the signal comes down npm, npm to node. On the first SIGTERM or SIGINT this
// runs close() and exits 0, by graceMs at the latest, however the close went. A second signal is only
// noted (Railway may signal every process while npm passes its own on). test/clean-stop.test.js.
function exitCleanlyOn(close, { signals = ['SIGTERM', 'SIGINT'], graceMs = 5000, log = (line) => console.log(line), exit = (code) => process.exit(code), target = process } = {}) {
  let stopping = false;
  const stop = async (signal) => {
    if (stopping) {
      log(`${signal} again: already stopping`);
      return;
    }
    stopping = true;
    log(`${signal}: closing`);
    const deadline = setTimeout(() => {
      log(`stopped (gave up waiting after ${graceMs} ms)`);
      exit(0);
    }, graceMs);
    if (deadline.unref) deadline.unref();
    try {
      await close();
    } catch (err) {
      log(`closing failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    clearTimeout(deadline);
    log('stopped');
    exit(0);
  };
  for (const signal of signals) target.on(signal, stop);
  return () => { for (const signal of signals) target.off(signal, stop); };
}

module.exports = { exitCleanlyOn };
