// The one-off mover for old base64 rows (scripts/move-base64-to-r2.js), run locally with a fake
// table and a fake R2: the dry run writes nothing; apply copies a row, checks the object's size,
// and only then points the row at R2 and clears its base64; rows with no world are left alone;
// a copy that landed short is not cleared.
//
//   node --test server/test/move-base64.test.js
const test = require('node:test');
const assert = require('node:assert');
const { moveRows } = require('../scripts/move-base64-to-r2');

const b64 = (s) => Buffer.from(s).toString('base64');
const table = () => new Map([
  [1, { id: 1, world_id: 3, filename: 'img-1-1.png', mime_type: 'image/png', base64_data: `data:image/png;base64,${b64('first-bytes')}`, file_path: '/api/images-base64/serve/img-1-1.png', storage_key: null }],
  [2, { id: 2, world_id: null, filename: 'orphan.png', mime_type: 'image/png', base64_data: `data:image/png;base64,${b64('orphan')}`, file_path: '/api/images-base64/serve/orphan.png', storage_key: null }],
  [3, { id: 3, world_id: 3, filename: 'raw b.svg', mime_type: 'image/svg+xml', base64_data: b64('<svg/>'), file_path: '/api/images-base64/serve/raw b.svg', storage_key: null }],
  [4, { id: 4, world_id: 4, filename: 'short.png', mime_type: 'image/png', base64_data: `data:image/png;base64,${b64('short-copy')}`, file_path: '/api/images-base64/serve/short.png', storage_key: null }],
  [5, { id: 5, world_id: 4, filename: 'already.png', mime_type: 'image/png', base64_data: null, file_path: 'https://pub.test/worlds/4/already.png', storage_key: 'worlds/4/already.png' }],
]);

const fakePool = (rows) => ({
  writes: 0,
  async query(sql, params = []) {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (/^SELECT id, world_id, filename, mime_type, length\(base64_data\)/.test(s)) {
      let list = [...rows.values()].filter((r) => r.base64_data != null).sort((a, b) => a.id - b.id);
      if (/LIMIT \$1/.test(s)) list = list.slice(0, params[0]);
      return { rows: list.map((r) => ({ id: r.id, world_id: r.world_id, filename: r.filename, mime_type: r.mime_type, chars: r.base64_data.length })) };
    }
    if (/^SELECT id, world_id, filename, mime_type, base64_data FROM images WHERE id = \$1 AND base64_data IS NOT NULL/.test(s)) {
      const r = rows.get(params[0]);
      return { rows: r && r.base64_data != null ? [r] : [] };
    }
    if (/^UPDATE images SET file_path = \$1, storage_key = \$2, base64_data = NULL WHERE id = \$3 AND base64_data IS NOT NULL/.test(s)) {
      this.writes += 1;
      const r = rows.get(params[2]);
      if (!r || r.base64_data == null) return { rowCount: 0, rows: [] };
      Object.assign(r, { file_path: params[0], storage_key: params[1], base64_data: null });
      return { rowCount: 1, rows: [] };
    }
    if (/^SELECT count\(\*\) AS n FROM images WHERE base64_data IS NOT NULL/.test(s)) return { rows: [{ n: String([...rows.values()].filter((r) => r.base64_data != null).length) }] };
    throw new Error(`unexpected query: ${s}`);
  },
});

const fakeStorage = (objects, { enabled = true } = {}) => ({
  r2Enabled: enabled,
  puts: [],
  deleted: [],
  async putObject(key, body, type) { this.puts.push({ key, type }); objects.set(key, key.includes('short') ? Buffer.from(body).subarray(0, 3) : Buffer.from(body)); return `https://pub.test/${key}`; },
  async objectSize(key) { return objects.has(key) ? objects.get(key).length : null; },
  async deleteObject(key) { this.deleted.push(key); objects.delete(key); },
});

test('the dry run counts the rows and writes nothing', async () => {
  const rows = table(), pool = fakePool(rows), objects = new Map(), storage = fakeStorage(objects);
  const lines = [];
  const out = await moveRows({ pool, storage, log: (l) => lines.push(l) });
  assert.strictEqual(out.found, 4);
  assert.strictEqual(pool.writes, 0);
  assert.strictEqual(storage.puts.length, 0);
  assert.match(lines.join('\n'), /4 image row\(s\) still hold base64_data/);
  assert.match(lines.join('\n'), /world \(none\): 1/);
  assert.match(lines.join('\n'), /dry run/);
  assert.ok(![...lines].some((l) => l.includes(b64('first-bytes'))), 'no image contents are printed');
});

test('apply copies a row, checks the size, then points it at R2 and clears the base64', async () => {
  const rows = table(), pool = fakePool(rows), objects = new Map(), storage = fakeStorage(objects);
  const out = await moveRows({ pool, storage, apply: true, log: () => {} });
  assert.deepStrictEqual({ moved: out.moved, skipped: out.skipped, failed: out.failed, remaining: out.remaining }, { moved: 2, skipped: 1, failed: 1, remaining: 2 });

  const first = rows.get(1);
  assert.strictEqual(first.storage_key, 'worlds/3/moved-1-img-1-1.png');
  assert.strictEqual(first.file_path, 'https://pub.test/worlds/3/moved-1-img-1-1.png');
  assert.strictEqual(first.base64_data, null);
  assert.strictEqual(objects.get(first.storage_key).toString(), 'first-bytes');
  assert.strictEqual(storage.puts.find((p) => p.key === first.storage_key).type, 'image/png');

  const raw = rows.get(3);
  assert.strictEqual(raw.storage_key, 'worlds/3/moved-3-raw_b.svg', 'the file name is made key-safe');
  assert.strictEqual(objects.get(raw.storage_key).toString(), '<svg/>', 'a bare base64 string (no data: prefix) decodes too');
  assert.strictEqual(storage.puts.find((p) => p.key === raw.storage_key).type, 'image/svg+xml');

  assert.notStrictEqual(rows.get(2).base64_data, null, 'a row with no world is left alone');
  assert.notStrictEqual(rows.get(4).base64_data, null, 'a copy that landed short is not cleared');
  assert.strictEqual(rows.get(4).storage_key, null);
  assert.strictEqual(rows.get(5).storage_key, 'worlds/4/already.png', 'rows already on R2 are never touched');
});

test('running it again finds only what is left, and --limit stops early', async () => {
  const rows = table(), pool = fakePool(rows), storage = fakeStorage(new Map());
  const one = await moveRows({ pool, storage, apply: true, limit: 1, log: () => {} });
  assert.strictEqual(one.found, 1);
  assert.strictEqual(one.moved, 1);
  const again = await moveRows({ pool, storage, apply: true, log: () => {} });
  assert.strictEqual(again.found, 3);
  assert.strictEqual(again.moved, 1);
});

test('apply refuses when R2 is not configured', async () => {
  const rows = table();
  await assert.rejects(moveRows({ pool: fakePool(rows), storage: fakeStorage(new Map(), { enabled: false }), apply: true, log: () => {} }), /R2 is not configured/);
});
