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
    const { 
      name, description, settings,
      timeline_enabled, timeline_min_time, timeline_max_time, 
      timeline_current_time, timeline_time_unit 
    } = req.body;

    // Only require name if it's being updated (allow partial updates)
    if (name !== undefined && (!name || name.trim().length === 0)) {
      return res.status(400).json({ message: 'World name is required' });
    }

    if (name && name.length > 255) {
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

    // Check if name conflicts with another world (only if name is being updated)
    if (name) {
      const nameCheck = await pool.query(
        'SELECT id FROM worlds WHERE name = $1 AND created_by = $2 AND id != $3 AND is_active = true',
        [name.trim(), req.user.id, id]
      );

      if (nameCheck.rows.length > 0) {
        return res.status(409).json({ message: 'You already have a world with this name' });
      }
    }

    // Build dynamic update query
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updateFields.push(`name = $${paramIndex++}`);
      updateValues.push(name.trim());
    }
    
    if (description !== undefined) {
      updateFields.push(`description = $${paramIndex++}`);
      updateValues.push(description || null);
    }
    
    if (settings !== undefined) {
      updateFields.push(`settings = $${paramIndex++}`);
      updateValues.push(JSON.stringify(settings || {}));
    }
    
    if (timeline_enabled !== undefined) {
      updateFields.push(`timeline_enabled = $${paramIndex++}`);
      updateValues.push(timeline_enabled);
    }
    
    if (timeline_min_time !== undefined) {
      updateFields.push(`timeline_min_time = $${paramIndex++}`);
      updateValues.push(timeline_min_time);
    }
    
    if (timeline_max_time !== undefined) {
      updateFields.push(`timeline_max_time = $${paramIndex++}`);
      updateValues.push(timeline_max_time);
    }
    
    if (timeline_current_time !== undefined) {
      updateFields.push(`timeline_current_time = $${paramIndex++}`);
      updateValues.push(timeline_current_time);
    }
    
    if (timeline_time_unit !== undefined) {
      updateFields.push(`timeline_time_unit = $${paramIndex++}`);
      updateValues.push(timeline_time_unit);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }

    // Always update the timestamp
    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    
    // Add WHERE conditions at the end
    updateValues.push(id, req.user.id);

    const result = await pool.query(`
      UPDATE worlds 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex++} AND created_by = $${paramIndex++}
      RETURNING *
    `, updateValues);

    const world = result.rows[0];
    
    res.json({
      message: 'World updated successfully',
      world: {
        id: world.id,
        name: world.name,
        description: world.description,
        createdAt: world.created_at,
        updatedAt: world.updated_at,
        settings: world.settings,
        timelineEnabled: world.timeline_enabled,
        timelineSettings: {
          minTime: world.timeline_min_time,
          maxTime: world.timeline_max_time,
          currentTime: world.timeline_current_time,
          timeUnit: world.timeline_time_unit
        }
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

module.exports = router;