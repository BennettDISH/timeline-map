#!/usr/bin/env node
// One-off: point the stored media URLs at the bucket's custom domain instead of the rate-limited
// r2.dev address. Rewrites the leading address only, in the three columns that hold one:
//   images.file_path   nodes.voice_url   maps.ambience_url
// The rest of each URL (worlds/<id>/<file>) is untouched, so every row keeps pointing at the same
// object. updated_at is not touched either, so no open editor sees a change. Idempotent: a row
// already on the new address matches nothing. Run it twice and the second run finds 0.
//
//   node server/scripts/rewrite-media-host.js --from https://pub-xxxx.r2.dev --to https://atlas-media.bennettdishmanmedia.com
//                                  dry run (the default): counts per column, writes nothing
//   node server/scripts/rewrite-media-host.js --from ... --to ... --apply
//                                  one transaction: all three updates, or none
//
// --to defaults to R2_PUBLIC_URL and --from to the first of R2_LEGACY_PUBLIC_URLS. Both must be a
// bare https address (no path). It prints counts, never row contents. Needs DATABASE_URL only.
//
// Production data: take a pg_dump first and run it only with Bennett's OK, AFTER the custom
// domain answers (a rewritten URL that does not load is a broken image). Order: connect the domain
// to the bucket, set R2_PUBLIC_URL to it and R2_LEGACY_PUBLIC_URLS to the old address (deploy),
// run this, then remove R2_LEGACY_PUBLIC_URLS. Keep r2.dev enabled for a day more: undo
// snapshots (tombstones, 24 hours) still hold old addresses and are not rewritten.
const TARGETS = [
  { table: 'images', column: 'file_path' },
  { table: 'nodes', column: 'voice_url' },
  { table: 'maps', column: 'ambience_url' },
];
const MAX_LENGTH = 500; // all three columns are VARCHAR(500)

function bareOrigin(label, value) {
  let u;
  try { u = new URL(String(value || '')); } catch { throw new Error(`${label} must be a full https address, got "${value || ''}"`); }
  if (u.protocol !== 'https:' || u.pathname !== '/' || u.search || u.hash || u.username) {
    throw new Error(`${label} must be just an https address with no path (like https://atlas-media.example.com)`);
  }
  return u.origin;
}

// The tables' own SQL is fixed text: the addresses go in as parameters, never into the statement.
const countSql = ({ table, column }) =>
  `SELECT count(*) AS n, coalesce(max(length($2::text || substr(${column}, length($1::text) + 1))), 0) AS longest
     FROM ${table} WHERE left(${column}, length($1::text)) = $1::text`;
const updateSql = ({ table, column }) =>
  `UPDATE ${table} SET ${column} = $2::text || substr(${column}, length($1::text) + 1)
    WHERE left(${column}, length($1::text)) = $1::text`;

async function rewriteHost({ pool, from, to, apply = false, log = console.log }) {
  const oldBase = `${bareOrigin('--from', from)}/`;
  const newBase = `${bareOrigin('--to', to)}/`;
  if (oldBase === newBase) throw new Error('--from and --to are the same address');

  const counts = {};
  let total = 0;
  for (const t of TARGETS) {
    const r = (await pool.query(countSql(t), [oldBase, newBase])).rows[0];
    counts[`${t.table}.${t.column}`] = Number(r.n);
    total += Number(r.n);
    if (Number(r.longest) > MAX_LENGTH) throw new Error(`${t.table}.${t.column}: a rewritten URL would be ${r.longest} characters, over the column's ${MAX_LENGTH}`);
  }
  log(`rewriting ${oldBase} -> ${newBase}`);
  for (const [name, n] of Object.entries(counts)) log(`  ${name}: ${n} row(s)`);
  const out = { found: total, counts, updated: 0, remaining: null };
  if (!apply) {
    log('dry run: nothing written. Add --apply to rewrite them.');
    return out;
  }
  if (!total) { out.remaining = 0; log('nothing to do'); return out; }

  const client = await pool.connectTx();
  try {
    await client.query('BEGIN');
    for (const t of TARGETS) {
      const res = await client.query(updateSql(t), [oldBase, newBase]);
      const want = counts[`${t.table}.${t.column}`];
      if (res.rowCount !== want) throw new Error(`${t.table}.${t.column}: updated ${res.rowCount} row(s), expected ${want}; nothing changed`);
      out.updated += res.rowCount;
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  out.remaining = 0;
  for (const t of TARGETS) out.remaining += Number((await pool.query(countSql(t), [oldBase, newBase])).rows[0].n);
  log(`done: ${out.updated} row(s) rewritten; ${out.remaining} still on the old address`);
  return out;
}

module.exports = { rewriteHost, bareOrigin, TARGETS };

if (require.main === module) {
  require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const from = opt('--from') || (process.env.R2_LEGACY_PUBLIC_URLS || '').split(',')[0].trim();
  const to = opt('--to') || process.env.R2_PUBLIC_URL;
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set'); process.exit(2); }
  const pool = require('../config/database');
  rewriteHost({ pool, from, to, apply: args.includes('--apply') })
    .then((out) => { pool.end(); process.exit(out.remaining ? 1 : 0); })
    .catch((e) => { console.error(e.message); pool.end(); process.exit(2); });
}
