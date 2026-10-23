#!/usr/bin/env node
// One-off: copy the old image rows that still hold their bytes in Postgres (images.base64_data)
// to R2, so the column can be dropped later. Idempotent: it only touches rows that still have
// base64_data, and a row is cleared only after its object is on R2 with the right size.
//
//   node server/scripts/move-base64-to-r2.js                 dry run (the default): counts and
//                                                            sizes per world, writes nothing
//   node server/scripts/move-base64-to-r2.js --apply         copy each row, then point it at R2
//   node server/scripts/move-base64-to-r2.js --apply --limit 5
//
// Apply needs DATABASE_URL and the five R2_* variables (the same ones the server uses). Per row:
// put worlds/<world_id>/moved-<id>-<filename>, check the object's size, then set file_path to its
// R2 URL, storage_key to the key and base64_data to NULL. The old /api/images-base64/serve/<file>
// links keep working (that route redirects a row without bytes to its R2 URL). Rows without a
// world are listed and left alone. It prints counts and keys, never image contents.
//
// Production data: take a pg_dump first and run it only with Bennett's OK. The column itself is
// dropped in a later change, once this has run and the count is 0.
const DATA_URL = /^data:([^;,]+);base64,(.+)$/s;

// The rows that still hold bytes: ids and sizes only, never the bytes themselves.
async function pending(pool, limit) {
  const sql = `SELECT id, world_id, filename, mime_type, length(base64_data) AS chars FROM images
               WHERE base64_data IS NOT NULL ORDER BY id${Number.isFinite(limit) ? ' LIMIT $1' : ''}`;
  return (await pool.query(sql, Number.isFinite(limit) ? [limit] : [])).rows;
}

async function moveRows({ pool, storage, apply = false, limit = Infinity, log = console.log }) {
  const rows = await pending(pool, limit);
  const out = { found: rows.length, moved: 0, skipped: 0, failed: 0, bytes: 0, remaining: null };
  const worlds = new Map();
  for (const r of rows) worlds.set(r.world_id, (worlds.get(r.world_id) || 0) + 1);
  const approx = rows.reduce((n, r) => n + Math.floor(Number(r.chars) * 3 / 4), 0);
  log(`${rows.length} image row(s) still hold base64_data, about ${(approx / 1048576).toFixed(2)} MB, in ${worlds.size} world(s)`);
  for (const [w, n] of worlds) log(`  world ${w ?? '(none)'}: ${n}`);
  if (!apply) {
    log('dry run: nothing written. Add --apply to copy them to R2.');
    out.skipped = rows.length;
    return out;
  }
  if (!storage.r2Enabled) throw new Error('R2 is not configured (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL)');

  for (const r of rows) {
    try {
      if (r.world_id == null) { out.skipped += 1; log(`  image ${r.id}: skipped, it belongs to no world`); continue; }
      const row = (await pool.query('SELECT id, world_id, filename, mime_type, base64_data FROM images WHERE id = $1 AND base64_data IS NOT NULL', [r.id])).rows[0];
      if (!row) { out.skipped += 1; continue; } // moved or deleted since the list was read
      const m = DATA_URL.exec(row.base64_data);
      const buffer = Buffer.from(m ? m[2] : row.base64_data, 'base64');
      if (!buffer.length) { out.skipped += 1; log(`  image ${row.id}: skipped, no readable bytes`); continue; }
      const key = `worlds/${row.world_id}/moved-${row.id}-${String(row.filename).replace(/[^A-Za-z0-9._-]/g, '_')}`;
      const url = await storage.putObject(key, buffer, row.mime_type || (m && m[1]) || 'application/octet-stream');
      const size = await storage.objectSize(key);
      if (size !== buffer.length) {
        out.failed += 1;
        log(`  image ${row.id}: NOT moved, ${key} has ${size} byte(s) on R2, expected ${buffer.length}`);
        continue;
      }
      const res = await pool.query('UPDATE images SET file_path = $1, storage_key = $2, base64_data = NULL WHERE id = $3 AND base64_data IS NOT NULL', [url, key, row.id]);
      if (!res.rowCount) { await storage.deleteObject(key).catch(() => {}); out.skipped += 1; continue; }
      out.moved += 1; out.bytes += buffer.length;
      log(`  image ${row.id}: moved to ${key} (${buffer.length} bytes)`);
    } catch (e) {
      out.failed += 1;
      log(`  image ${r.id}: failed, ${e.message}`);
    }
  }
  out.remaining = Number((await pool.query('SELECT count(*) AS n FROM images WHERE base64_data IS NOT NULL')).rows[0].n);
  log(`done: ${out.moved} moved (${(out.bytes / 1048576).toFixed(2)} MB), ${out.skipped} skipped, ${out.failed} failed; ${out.remaining} row(s) still hold base64_data`);
  return out;
}

module.exports = { moveRows };

if (require.main === module) {
  require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
  const args = process.argv.slice(2);
  const li = args.indexOf('--limit');
  const limit = li >= 0 ? Number(args[li + 1]) : Infinity;
  if (li >= 0 && !(limit > 0)) { console.error('--limit takes a positive number'); process.exit(2); }
  const pool = require('../config/database');
  moveRows({ pool, storage: require('../storage'), apply: args.includes('--apply'), limit })
    .then((out) => { pool.end(); process.exit(out.failed ? 1 : 0); })
    .catch((e) => { console.error(e.message); pool.end(); process.exit(1); });
}
