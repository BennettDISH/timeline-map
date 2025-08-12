const express = require('express');
const pool = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const runMigration = require('../config/migrate');
const router = express.Router();

// All admin routes require authentication and admin role
router.use(authenticateToken);
router.use(requireAdmin);

// POST /api/admin/enable-folders - Enable custom folder system (admin only)
router.post('/enable-folders', async (req, res) => {
  try {
    console.log('🗂️ Enabling custom folder system...');
    
    // Step 1: Create custom folders table
    console.log('Creating image_folders table...')
    await pool.query(`
      CREATE TABLE IF NOT EXISTS image_folders (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        parent_id INTEGER REFERENCES image_folders(id) ON DELETE CASCADE,
        world_id INTEGER REFERENCES worlds(id) ON DELETE CASCADE NOT NULL,
        created_by INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        color VARCHAR(7) DEFAULT '#4CAF50',
        icon VARCHAR(10) DEFAULT '📁',
        UNIQUE(name, world_id, parent_id)
      )
    `)
    
    console.log('Creating indexes for image_folders...')
    await pool.query('CREATE INDEX IF NOT EXISTS idx_image_folders_world ON image_folders(world_id)')
    await pool.query('CREATE INDEX IF NOT EXISTS idx_image_folders_parent ON image_folders(parent_id)')
    await pool.query('CREATE INDEX IF NOT EXISTS idx_image_folders_created_by ON image_folders(created_by)')
    
    // Step 2: Add folder_id column to images table
    console.log('Adding folder_id column to images table...')
    try {
      await pool.query('ALTER TABLE images ADD COLUMN folder_id INTEGER REFERENCES image_folders(id) ON DELETE SET NULL')
      await pool.query('CREATE INDEX IF NOT EXISTS idx_images_folder ON images(folder_id)')
      console.log('✅ Added folder_id column to images table')
    } catch (err) {
      if (err.code === '42701') { // Column already exists
        console.log('✅ folder_id column already exists in images table')
      } else throw err
    }

    // Step 3: Verify tables were created
    const tableCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'image_folders'
    `)
    
    if (tableCheck.rows.length === 0) {
      throw new Error('Failed to create image_folders table')
    }

    console.log('✅ Custom folder system enabled successfully!');
    
    res.json({
      success: true,
      message: '✅ Custom folder system enabled! You can now create hierarchical folders for organizing your images.',
      details: {
        tablesCreated: ['image_folders'],
        columnsAdded: ['images.folder_id'],
        indexesCreated: ['idx_image_folders_world', 'idx_image_folders_parent', 'idx_image_folders_created_by', 'idx_images_folder']
      }
    })
    
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