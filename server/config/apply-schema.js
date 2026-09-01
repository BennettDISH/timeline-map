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
  return { total: statements.length, applied, failed };
}

module.exports = { readStatements, applySchema };
