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
      
      // Read and execute schema file
      const schemaPath = path.join(__dirname, '../config/schema.sql');
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
      console.log('📊 Tables created: users, worlds, images, maps, events, timeline_settings, user_sessions');
      
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