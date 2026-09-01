const pool = require('./database');
const { applySchema } = require('./apply-schema');

async function runMigration() {
  let ok = false;
  try {
    console.log('🔄 Starting database migration...');

    // Shares the boot-path schema loader (config/apply-schema.js) so this script and server.js
    // can never drift apart again — the split fix landed on the boot path only, and for a long
    // while `npm run migrate` aborted a third of the way through schema.sql.
    const { total, applied, failed } = await applySchema(pool, {
      onError: (statement, e) =>
        console.error(`  ⚠️  ${statement.split('\n')[0].slice(0, 60)} — ${e.message}`),
    });

    console.log(`📊 ${applied}/${total} statements applied.`);
    if (failed.length) {
      console.error(`❌ Migration incomplete: ${failed.length} statement(s) failed (see above).`);
    } else {
      console.log('✅ Database migration completed successfully!');
      ok = true;
    }

    // Test connection
    const result = await pool.query('SELECT COUNT(*) FROM users');
    console.log(`👤 Users in database: ${result.rows[0].count}`);
  } catch (error) {
    ok = false;
    console.error('❌ Migration failed:', error.message);
    console.error('Full error:', error);
  } finally {
    // Exit non-zero when anything failed, so a broken migration cannot look like a clean setup step.
    process.exit(ok ? 0 : 1);
  }
}

// Run migration if called directly
if (require.main === module) {
  runMigration();
}

module.exports = runMigration;
