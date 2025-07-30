const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// All map routes require authentication
router.use(authenticateToken);

// GET /api/maps - Get all maps for a world
router.get('/', async (req, res) => {
  try {
    const { world_id, parent_map_id } = req.query;
    
    if (!world_id) {
      return res.status(400).json({ message: 'World ID is required' });
    }

    // Verify user owns the world
    const worldCheck = await pool.query(
      'SELECT id FROM worlds WHERE id = $1 AND created_by = $2 AND is_active = true',
      [world_id, req.user.id]
    );

    if (worldCheck.rows.length === 0) {
      return res.status(404).json({ message: 'World not found or access denied' });
    }
    
    let query = `
      SELECT m.*, i.filename as image_filename, i.file_path as image_url, u.username as created_by_username
      FROM maps m
      LEFT JOIN images i ON m.image_id = i.id
      LEFT JOIN users u ON m.created_by = u.id
      WHERE m.world_id = $1 AND m.is_active = true
    `;
    const params = [world_id];
    
    // Filter by parent map if specified
    if (parent_map_id) {
      query += ' AND m.parent_map_id = $2';
      params.push(parent_map_id);
    } else {
      query += ' AND m.parent_map_id IS NULL'; // Root level maps
    }
    
    query += ' ORDER BY m.map_order ASC, m.created_at DESC';
    
    const result = await pool.query(query, params);
    
    const maps = result.rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      worldId: row.world_id,
      imageId: row.image_id,
      imageUrl: row.image_url ? `${req.protocol}://${req.get('host')}${row.image_url}` : null,
      parentMapId: row.parent_map_id,
      createdBy: row.created_by_username,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      zoomLevel: row.zoom_level,
      mapOrder: row.map_order
    }));

    res.json({ 
      maps,
      total: maps.length 
    });
    
  } catch (error) {
    console.error('Get maps error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// GET /api/maps/:id - Get specific map
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT m.*, i.filename as image_filename, i.file_path as image_url, u.username as created_by_username
      FROM maps m
      LEFT JOIN images i ON m.image_id = i.id
      LEFT JOIN users u ON m.created_by = u.id
      WHERE m.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Map not found' });
    }

    const row = result.rows[0];
    
    // Verify user owns the world this map belongs to
    const worldCheck = await pool.query(
      'SELECT id FROM worlds WHERE id = $1 AND created_by = $2 AND is_active = true',
      [row.world_id, req.user.id]
    );

    if (worldCheck.rows.length === 0) {
      return res.status(403).json({ message: 'Access denied to this map' });
    }
    
    const map = {
      id: row.id,
      title: row.title,
      description: row.description,
      worldId: row.world_id,
      imageId: row.image_id,
      imageUrl: row.image_url ? `${req.protocol}://${req.get('host')}${row.image_url}` : null,
      parentMapId: row.parent_map_id,
      createdBy: row.created_by_username,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      zoomLevel: row.zoom_level,
      mapOrder: row.map_order
    };

    res.json({ map });
    
  } catch (error) {
    console.error('Get map error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// POST /api/maps - Create new map
router.post('/', async (req, res) => {
  try {
    const { title, description, world_id, image_id, parent_map_id, zoom_level = 1, map_order = 0 } = req.body;
    
    if (!title || !world_id) {
      return res.status(400).json({ message: 'Title and world ID are required' });
    }

    // Verify user owns the world
    const worldCheck = await pool.query(
      'SELECT id FROM worlds WHERE id = $1 AND created_by = $2 AND is_active = true',
      [world_id, req.user.id]
    );

    if (worldCheck.rows.length === 0) {
      return res.status(404).json({ message: 'World not found or access denied' });
    }
    
    // Verify image belongs to the world if provided
    if (image_id) {
      const imageCheck = await pool.query(
        'SELECT id FROM images WHERE id = $1 AND world_id = $2',
        [image_id, world_id]
      );
      
      if (imageCheck.rows.length === 0) {
        return res.status(400).json({ message: 'Image not found in this world' });
      }
    }
    
    const result = await pool.query(`
      INSERT INTO maps (title, description, world_id, image_id, parent_map_id, created_by, zoom_level, map_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [title, description, world_id, image_id || null, parent_map_id || null, req.user.id, zoom_level, map_order]);

    const newMap = result.rows[0];
    
    res.status(201).json({
      message: 'Map created successfully',
      map: {
        id: newMap.id,
        title: newMap.title,
        description: newMap.description,
        worldId: newMap.world_id,
        imageId: newMap.image_id,
        parentMapId: newMap.parent_map_id,
        createdAt: newMap.created_at,
        updatedAt: newMap.updated_at,
        zoomLevel: newMap.zoom_level,
        mapOrder: newMap.map_order
      }
    });
    
  } catch (error) {
    console.error('Create map error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// PUT /api/maps/:id - Update map
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, image_id, zoom_level, map_order } = req.body;
    
    // Get current map to verify ownership
    const currentMap = await pool.query('SELECT * FROM maps WHERE id = $1', [id]);
    
    if (currentMap.rows.length === 0) {
      return res.status(404).json({ message: 'Map not found' });
    }
    
    const map = currentMap.rows[0];
    
    // Verify user owns the world this map belongs to
    const worldCheck = await pool.query(
      'SELECT id FROM worlds WHERE id = $1 AND created_by = $2 AND is_active = true',
      [map.world_id, req.user.id]
    );

    if (worldCheck.rows.length === 0) {
      return res.status(403).json({ message: 'Access denied to this map' });
    }
    
    // Verify image belongs to the world if provided
    if (image_id && image_id !== map.image_id) {
      const imageCheck = await pool.query(
        'SELECT id FROM images WHERE id = $1 AND world_id = $2',
        [image_id, map.world_id]
      );
      
      if (imageCheck.rows.length === 0) {
        return res.status(400).json({ message: 'Image not found in this world' });
      }
    }
    
    const result = await pool.query(`
      UPDATE maps 
      SET title = COALESCE($1, title),
          description = COALESCE($2, description),
          image_id = COALESCE($3, image_id),
          zoom_level = COALESCE($4, zoom_level),
          map_order = COALESCE($5, map_order),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *
    `, [title, description, image_id, zoom_level, map_order, id]);

    const updatedMap = result.rows[0];
    
    res.json({
      message: 'Map updated successfully',
      map: {
        id: updatedMap.id,
        title: updatedMap.title,
        description: updatedMap.description,
        worldId: updatedMap.world_id,
        imageId: updatedMap.image_id,
        parentMapId: updatedMap.parent_map_id,
        createdAt: updatedMap.created_at,
        updatedAt: updatedMap.updated_at,
        zoomLevel: updatedMap.zoom_level,
        mapOrder: updatedMap.map_order
      }
    });
    
  } catch (error) {
    console.error('Update map error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// DELETE /api/maps/:id - Delete map
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get current map to verify ownership
    const currentMap = await pool.query('SELECT * FROM maps WHERE id = $1', [id]);
    
    if (currentMap.rows.length === 0) {
      return res.status(404).json({ message: 'Map not found' });
    }
    
    const map = currentMap.rows[0];
    
    // Verify user owns the world this map belongs to
    const worldCheck = await pool.query(
      'SELECT id FROM worlds WHERE id = $1 AND created_by = $2 AND is_active = true',
      [map.world_id, req.user.id]
    );

    if (worldCheck.rows.length === 0) {
      return res.status(403).json({ message: 'Access denied to this map' });
    }
    
    // Soft delete by setting is_active to false
    await pool.query('UPDATE maps SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
    
    res.json({ message: 'Map deleted successfully' });
    
  } catch (error) {
    console.error('Delete map error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

module.exports = router;