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
    console.log('📊 Tables created:');
    console.log('  - users (authentication)');
    console.log('  - images (file management)');
    console.log('  - maps (hierarchical maps)');
    console.log('  - events (timeline events)');
    console.log('  - timeline_settings (timeline config)');
    console.log('  - user_sessions (session management)');
    
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