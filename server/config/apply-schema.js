const fs = require('fs');
const path = require('path');

// Single source of truth for turning schema.sql into executed statements. Both the boot-time
// ensure in server.js and `npm run migrate` go through here on purpose: the comment strip below
// was fixed once on the boot path and never back-ported, which left `npm run migrate` broken.
//
// Comment lines must be stripped BEFORE splitting on ';' — a semicolon inside a `--` comment
// shears the statement that follows it into unparseable fragments (9 of them in this schema).
function readStatements(schemaPath = path.join(__dirname, 'schema.sql')) {
  const sql = fs.readFileSync(schemaPath, 'utf8');
  const cleaned = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  return cleaned.split(';').map((s) => s.trim()).filter(Boolean);
}

// Runs every statement, tolerating per-statement failures: schema.sql is idempotent
// (CREATE/ALTER ... IF NOT EXISTS), so one bad statement is information, not a reason to abort
// and leave every later table uncreated. Returns counts so callers can report honestly.
async function applySchema(pool, { onError } = {}) {
  const statements = readStatements();
  let applied = 0;
  const failed = [];
  for (const statement of statements) {
    try {
      await pool.query(statement);
      applied += 1;
    } catch (e) {
      failed.push({ statement, message: e.message });
      if (onError) onError(statement, e);
    }
  }
  try {
    await dropOldImageBytes(pool);
  } catch (e) {
    failed.push({ statement: DROP_OLD_BYTES, message: e.message });
    if (onError) onError(DROP_OLD_BYTES, e);
  }
  return { total: statements.length, applied, failed };
}

// Images live on R2 only, so the column that held the old base64 goes. A row still holding bytes
// keeps the column and is reported as a failed step. This sits here and not in schema.sql because
// a check needs a DO block, and readStatements would shear one apart at its semicolons.
const DROP_OLD_BYTES = 'ALTER TABLE images DROP COLUMN base64_data';
async function dropOldImageBytes(pool) {
  const column = await pool.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'images' AND column_name = 'base64_data'`);
  if (!column.rows.length) return;
  const held = await pool.query('SELECT count(*)::int AS n FROM images WHERE base64_data IS NOT NULL');
  if (held.rows[0].n) throw new Error(`${held.rows[0].n} image row(s) still hold base64_data; not dropping it`);
  await pool.query(DROP_OLD_BYTES);
}

module.exports = { readStatements, applySchema };
