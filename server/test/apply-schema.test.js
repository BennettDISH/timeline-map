// The boot-time schema step drops images.base64_data, run locally against a stand-in pool: the
// column goes once no row holds bytes, stays when one does, and a new database never has it.
//
//   node --test server/test/apply-schema.test.js
const test = require('node:test');
const assert = require('node:assert');
const { applySchema, readStatements } = require('../config/apply-schema');

const DROP = /^ALTER TABLE images DROP COLUMN base64_data$/;

/** A pool that answers the column and count checks; every statement sent lands in `sent`. */
function standIn({ hasColumn, held = 0 }) {
  const sent = [];
  return {
    sent,
    async query(sql) {
      sent.push(sql);
      if (/information_schema\.columns/.test(sql)) return { rows: hasColumn ? [{ '?column?': 1 }] : [] };
      if (/count\(\*\).*FROM images WHERE base64_data IS NOT NULL/.test(sql)) return { rows: [{ n: held }] };
      return { rows: [] };
    },
  };
}

test('schema.sql no longer creates the column', () => {
  for (const statement of readStatements()) assert.doesNotMatch(statement, /base64_data/);
});

test('a database with the column and no bytes loses the column', async () => {
  const pool = standIn({ hasColumn: true });
  const { failed } = await applySchema(pool);
  assert.deepStrictEqual(failed, []);
  assert.strictEqual(pool.sent.filter((s) => DROP.test(s)).length, 1);
});

test('a row still holding bytes keeps the column and is reported', async () => {
  const pool = standIn({ hasColumn: true, held: 2 });
  const reported = [];
  const { failed } = await applySchema(pool, { onError: (s, e) => reported.push(e.message) });
  assert.strictEqual(pool.sent.filter((s) => DROP.test(s)).length, 0);
  assert.strictEqual(failed.length, 1);
  assert.match(failed[0].message, /2 image row\(s\) still hold base64_data/);
  assert.match(reported[0], /still hold base64_data/);
});

test('a database without the column does nothing more, boot after boot', async () => {
  const pool = standIn({ hasColumn: false });
  const { failed } = await applySchema(pool);
  assert.deepStrictEqual(failed, []);
  assert.strictEqual(pool.sent.filter((s) => DROP.test(s)).length, 0);
});
