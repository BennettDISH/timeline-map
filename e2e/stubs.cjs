// Every paid service, answered on this machine. local.mjs starts its second server ("paid") with
// `node --require e2e/stubs.cjs server.js`, so the Forge, voices, ambience and R2 all run with no
// key, no network and no bill: Gemini (the mind, the painter and speech), OpenAI speech,
// ElevenLabs and R2's public URL are answered by the fetch below, and R2's S3 API by a patched
// S3Client. Anything else goes out as normal. Test code only: the server never loads this.
//
// The mind's reply: "paint N" anywhere in what the DM says proposes a batch of N paintings;
// anything else is a plain answer.
//
// A small control port (STUB_PORT, on 127.0.0.1) lets e2e/server.mjs drive the spend guard:
//   GET  /calls   how many paid calls reached each stub
//   POST /reset   zero those counts and today's spend counters (so a rerun starts clean)
//   POST /user    {guest?, admin?} → {id, token}: a fresh account on this database
const http = require('http');
const path = require('path');
const fromServer = (m) => require(require.resolve(m, { paths: [process.cwd()] }));

const calls = { text: 0, image: 0, speech: 0, ambience: 0, r2: 0 };

// a 1×1 PNG, a quarter second of silence (16-bit PCM at 24 kHz) and a tiny MP3-ish blob
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const PCM = Buffer.alloc(12000).toString('base64');
const MP3 = Buffer.from([0xff, 0xfb, 0x90, 0x00, ...Buffer.alloc(400)]);

const reply = (body, status = 200, type = 'application/json') =>
  new Response(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body), { status, headers: { 'Content-Type': type } });
const gemini = (parts) => reply({ candidates: [{ content: { parts } }] });

function mind(body) {
  calls.text += 1;
  const last = body?.contents?.[body.contents.length - 1]?.parts?.map((p) => p.text || '').join('') || '';
  const said = last.split('DM SAYS:').pop();
  const n = Number(said.match(/paint (\d+)/i)?.[1] || 0);
  const out = n
    ? { say: `Painting ${n}.`, batch: { summary: `${n} stub painting${n === 1 ? '' : 's'}`, images: Array.from({ length: n }, (_, i) => ({ key: `p${i}`, kind: 'art', prompt: `stub painting ${i + 1}`, name: `Stub ${i + 1}` })) } }
    : { say: 'Heard you.' };
  return gemini([{ text: JSON.stringify(out) }]);
}

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.hostname === 'generativelanguage.googleapis.com') {
    const body = JSON.parse(init.body || '{}');
    const modes = body.generationConfig?.responseModalities || [];
    if (modes.includes('IMAGE')) { calls.image += 1; return gemini([{ inlineData: { mimeType: 'image/png', data: PNG } }]); }
    if (modes.includes('AUDIO')) { calls.speech += 1; return gemini([{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: PCM } }]); }
    return mind(body);
  }
  if (url.hostname === 'api.openai.com') { calls.speech += 1; return reply(MP3, 200, 'audio/mpeg'); }
  if (url.hostname === 'api.elevenlabs.io') {
    if (url.pathname === '/v1/voices') return reply({ voices: [{ voice_id: 'stub', name: 'Stub' }] });
    if (url.pathname === '/v1/sound-generation') calls.ambience += 1; else calls.speech += 1;
    return reply(MP3, 200, 'audio/mpeg');
  }
  // R2's public URL (the style anchor is read back from it)
  if (process.env.R2_PUBLIC_URL && url.origin === new URL(process.env.R2_PUBLIC_URL).origin) return reply(Buffer.from(PNG, 'base64'), 200, 'image/png');
  return realFetch(input, init);
};

// R2's S3 API: every put, copy, delete and list succeeds and keeps nothing
const { S3Client } = fromServer('@aws-sdk/client-s3');
S3Client.prototype.send = async function send() { calls.r2 += 1; return { Contents: [], IsTruncated: false }; };

// One database connection. PGlite is one session behind a socket multiplexer, and two pg
// connections querying at once get each other's statements ("portal does not exist"), so the
// suites fire parallel requests only here, where they queue for the one connection — requests
// still interleave in the app between queries, which is the race the spend guard must win. A
// path that wants a second connection while holding the first fails after 10 s instead of hanging.
const pg = fromServer('pg');
const OnePool = class extends pg.Pool { constructor(o) { super({ ...o, max: 1, connectionTimeoutMillis: 10000 }); } };
pg.Pool = OnePool;

// ---- the control port ----
if (process.env.STUB_PORT) {
  const pool = fromServer(path.join(process.cwd(), 'config/database'));
  const { signJwt } = fromServer('fleet-kit/server'); // the old bearer format the legacy reader takes
  const admin = Number((process.env.ADMIN_CENTRAL_USER_IDS || '').split(',')[0]) || null;
  const read = (req) => new Promise((ok) => { let s = ''; req.on('data', (c) => { s += c; }); req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch (e) { ok({}); } }); });
  http.createServer(async (req, res) => {
    const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    try {
      if (req.method === 'GET' && req.url === '/calls') return send(200, calls);
      if (req.method === 'POST' && req.url === '/reset') {
        for (const k of Object.keys(calls)) calls[k] = 0;
        await pool.query('DELETE FROM spend_counters');
        return send(200, { ok: true });
      }
      if (req.method === 'POST' && req.url === '/user') {
        const b = await read(req);
        const name = `spend-${b.guest ? 'guest' : b.admin ? 'admin' : 'dm'}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        if (b.admin && admin) await pool.query('UPDATE users SET central_user_id = NULL WHERE central_user_id = $1', [admin]); // one row per central id
        const u = (await pool.query(
          `INSERT INTO users (username, email, password_hash, is_guest, central_user_id) VALUES ($1, $2, 'x', $3, $4) RETURNING id, token_version`,
          [name, `${name}@example.invalid`, !!b.guest, b.admin ? admin : null])).rows[0];
        return send(200, { id: u.id, token: signJwt({ userId: u.id, tv: u.token_version }, process.env.JWT_SECRET, { ttlMs: 60 * 60 * 1000 }) });
      }
      send(404, { message: 'no such stub route' });
    } catch (e) { send(500, { message: e.message }); }
  }).listen(Number(process.env.STUB_PORT), '127.0.0.1');
}
