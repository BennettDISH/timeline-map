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
    
    // Add timeline_enabled column if it doesn't exist
    try {
      await pool.query('ALTER TABLE maps ADD COLUMN timeline_enabled BOOLEAN DEFAULT false');
      console.log('✅ Added timeline_enabled column to maps table');
    } catch (error) {
      if (error.code === '42701') { // Column already exists
        console.log('ℹ️ timeline_enabled column already exists');
      } else {
        throw error;
      }
    }
    
    // Check table counts for response
    const tablesResult = await pool.query(`
      SELECT COUNT(*) as table_count 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    `);
    
    res.json({
      message: 'Database migrations completed successfully',
      tablesFound: parseInt(tablesResult.rows[0].table_count),
      migrationsRun: [
        'timeline_enabled column added to maps table'
      ]
    });
    
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ 
      message: 'Failed to run migrations: ' + error.message 
    });
  }
});

module.exports = router;