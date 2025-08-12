const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const router = express.Router();

// Generate JWT token
const generateToken = (userId) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is not set. Please set it in Railway dashboard.');
  }
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// POST /api/setup/init-admin - Create first admin user and run migration
router.post('/init-admin', async (req, res) => {
  try {
    // Check for required environment variables first
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        message: 'Server configuration error: JWT_SECRET is not set.',
        instructions: 'Please set the JWT_SECRET environment variable in Railway dashboard with a random 32+ character string.',
        example: 'JWT_SECRET=sk_abc123xyz789_your_very_long_random_string_here'
      });
    }

    if (!process.env.DATABASE_URL) {
      return res.status(500).json({
        message: 'Server configuration error: DATABASE_URL is not set.',
        instructions: 'Please add a PostgreSQL database addon in Railway dashboard.'
      });
    }

    const { username, email, password } = req.body;

    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    // Check if database is already initialized
    try {
      const existingUsers = await pool.query('SELECT COUNT(*) FROM users');
      if (parseInt(existingUsers.rows[0].count) > 0) {
        return res.status(409).json({ message: 'System already initialized. Please use normal login.' });
      }
    } catch (dbError) {
      // If tables don't exist, that's expected - we'll create them
      if (dbError.code !== '42P01') {
        throw dbError;
      }
    }

    // Run migration first
    console.log('🔄 Running initial migration for first admin setup...');
    
    const fs = require('fs');
    const path = require('path');
    
    // Read and execute schema file
    const schemaPath = path.join(__dirname, '../config/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Split by semicolon and execute each statement
    const statements = schema.split(';').filter(stmt => stmt.trim().length > 0);
    
    for (const statement of statements) {
      if (statement.trim()) {
        await pool.query(statement);
      }
    }

    console.log('✅ Database migration completed');

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create admin user (override any default admin from schema)
    await pool.query('DELETE FROM users WHERE username = $1', ['admin']);
    
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role, created_at',
      [username, email, hashedPassword, 'admin']
    );

    const user = result.rows[0];
    const token = generateToken(user.id);

    res.status(201).json({
      message: 'System initialized successfully! You are now logged in as admin.',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        createdAt: user.created_at
      },
      setupComplete: true
    });

  } catch (error) {
    console.error('Setup initialization error:', error);
    res.status(500).json({ 
      message: 'Failed to initialize system: ' + error.message,
      error: process.env.NODE_ENV === 'development' ? error.stack : 'Internal server error'
    });
  }
});

// GET /api/setup/status - Check if system needs setup
router.get('/status', async (req, res) => {
  try {
    // Check if users table exists and has data
    try {
      const result = await pool.query('SELECT COUNT(*) FROM users');
      const userCount = parseInt(result.rows[0].count);
      
      res.json({
        needsSetup: userCount === 0,
        userCount: userCount,
        message: userCount === 0 ? 'System needs initial setup' : 'System already initialized'
      });
    } catch (dbError) {
      if (dbError.code === '42P01') { // Table does not exist
        res.json({
          needsSetup: true,
          userCount: 0,
          message: 'Database needs migration and initial admin setup'
        });
      } else {
        throw dbError;
      }
    }
  } catch (error) {
    console.error('Setup status check error:', error);
    res.status(500).json({
      needsSetup: true,
      message: 'Unable to check setup status: ' + error.message
    });
  }
});

// POST /api/setup/migrate - Run specific migrations for existing databases
router.post('/migrate', async (req, res) => {
  try {
    console.log('🔄 Running database migrations...');
    
    // Add timeline fields to worlds table
    const worldTimelineFields = [
      'timeline_enabled BOOLEAN DEFAULT true',
      'timeline_min_time INTEGER DEFAULT 0', 
      'timeline_max_time INTEGER DEFAULT 100',
      'timeline_current_time INTEGER DEFAULT 50',
      'timeline_time_unit VARCHAR(50) DEFAULT \'years\''
    ];
    
    for (const field of worldTimelineFields) {
      try {
        const columnName = field.split(' ')[0];
        console.log(`Attempting to add column: ${columnName}`);
        await pool.query(`ALTER TABLE worlds ADD COLUMN ${field}`);
        console.log(`✅ Added ${columnName} column to worlds table`);
      } catch (error) {
        console.log(`Error adding ${field.split(' ')[0]}:`, error.message, error.code);
        if (error.code === '42701') { // Column already exists
          const columnName = field.split(' ')[0];
          console.log(`ℹ️ ${columnName} column already exists`);
        } else {
          console.error(`Failed to add column ${field.split(' ')[0]}:`, error);
          throw error;
        }
      }
    }
    
    // Migrate timeline_enabled from maps to worlds (if maps table has it)
    try {
      const mapTimelineCheck = await pool.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'maps' AND column_name = 'timeline_enabled'
      `);
      
      if (mapTimelineCheck.rows.length > 0) {
        // Copy timeline settings from maps to their worlds
        await pool.query(`
          UPDATE worlds 
          SET timeline_enabled = true 
          WHERE id IN (
            SELECT DISTINCT world_id 
            FROM maps 
            WHERE timeline_enabled = true
          )
        `);
        console.log('✅ Migrated timeline settings from maps to worlds');
        
        // Remove timeline_enabled from maps table
        await pool.query('ALTER TABLE maps DROP COLUMN timeline_enabled');
        console.log('✅ Removed timeline_enabled column from maps table');
      }
    } catch (error) {
      console.log('ℹ️ Map timeline migration completed or not needed');
    }
    
    // Add timeline_enabled to events table for individual node timeline control
    try {
      await pool.query('ALTER TABLE events ADD COLUMN timeline_enabled BOOLEAN DEFAULT false');
      console.log('✅ Added timeline_enabled column to events table');
    } catch (error) {
      if (error.code === '42701') { // Column already exists
        console.log('ℹ️ timeline_enabled column already exists in events table');
      } else {
        console.error('Failed to add timeline_enabled to events table:', error);
        throw error;
      }
    }
    
    // Create or update map_timeline_images table for timeline-based map backgrounds WITH positioning
    console.log('🔄 Setting up map_timeline_images table with positioning support...')
    
    // First, try to create the full table with positioning columns
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS map_timeline_images (
          id SERIAL PRIMARY KEY,
          map_id INTEGER REFERENCES maps(id) ON DELETE CASCADE,
          image_id INTEGER REFERENCES images(id) ON DELETE CASCADE,
          start_time INTEGER NOT NULL DEFAULT 0,
          end_time INTEGER NOT NULL DEFAULT 100,
          is_default BOOLEAN DEFAULT false,
          position_x DECIMAL(5,2) DEFAULT 0.0,
          position_y DECIMAL(5,2) DEFAULT 0.0,
          scale DECIMAL(3,2) DEFAULT 1.0,
          object_fit VARCHAR(20) DEFAULT 'cover',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(map_id, image_id)
        )
      `);
      console.log('✅ Created map_timeline_images table with positioning columns');
    } catch (error) {
      if (error.code === '42P07') {
        console.log('ℹ️ map_timeline_images table already exists - checking for positioning columns');
      } else {
        console.error('Failed to create map_timeline_images table:', error);
        throw error;
      }
    }
    
    // Always try to add positioning columns (in case table existed without them)
    console.log('🔄 Ensuring positioning columns exist...')
    
    const columnsToAdd = [
      'position_x DECIMAL(5,2) DEFAULT 0.0',
      'position_y DECIMAL(5,2) DEFAULT 0.0',
      'scale DECIMAL(3,2) DEFAULT 1.0',
      'object_fit VARCHAR(20) DEFAULT \'cover\''
    ]
    
    for (const columnDef of columnsToAdd) {
      const columnName = columnDef.split(' ')[0]
      try {
        await pool.query(`ALTER TABLE map_timeline_images ADD COLUMN IF NOT EXISTS ${columnDef}`)
        console.log(`✅ Ensured column exists: ${columnName}`)
      } catch (err) {
        // PostgreSQL doesn't support IF NOT EXISTS for ADD COLUMN, so try the old way
        try {
          await pool.query(`ALTER TABLE map_timeline_images ADD COLUMN ${columnDef}`)
          console.log(`✅ Added column: ${columnName}`)
        } catch (err2) {
          if (err2.code === '42701') { // Column already exists
            console.log(`⏭️ Column ${columnName} already exists`)
          } else {
            console.log(`❌ Failed to add column ${columnName}:`, err2.message)
            throw err2
          }
        }
      }
    }
    
    console.log('✅ Map timeline images table ready with positioning support')
    
    // Remove check constraints on event position columns for infinite grid support
    console.log('🔄 Removing coordinate constraints for infinite grid support...')
    try {
      await pool.query('ALTER TABLE events DROP CONSTRAINT IF EXISTS events_x_position_check')
      console.log('✅ Removed x_position check constraint')
    } catch (error) {
      console.log('ℹ️ x_position check constraint removal:', error.message)
    }
    
    try {
      await pool.query('ALTER TABLE events DROP CONSTRAINT IF EXISTS events_y_position_check')
      console.log('✅ Removed y_position check constraint')
    } catch (error) {
      console.log('ℹ️ y_position check constraint removal:', error.message)
    }
    
    // Convert coordinate storage from percentages to pixels
    console.log('🔄 Converting coordinate system to pixel-based...')
    
    // Add new pixel coordinate columns to events table
    const eventPixelColumns = [
      'x_pixel INTEGER DEFAULT 0',
      'y_pixel INTEGER DEFAULT 0'
    ]
    
    for (const columnDef of eventPixelColumns) {
      const columnName = columnDef.split(' ')[0]
      try {
        await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS ${columnDef}`)
        console.log(`✅ Added ${columnName} column to events table`)
      } catch (err) {
        try {
          await pool.query(`ALTER TABLE events ADD COLUMN ${columnDef}`)
          console.log(`✅ Added ${columnName} column to events table`)
        } catch (err2) {
          if (err2.code === '42701') {
            console.log(`⏭️ Column ${columnName} already exists`)
          } else {
            console.log(`❌ Failed to add column ${columnName}:`, err2.message)
            throw err2
          }
        }
      }
    }
    
    // Add new pixel coordinate columns to map_timeline_images table
    const imagePixelColumns = [
      'x_pixel INTEGER DEFAULT 0',
      'y_pixel INTEGER DEFAULT 0'
    ]
    
    for (const columnDef of imagePixelColumns) {
      const columnName = columnDef.split(' ')[0]
      try {
        await pool.query(`ALTER TABLE map_timeline_images ADD COLUMN IF NOT EXISTS ${columnDef}`)
        console.log(`✅ Added ${columnName} column to map_timeline_images table`)
      } catch (err) {
        try {
          await pool.query(`ALTER TABLE map_timeline_images ADD COLUMN ${columnDef}`)
          console.log(`✅ Added ${columnName} column to map_timeline_images table`)
        } catch (err2) {
          if (err2.code === '42701') {
            console.log(`⏭️ Column ${columnName} already exists`)
          } else {
            console.log(`❌ Failed to add column ${columnName}:`, err2.message)
            throw err2
          }
        }
      }
    }
    
    console.log('✅ Pixel coordinate system migration completed')
    
    // Fix event_type constraint to support background_map nodes
    console.log('🔄 Updating event_type constraint to support background_map...')
    try {
      await pool.query('ALTER TABLE events DROP CONSTRAINT IF EXISTS events_event_type_check')
      console.log('✅ Dropped old event_type constraint')
      
      await pool.query(`
        ALTER TABLE events ADD CONSTRAINT events_event_type_check 
        CHECK (event_type IN ('standard', 'map_link', 'character', 'location', 'background_map'))
      `)
      console.log('✅ Added updated event_type constraint with background_map support')
    } catch (error) {
      console.log('❌ Failed to update event_type constraint:', error.message)
      // Don't throw - this shouldn't stop the migration
    }
    
    // Check table counts for response
    const tablesResult = await pool.query(`
      SELECT COUNT(*) as table_count 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    `);
    
    res.json({
      message: 'Database migrations completed successfully! Added worlds table, world_id columns, default world, and image positioning support.',
      tablesFound: parseInt(tablesResult.rows[0].table_count),
      migrationsRun: [
        'Timeline fields added to worlds table',
        'Timeline settings migrated from maps to worlds', 
        'World-level timeline system enabled',
        'Image positioning columns added to map_timeline_images table',
        'Visual alignment tools for background images',
        'Event type constraint updated to support background_map nodes'
      ]
    });
    
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ 
      message: 'Failed to run migrations: ' + error.message 
    });
  }
});

// POST /api/setup/fix-constraint - Fix event_type constraint specifically
router.post('/fix-constraint', async (req, res) => {
  try {
    console.log('🔧 Running constraint fix...');
    
    // Check current constraint
    const currentConstraint = await pool.query(`
      SELECT conname, pg_get_constraintdef(oid) as definition
      FROM pg_constraint 
      WHERE conname = 'events_event_type_check'
    `);
    
    console.log('Current constraint:', currentConstraint.rows);
    
    // Drop old constraint
    await pool.query('ALTER TABLE events DROP CONSTRAINT IF EXISTS events_event_type_check');
    console.log('✅ Dropped old constraint');
    
    // Add new constraint
    await pool.query(`
      ALTER TABLE events ADD CONSTRAINT events_event_type_check 
      CHECK (event_type IN ('standard', 'map_link', 'character', 'location', 'background_map'))
    `);
    console.log('✅ Added new constraint with background_map support');
    
    // Verify the fix
    const newConstraint = await pool.query(`
      SELECT conname, pg_get_constraintdef(oid) as definition
      FROM pg_constraint 
      WHERE conname = 'events_event_type_check'
    `);
    
    console.log('New constraint:', newConstraint.rows);
    
    res.json({
      message: 'Constraint fixed successfully! You can now save background_map nodes.',
      oldConstraint: currentConstraint.rows[0]?.definition || 'Not found',
      newConstraint: newConstraint.rows[0]?.definition || 'Error creating constraint',
      success: true
    });
    
  } catch (error) {
    console.error('Constraint fix error:', error);
    res.status(500).json({ 
      message: 'Failed to fix constraint: ' + error.message,
      success: false
    });
  }
});

// POST /api/setup/add-locked-field - Add locked column to events table
router.post('/add-locked-field', async (req, res) => {
  try {
    console.log('🔒 Running locked field migration...');
    
    // Check if locked column already exists
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'events' AND column_name = 'locked'
    `);
    
    if (columnCheck.rows.length > 0) {
      return res.json({
        message: 'Locked field already exists! Lock position feature is ready to use.',
        success: true,
        alreadyExists: true
      });
    }
    
    // Add the locked column
    await pool.query('ALTER TABLE events ADD COLUMN locked BOOLEAN DEFAULT false');
    console.log('✅ Added locked column to events table');
    
    // Verify the column was added
    const verifyColumn = await pool.query(`
      SELECT column_name, column_default, is_nullable, data_type
      FROM information_schema.columns 
      WHERE table_name = 'events' AND column_name = 'locked'
    `);
    
    if (verifyColumn.rows.length === 0) {
      throw new Error('Failed to add locked column - verification failed');
    }
    
    const columnInfo = verifyColumn.rows[0];
    console.log('📊 Column details:', columnInfo);
    
    res.json({
      message: 'Lock position feature added successfully!',
      success: true,
      columnAdded: true,
      details: {
        columnName: columnInfo.column_name,
        dataType: columnInfo.data_type,
        defaultValue: columnInfo.column_default,
        nullable: columnInfo.is_nullable
      }
    });
    
  } catch (error) {
    console.error('Locked field migration error:', error);
    res.status(500).json({ 
      message: 'Failed to add lock position feature: ' + error.message,
      success: false,
      error: error.code || 'Unknown error'
    });
  }
});

// POST /api/setup/expand-tooltip-field - Expand tooltip_text field from VARCHAR(255) to TEXT
router.post('/expand-tooltip-field', async (req, res) => {
  try {
    console.log('📝 Running tooltip_text field expansion migration...');
    
    // Check current column type
    const columnCheck = await pool.query(`
      SELECT column_name, data_type, character_maximum_length 
      FROM information_schema.columns 
      WHERE table_name = 'events' AND column_name = 'tooltip_text'
    `);
    
    if (columnCheck.rows.length === 0) {
      return res.status(400).json({
        message: 'tooltip_text column not found in events table',
        success: false
      });
    }
    
    const currentColumn = columnCheck.rows[0];
    
    // Check if already TEXT type
    if (currentColumn.data_type === 'text') {
      return res.json({
        message: 'tooltip_text field is already TEXT type! Connection data storage is ready.',
        success: true,
        alreadyExpanded: true,
        details: {
          currentType: currentColumn.data_type,
          maxLength: currentColumn.character_maximum_length || 'unlimited'
        }
      });
    }
    
    // Create backup first
    console.log('💾 Creating backup table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS events_backup_tooltip_migration AS 
      SELECT * FROM events
    `);
    console.log('✅ Backup table created: events_backup_tooltip_migration');
    
    // Expand the column
    console.log('🔄 Expanding tooltip_text from VARCHAR(255) to TEXT...');
    await pool.query('ALTER TABLE events ALTER COLUMN tooltip_text TYPE TEXT');
    
    // Add comment
    await pool.query(`
      COMMENT ON COLUMN events.tooltip_text IS 
      'JSON metadata for node including dimensions, connections, and node type. Expanded from VARCHAR(255) to TEXT to support larger metadata.'
    `);
    
    // Verify the change
    const verifyColumn = await pool.query(`
      SELECT column_name, data_type, character_maximum_length 
      FROM information_schema.columns 
      WHERE table_name = 'events' AND column_name = 'tooltip_text'
    `);
    
    if (verifyColumn.rows.length === 0 || verifyColumn.rows[0].data_type !== 'text') {
      throw new Error('Failed to expand tooltip_text column - verification failed');
    }
    
    const newColumnInfo = verifyColumn.rows[0];
    console.log('📊 Updated column details:', newColumnInfo);
    
    res.json({
      message: 'tooltip_text field expanded successfully! You can now save nodes with connection data.',
      success: true,
      columnExpanded: true,
      migration: {
        from: `${currentColumn.data_type}(${currentColumn.character_maximum_length})`,
        to: `${newColumnInfo.data_type} (unlimited)`,
        backupTable: 'events_backup_tooltip_migration'
      },
      details: {
        columnName: newColumnInfo.column_name,
        dataType: newColumnInfo.data_type,
        maxLength: newColumnInfo.character_maximum_length || 'unlimited'
      }
    });
    
  } catch (error) {
    console.error('tooltip_text expansion migration error:', error);
    res.status(500).json({ 
      message: 'Failed to expand tooltip_text field: ' + error.message,
      success: false,
      error: error.code || 'Unknown error'
    });
  }
});

// POST /api/setup/enable-folders - Enable custom folder system (public endpoint)
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
    console.error('❌ Failed to enable folders:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to enable custom folder system: ' + error.message,
      error: process.env.NODE_ENV === 'development' ? error.stack : 'Internal server error'
    });
  }
});

module.exports = router;