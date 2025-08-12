const fs = require('fs');
const path = require('path');
const pool = require('./database');

async function runTooltipMigration() {
  try {
    console.log('🔄 Starting tooltip_text field expansion migration...');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, 'migration_expand_tooltip_text.sql');
    const migration = fs.readFileSync(migrationPath, 'utf8');
    
    // Execute the migration
    console.log('📝 Executing tooltip_text expansion migration...');
    await pool.query(migration);
    
    // Verify the change
    const result = await pool.query(`
      SELECT column_name, data_type, character_maximum_length 
      FROM information_schema.columns 
      WHERE table_name = 'events' AND column_name = 'tooltip_text'
    `);
    
    if (result.rows.length > 0) {
      const column = result.rows[0];
      console.log('✅ Migration completed successfully!');
      console.log(`📊 Column details:`, {
        name: column.column_name,
        type: column.data_type,
        maxLength: column.character_maximum_length || 'unlimited'
      });
    } else {
      throw new Error('Could not verify column after migration');
    }
    
    console.log('🎉 tooltip_text field can now store large JSON metadata including connections!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Full error:', error);
    
    // Check if backup exists
    try {
      const backupCheck = await pool.query(`
        SELECT COUNT(*) FROM information_schema.tables 
        WHERE table_name = 'events_backup_tooltip_migration'
      `);
      if (backupCheck.rows[0].count > 0) {
        console.log('💾 Backup table "events_backup_tooltip_migration" exists for recovery if needed');
      }
    } catch (backupError) {
      console.error('Could not check for backup table:', backupError.message);
    }
  } finally {
    process.exit(0);
  }
}

// Run migration if called directly
if (require.main === module) {
  runTooltipMigration();
}

module.exports = runTooltipMigration;