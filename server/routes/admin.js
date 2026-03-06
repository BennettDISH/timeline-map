const express = require('express');
const pool = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// All admin routes require authentication and admin role
router.use(authenticateToken);
router.use(requireAdmin);

// GET /api/admin/db-status - Check database status
router.get('/db-status', async (req, res) => {
  try {
    await pool.query('SELECT NOW()');

    const tablesResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    const tables = tablesResult.rows.map(row => row.table_name);
    const expectedTables = ['users', 'worlds', 'images', 'image_folders', 'maps', 'events'];
    const missingTables = expectedTables.filter(table => !tables.includes(table));

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
