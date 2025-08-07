const { Pool } = require('pg');

// Database configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function fixEventTypeConstraint() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Checking current constraint...');
    
    // Check current constraint
    const constraintCheck = await client.query(`
      SELECT conname, pg_get_constraintdef(oid) as definition
      FROM pg_constraint 
      WHERE conname = 'events_event_type_check'
    `);
    
    console.log('Current constraint:', constraintCheck.rows);
    
    console.log('🗑️ Dropping old constraint...');
    await client.query('ALTER TABLE events DROP CONSTRAINT IF EXISTS events_event_type_check');
    
    console.log('➕ Adding updated constraint...');
    await client.query(`
      ALTER TABLE events ADD CONSTRAINT events_event_type_check 
      CHECK (event_type IN ('standard', 'map_link', 'character', 'location', 'background_map'))
    `);
    
    console.log('✅ Constraint updated successfully');
    
    // Verify the update
    const newConstraintCheck = await client.query(`
      SELECT conname, pg_get_constraintdef(oid) as definition
      FROM pg_constraint 
      WHERE conname = 'events_event_type_check'
    `);
    
    console.log('New constraint:', newConstraintCheck.rows);
    
  } catch (error) {
    console.error('❌ Error updating constraint:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

fixEventTypeConstraint()
  .then(() => {
    console.log('🎉 Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  });