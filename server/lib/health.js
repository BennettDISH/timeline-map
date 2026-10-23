// GET /health, for Railway's deploy healthcheck (railway.toml): the process is up and serving,
// and one SELECT 1 comes back within TIMEOUT_MS. Nothing else is read, so it stays cheap however
// often it is asked. 200 { status: 'ok', commit, timestamp, db: 'ok' }, or 503 { status:
// 'unavailable', db: 'not answering' } with no database error text, so a deploy whose database
// is unreachable fails its healthcheck instead of going live. `commit` is the deploy signal the
// live suites wait for (Railway's commit sha, null elsewhere).

const TIMEOUT_MS = 3000;

function healthHandler({ query, commit = () => null, timeoutMs = TIMEOUT_MS }) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    let timer;
    const asked = Promise.resolve().then(() => query('SELECT 1'));
    asked.catch(() => {}); // a late failure after the timeout must not become an unhandled rejection
    const late = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeoutMs); });
    try {
      await Promise.race([asked, late]);
      res.json({ status: 'ok', commit: commit(), timestamp: new Date().toISOString(), db: 'ok' });
    } catch {
      res.status(503).json({ status: 'unavailable', db: 'not answering' });
    } finally {
      clearTimeout(timer);
    }
  };
}

module.exports = { healthHandler, TIMEOUT_MS };
