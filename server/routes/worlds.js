const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// All world routes require authentication
router.use(authenticateToken);

// GET /api/worlds - Get all worlds for the current user
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT w.*, 
             COUNT(DISTINCT m.id) as map_count,
             COUNT(DISTINCT i.id) as image_count
      FROM worlds w
      LEFT JOIN maps m ON w.id = m.world_id AND m.is_active = true
      LEFT JOIN images i ON w.id = i.world_id
      WHERE w.created_by = $1 AND w.is_active = true
      GROUP BY w.id
      ORDER BY w.updated_at DESC
    `, [req.user.id]);

    const worlds = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      settings: row.settings,
      mapCount: parseInt(row.map_count),
      imageCount: parseInt(row.image_count),
      timelineEnabled: row.timeline_enabled,
      timelineSettings: {
        minTime: row.timeline_min_time,
        maxTime: row.timeline_max_time,
        currentTime: row.timeline_current_time,
        timeUnit: row.timeline_time_unit
      }
    }));

    res.json({ worlds });
  } catch (error) {
    console.error('Get worlds error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// GET /api/worlds/:id - Get specific world
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT w.*, 
             COUNT(DISTINCT m.id) as map_count,
             COUNT(DISTINCT i.id) as image_count
      FROM worlds w
      LEFT JOIN maps m ON w.id = m.world_id AND m.is_active = true
      LEFT JOIN images i ON w.id = i.world_id
      WHERE w.id = $1 AND w.created_by = $2 AND w.is_active = true
      GROUP BY w.id
    `, [id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'World not found' });
    }

    const row = result.rows[0];
    const world = {
      id: row.id,
      name: row.name,
      description: row.description,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      settings: row.settings,
      mapCount: parseInt(row.map_count),
      imageCount: parseInt(row.image_count),
      timelineEnabled: row.timeline_enabled,
      timelineSettings: {
        minTime: row.timeline_min_time,
        maxTime: row.timeline_max_time,
        currentTime: row.timeline_current_time,
        timeUnit: row.timeline_time_unit
      }
    };

    res.json({ world });
  } catch (error) {
    console.error('Get world error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// POST /api/worlds - Create new world
router.post('/', async (req, res) => {
  try {
    const { name, description, settings = {} } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ message: 'World name is required' });
    }

    if (name.length > 255) {
      return res.status(400).json({ message: 'World name must be less than 255 characters' });
    }

    // Check if user already has a world with this name
    const existingWorld = await pool.query(
      'SELECT id FROM worlds WHERE name = $1 AND created_by = $2 AND is_active = true',
      [name.trim(), req.user.id]
    );

    if (existingWorld.rows.length > 0) {
      return res.status(409).json({ message: 'You already have a world with this name' });
    }

    const result = await pool.query(`
      INSERT INTO worlds (name, description, created_by, settings)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [name.trim(), description || null, req.user.id, JSON.stringify(settings)]);

    const world = result.rows[0];
    
    res.status(201).json({
      message: 'World created successfully',
      world: {
        id: world.id,
        name: world.name,
        description: world.description,
        createdAt: world.created_at,
        updatedAt: world.updated_at,
        settings: world.settings,
        mapCount: 0,
        imageCount: 0
      }
    });
  } catch (error) {
    console.error('Create world error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// PUT /api/worlds/:id - Update world
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, settings } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ message: 'World name is required' });
    }

    if (name.length > 255) {
      return res.status(400).json({ message: 'World name must be less than 255 characters' });
    }

    // Check if world exists and user owns it
    const worldCheck = await pool.query(
      'SELECT id FROM worlds WHERE id = $1 AND created_by = $2 AND is_active = true',
      [id, req.user.id]
    );

    if (worldCheck.rows.length === 0) {
      return res.status(404).json({ message: 'World not found' });
    }

    // Check if name conflicts with another world
    const nameCheck = await pool.query(
      'SELECT id FROM worlds WHERE name = $1 AND created_by = $2 AND id != $3 AND is_active = true',
      [name.trim(), req.user.id, id]
    );

    if (nameCheck.rows.length > 0) {
      return res.status(409).json({ message: 'You already have a world with this name' });
    }

    const result = await pool.query(`
      UPDATE worlds 
      SET name = $1, description = $2, settings = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $4 AND created_by = $5
      RETURNING *
    `, [name.trim(), description || null, JSON.stringify(settings || {}), id, req.user.id]);

    const world = result.rows[0];
    
    res.json({
      message: 'World updated successfully',
      world: {
        id: world.id,
        name: world.name,
        description: world.description,
        createdAt: world.created_at,
        updatedAt: world.updated_at,
        settings: world.settings
      }
    });
  } catch (error) {
    console.error('Update world error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// DELETE /api/worlds/:id - Delete world (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if world exists and user owns it
    const worldCheck = await pool.query(
      'SELECT id, name FROM worlds WHERE id = $1 AND created_by = $2 AND is_active = true',
      [id, req.user.id]
    );

    if (worldCheck.rows.length === 0) {
      return res.status(404).json({ message: 'World not found' });
    }

    // Soft delete the world (this will cascade to all related data due to CASCADE constraints)
    await pool.query(
      'UPDATE worlds SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );

    res.json({ message: 'World deleted successfully' });
  } catch (error) {
    console.error('Delete world error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// POST /api/worlds/:id/duplicate - Duplicate a world
router.post('/:id/duplicate', async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ message: 'New world name is required' });
    }

    // Check if source world exists and user owns it
    const sourceWorld = await pool.query(
      'SELECT * FROM worlds WHERE id = $1 AND created_by = $2 AND is_active = true',
      [id, req.user.id]
    );

    if (sourceWorld.rows.length === 0) {
      return res.status(404).json({ message: 'Source world not found' });
    }

    // Check if name conflicts
    const nameCheck = await pool.query(
      'SELECT id FROM worlds WHERE name = $1 AND created_by = $2 AND is_active = true',
      [name.trim(), req.user.id]
    );

    if (nameCheck.rows.length > 0) {
      return res.status(409).json({ message: 'You already have a world with this name' });
    }

    const source = sourceWorld.rows[0];

    // Create new world
    const newWorld = await pool.query(`
      INSERT INTO worlds (name, description, created_by, settings)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [name.trim(), `Copy of ${source.description || source.name}`, req.user.id, source.settings]);

    res.status(201).json({
      message: 'World duplicated successfully',
      world: {
        id: newWorld.rows[0].id,
        name: newWorld.rows[0].name,
        description: newWorld.rows[0].description,
        createdAt: newWorld.rows[0].created_at,
        updatedAt: newWorld.rows[0].updated_at,
        settings: newWorld.rows[0].settings,
        mapCount: 0,
        imageCount: 0
      }
    });
  } catch (error) {
    console.error('Duplicate world error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// PUT /api/worlds/:id/timeline - Update world timeline settings
router.put('/:id/timeline', async (req, res) => {\n  try {\n    const { id } = req.params;\n    const { \n      timeline_enabled = false, \n      timeline_min_time = 0, \n      timeline_max_time = 100, \n      timeline_current_time = 50, \n      timeline_time_unit = 'years' \n    } = req.body;\n\n    // Check if world exists and user owns it\n    const worldCheck = await pool.query(\n      'SELECT id FROM worlds WHERE id = $1 AND created_by = $2 AND is_active = true',\n      [id, req.user.id]\n    );\n\n    if (worldCheck.rows.length === 0) {\n      return res.status(404).json({ message: 'World not found' });\n    }\n\n    // Validate timeline settings\n    if (timeline_min_time >= timeline_max_time) {\n      return res.status(400).json({ message: 'Minimum time must be less than maximum time' });\n    }\n\n    if (timeline_current_time < timeline_min_time || timeline_current_time > timeline_max_time) {\n      return res.status(400).json({ message: 'Current time must be between minimum and maximum time' });\n    }\n\n    const result = await pool.query(`\n      UPDATE worlds \n      SET timeline_enabled = $1, \n          timeline_min_time = $2, \n          timeline_max_time = $3, \n          timeline_current_time = $4, \n          timeline_time_unit = $5,\n          updated_at = CURRENT_TIMESTAMP\n      WHERE id = $6 AND created_by = $7\n      RETURNING *\n    `, [timeline_enabled, timeline_min_time, timeline_max_time, timeline_current_time, timeline_time_unit, id, req.user.id]);\n\n    const world = result.rows[0];\n    \n    res.json({\n      message: 'Timeline settings updated successfully',\n      world: {\n        id: world.id,\n        name: world.name,\n        timelineEnabled: world.timeline_enabled,\n        timelineSettings: {\n          minTime: world.timeline_min_time,\n          maxTime: world.timeline_max_time,\n          currentTime: world.timeline_current_time,\n          timeUnit: world.timeline_time_unit\n        }\n      }\n    });\n  } catch (error) {\n    console.error('Update timeline settings error:', error);\n    res.status(500).json({ message: 'Server error: ' + error.message });\n  }\n});\n\n// POST /api/worlds/:id/timeline/time - Update only current timeline time (for scrubber)\nrouter.post('/:id/timeline/time', async (req, res) => {\n  try {\n    const { id } = req.params;\n    const { current_time } = req.body;\n\n    if (current_time === undefined || typeof current_time !== 'number') {\n      return res.status(400).json({ message: 'Current time is required and must be a number' });\n    }\n\n    // Check if world exists and user owns it\n    const worldCheck = await pool.query(\n      'SELECT timeline_min_time, timeline_max_time FROM worlds WHERE id = $1 AND created_by = $2 AND is_active = true',\n      [id, req.user.id]\n    );\n\n    if (worldCheck.rows.length === 0) {\n      return res.status(404).json({ message: 'World not found' });\n    }\n\n    const { timeline_min_time, timeline_max_time } = worldCheck.rows[0];\n\n    // Validate current time is within bounds\n    if (current_time < timeline_min_time || current_time > timeline_max_time) {\n      return res.status(400).json({ \n        message: `Current time must be between ${timeline_min_time} and ${timeline_max_time}` \n      });\n    }\n\n    await pool.query(\n      'UPDATE worlds SET timeline_current_time = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',\n      [current_time, id]\n    );\n    \n    res.json({\n      message: 'Timeline position updated successfully',\n      currentTime: current_time\n    });\n  } catch (error) {\n    console.error('Update timeline position error:', error);\n    res.status(500).json({ message: 'Server error: ' + error.message });\n  }\n});\n\nmodule.exports = router;