const express = require('express');
const pool = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const runMigration = require('../config/migrate');
const router = express.Router();

// All admin routes require authentication and admin role
router.use(authenticateToken);
router.use(requireAdmin);

// POST /api/admin/migrate - Run database migration
router.post('/migrate', async (req, res) => {
  try {
    console.log('🔄 Admin triggered database migration');
    
    // Capture console output
    const originalLog = console.log;
    const originalError = console.error;
    let output = [];
    
    console.log = (...args) => {
      output.push(args.join(' '));
      originalLog(...args);
    };
    
    console.error = (...args) => {
      output.push('ERROR: ' + args.join(' '));
      originalError(...args);
    };
    
    try {
      // Run migration without exiting process
      const fs = require('fs');
      const path = require('path');
      
      console.log('🔄 Starting database migration...');
      
      // Step 1: Create worlds table
      console.log('Creating worlds table...');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS worlds (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          created_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          is_active BOOLEAN DEFAULT true,
          settings JSONB DEFAULT '{}'
        )
      `);
      
      // Step 2: Add world_id columns to existing tables
      console.log('Adding world_id column to images table...');
      try {
        await pool.query('ALTER TABLE images ADD COLUMN world_id INTEGER REFERENCES worlds(id) ON DELETE CASCADE');
      } catch (err) {
        if (err.code === '42701') { // Column already exists
          console.log('world_id column already exists in images table');
        } else throw err;
      }
      
      console.log('Adding world_id column to maps table...');
      try {
        await pool.query('ALTER TABLE maps ADD COLUMN world_id INTEGER REFERENCES worlds(id) ON DELETE CASCADE');
      } catch (err) {
        if (err.code === '42701') { // Column already exists
          console.log('world_id column already exists in maps table');
        } else throw err;
      }
      
      console.log('Adding world_id column to timeline_settings table...');
      try {
        await pool.query('ALTER TABLE timeline_settings ADD COLUMN world_id INTEGER REFERENCES worlds(id) ON DELETE CASCADE');
      } catch (err) {
        if (err.code === '42701') { // Column already exists
          console.log('world_id column already exists in timeline_settings table');
        } else throw err;
      }
      
      // Step 3: Create indexes
      console.log('Creating indexes...');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_worlds_created_by ON worlds(created_by)');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_images_world ON images(world_id)');
      await pool.query('CREATE INDEX IF NOT EXISTS idx_maps_world ON maps(world_id)');
      
      // Step 4: Create default world and assign existing data
      console.log('Creating default world...');
      const defaultWorldResult = await pool.query(`
        INSERT INTO worlds (name, description, created_by, settings)
        SELECT 'Default World', 'Automatically created for existing data', 1, '{}'::jsonb
        WHERE NOT EXISTS (SELECT 1 FROM worlds WHERE name = 'Default World')
        AND EXISTS (SELECT 1 FROM users WHERE id = 1)
        RETURNING id
      `);
      
      if (defaultWorldResult.rows.length > 0) {
        const defaultWorldId = defaultWorldResult.rows[0].id;
        console.log(`Created default world with ID: ${defaultWorldId}`);
        
        // Update existing data
        await pool.query('UPDATE images SET world_id = $1 WHERE world_id IS NULL', [defaultWorldId]);
        await pool.query('UPDATE maps SET world_id = $1 WHERE world_id IS NULL', [defaultWorldId]);
        await pool.query('UPDATE timeline_settings SET world_id = $1 WHERE world_id IS NULL', [defaultWorldId]);
        console.log('Assigned existing data to default world');
      } else {
        console.log('Default world already exists or no admin user found');
      }
      
      console.log('✅ Database migration completed successfully!');
      console.log('📊 Migration added: worlds table, world_id columns, default world for existing data');
      
      // Test connection
      const result = await pool.query('SELECT COUNT(*) FROM users');
      console.log(`👤 Users in database: ${result.rows[0].count}`);
      
      // Restore console
      console.log = originalLog;
      console.error = originalError;
      
      res.json({
        success: true,
        message: 'Database migration completed successfully!',
        output: output.join('\n'),
        userCount: result.rows[0].count
      });
      
    } catch (migrationError) {
      // Restore console
      console.log = originalLog;
      console.error = originalError;
      
      throw migrationError;
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    res.status(500).json({
      success: false,
      message: 'Migration failed: ' + error.message,
      error: process.env.NODE_ENV === 'development' ? error.stack : 'Internal server error'
    });
  }
});

// GET /api/admin/db-status - Check database status
router.get('/db-status', async (req, res) => {
  try {
    // Test basic connection
    await pool.query('SELECT NOW()');
    
    // Check if tables exist
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    const tables = tablesResult.rows.map(row => row.table_name);
    const expectedTables = ['users', 'worlds', 'images', 'maps', 'events', 'timeline_settings', 'user_sessions'];
    const missingTables = expectedTables.filter(table => !tables.includes(table));
    
    // Get user count
    let userCount = 0;
    if (tables.includes('users')) {
      const userResult = await pool.query('SELECT COUNT(*) FROM users');
      userCount = parseInt(userResult.rows[0].count);
    }
    
    res.json({
      success: true,
      message: `Database connected successfully. ${tables.length} tables found.`,
      details: {
        tablesFound: tables,
        missingTables: missingTables,
        userCount: userCount,
        needsMigration: missingTables.length > 0
      }
    });
    
  } catch (error) {
    console.error('Database status check failed:', error);
    res.status(500).json({
      success: false,
      message: 'Database connection failed: ' + error.message,
      details: {
        error: error.code || 'Unknown error',
        hint: 'Check if DATABASE_URL is set correctly in Railway'
      }
    });
  }
});

// GET /api/admin/users - List all users
router.get('/users', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, username, email, role, created_at, updated_at 
      FROM users 
      ORDER BY created_at DESC
    `);
    
    res.json({
      success: true,
      users: result.rows
    });
    
  } catch (error) {
    console.error('Get users failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users: ' + error.message
    });
  }
});

module.exports = router;