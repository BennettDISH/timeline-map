const fs = require('fs');
const path = require('path');
const pool = require('./database');

async function runMigration() {
  try {
    console.log('🔄 Starting database migration...');
    
    // Read and execute schema file
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Split by semicolon and execute each statement
    const statements = schema.split(';').filter(stmt => stmt.trim().length > 0);
    
    for (const statement of statements) {
      if (statement.trim()) {
        console.log('Executing:', statement.substring(0, 50) + '...');
        await pool.query(statement);
      }
    }
    
    console.log('✅ Database migration completed successfully!');

    // Report the tables that actually exist. The previous hand-written list had drifted from
    // schema.sql: it advertised a long-dead `events` table and named only 4 of the 15 tables.
    const tables = await pool.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
    );
    console.log(`📊 Tables in database (${tables.rows.length}):`);
    for (const { tablename } of tables.rows) {
      console.log(`  - ${tablename}`);
    }
    
    // Test connection
    const result = await pool.query('SELECT COUNT(*) FROM users');
    console.log(`👤 Users in database: ${result.rows[0].count}`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Full error:', error);
  } finally {
    process.exit(0);
  }
}

// Run migration if called directly
if (require.main === module) {
  runMigration();
}

module.exports = runMigration;