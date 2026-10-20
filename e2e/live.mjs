// The DM, undo, doors and server suites write: throwaway worlds, entries, markers, undo records.
// Against a server on this machine they run as they are; against anything else (the live Atlas)
// only when E2E_LIVE=1 says so, and then on dm.config.json's throwaway DM account.
export function liveOptIn(base) {
  const host = new URL(base).hostname;
  if (['127.0.0.1', 'localhost', '[::1]'].includes(host) || process.env.E2E_LIVE === '1') return;
  console.error(`${base} is not this machine, and this suite writes there. Run it on the local stack
(node e2e/local.mjs, then E2E_CONFIG=e2e/local.config.json), or set E2E_LIVE=1 to run it live.`);
  process.exit(2);
}
