const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// GET /api/maps/:mapId/timeline-images - Get all timeline images for a map
router.get('/:mapId/timeline-images', async (req, res) => {
  try {
    const { mapId } = req.params;
    
    // Verify user owns the map
    const mapCheck = await pool.query(`
      SELECT m.id, m.world_id 
      FROM maps m
      JOIN worlds w ON m.world_id = w.id
      WHERE m.id = $1 AND w.created_by = $2 AND m.is_active = true AND w.is_active = true
    `, [mapId, req.user.id]);
    
    if (mapCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Map not found or access denied' });
    }
    
    // Get timeline images for this map
    const result = await pool.query(`
      SELECT mti.*, i.filename, i.file_path, i.original_name
      FROM map_timeline_images mti
      JOIN images i ON mti.image_id = i.id
      WHERE mti.map_id = $1
      ORDER BY mti.start_time ASC
    `, [mapId]);
    
    const timelineImages = result.rows.map(row => ({
      id: row.id,
      mapId: row.map_id,
      imageId: row.image_id,
      startTime: row.start_time,
      endTime: row.end_time,
      isDefault: row.is_default,
      positionX: parseFloat(row.position_x || 0),
      positionY: parseFloat(row.position_y || 0),
      scale: parseFloat(row.scale || 1.0),
      objectFit: row.object_fit || 'cover',
      imageName: row.original_name,
      imageFilename: row.filename,
      imageUrl: row.file_path ? `${req.protocol}://${req.get('host')}${row.file_path}` : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
    
    res.json({ images: timelineImages });
    
  } catch (error) {
    console.error('Get timeline images error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// POST /api/maps/:mapId/timeline-images - Add timeline image
router.post('/:mapId/timeline-images', async (req, res) => {
  try {
    const { mapId } = req.params;
    const { 
      image_id, start_time, end_time, is_default = false,
      position_x = 0, position_y = 0, scale = 1.0, object_fit = 'cover'
    } = req.body;
    
    if (!image_id || start_time === undefined || end_time === undefined) {
      return res.status(400).json({ message: 'Image ID, start time, and end time are required' });
    }
    
    if (start_time >= end_time) {
      return res.status(400).json({ message: 'Start time must be less than end time' });
    }
    
    // Verify user owns the map
    const mapCheck = await pool.query(`
      SELECT m.id, m.world_id 
      FROM maps m
      JOIN worlds w ON m.world_id = w.id
      WHERE m.id = $1 AND w.created_by = $2 AND m.is_active = true AND w.is_active = true
    `, [mapId, req.user.id]);
    
    if (mapCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Map not found or access denied' });
    }
    
    // Verify image exists and belongs to the same world
    const imageCheck = await pool.query(`
      SELECT i.id 
      FROM images i
      WHERE i.id = $1 AND i.world_id = $2
    `, [image_id, mapCheck.rows[0].world_id]);
    
    if (imageCheck.rows.length === 0) {
      return res.status(400).json({ message: 'Image not found in this world' });
    }
    
    // Check for overlapping time ranges (except if this is marked as default)
    if (!is_default) {
      const overlapCheck = await pool.query(`
        SELECT id FROM map_timeline_images 
        WHERE map_id = $1 
        AND NOT (end_time <= $2 OR start_time >= $3)
        AND is_default = false
      `, [mapId, start_time, end_time]);
      
      if (overlapCheck.rows.length > 0) {
        return res.status(400).json({ 
          message: 'Time range overlaps with existing timeline image' 
        });
      }
    }
    
    // If setting as default, unset other defaults
    if (is_default) {
      await pool.query(
        'UPDATE map_timeline_images SET is_default = false WHERE map_id = $1',
        [mapId]
      );
    }
    
    const result = await pool.query(`
      INSERT INTO map_timeline_images (map_id, image_id, start_time, end_time, is_default, position_x, position_y, scale, object_fit)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [mapId, image_id, start_time, end_time, is_default, position_x, position_y, scale, object_fit]);
    
    res.status(201).json({
      message: 'Timeline image added successfully',
      image: {
        id: result.rows[0].id,
        mapId: result.rows[0].map_id,
        imageId: result.rows[0].image_id,
        startTime: result.rows[0].start_time,
        endTime: result.rows[0].end_time,
        isDefault: result.rows[0].is_default,
        positionX: parseFloat(result.rows[0].position_x),
        positionY: parseFloat(result.rows[0].position_y),
        scale: parseFloat(result.rows[0].scale),
        objectFit: result.rows[0].object_fit,
        createdAt: result.rows[0].created_at
      }
    });
    
  } catch (error) {
    console.error('Add timeline image error:', error);
    if (error.code === '23505') { // Unique constraint violation
      res.status(409).json({ message: 'This image is already added to this map timeline' });
    } else {
      res.status(500).json({ message: 'Server error: ' + error.message });
    }
  }
});

// PUT /api/maps/:mapId/timeline-images/:imageId - Update timeline image
router.put('/:mapId/timeline-images/:imageId', async (req, res) => {
  try {
    const { mapId, imageId } = req.params;
    const { start_time, end_time, is_default, position_x, position_y, scale, object_fit } = req.body;
    
    // Verify user owns the map
    const mapCheck = await pool.query(`
      SELECT m.id, m.world_id 
      FROM maps m
      JOIN worlds w ON m.world_id = w.id
      WHERE m.id = $1 AND w.created_by = $2 AND m.is_active = true AND w.is_active = true
    `, [mapId, req.user.id]);
    
    if (mapCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Map not found or access denied' });
    }
    
    // Verify timeline image exists
    const timelineImageCheck = await pool.query(
      'SELECT id FROM map_timeline_images WHERE id = $1 AND map_id = $2',
      [imageId, mapId]
    );
    
    if (timelineImageCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Timeline image not found' });
    }
    
    if (start_time !== undefined && end_time !== undefined && start_time >= end_time) {
      return res.status(400).json({ message: 'Start time must be less than end time' });
    }
    
    // If setting as default, unset other defaults
    if (is_default) {
      await pool.query(
        'UPDATE map_timeline_images SET is_default = false WHERE map_id = $1',
        [mapId]
      );
    }
    
    const result = await pool.query(`
      UPDATE map_timeline_images 
      SET start_time = COALESCE($1, start_time),
          end_time = COALESCE($2, end_time),
          is_default = COALESCE($3, is_default),
          position_x = COALESCE($4, position_x),
          position_y = COALESCE($5, position_y),
          scale = COALESCE($6, scale),
          object_fit = COALESCE($7, object_fit),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $8 AND map_id = $9
      RETURNING *
    `, [start_time, end_time, is_default, position_x, position_y, scale, object_fit, imageId, mapId]);
    
    res.json({
      message: 'Timeline image updated successfully',
      image: {
        id: result.rows[0].id,
        mapId: result.rows[0].map_id,
        imageId: result.rows[0].image_id,
        startTime: result.rows[0].start_time,
        endTime: result.rows[0].end_time,
        isDefault: result.rows[0].is_default,
        positionX: parseFloat(result.rows[0].position_x),
        positionY: parseFloat(result.rows[0].position_y),
        scale: parseFloat(result.rows[0].scale),
        objectFit: result.rows[0].object_fit,
        updatedAt: result.rows[0].updated_at
      }
    });
    
  } catch (error) {
    console.error('Update timeline image error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// DELETE /api/maps/:mapId/timeline-images/:imageId - Remove timeline image
router.delete('/:mapId/timeline-images/:imageId', async (req, res) => {
  try {
    const { mapId, imageId } = req.params;
    
    // Verify user owns the map
    const mapCheck = await pool.query(`
      SELECT m.id, m.world_id 
      FROM maps m
      JOIN worlds w ON m.world_id = w.id
      WHERE m.id = $1 AND w.created_by = $2 AND m.is_active = true AND w.is_active = true
    `, [mapId, req.user.id]);
    
    if (mapCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Map not found or access denied' });
    }
    
    // Verify timeline image exists
    const timelineImageCheck = await pool.query(
      'SELECT id FROM map_timeline_images WHERE id = $1 AND map_id = $2',
      [imageId, mapId]
    );
    
    if (timelineImageCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Timeline image not found' });
    }
    
    await pool.query(
      'DELETE FROM map_timeline_images WHERE id = $1 AND map_id = $2',
      [imageId, mapId]
    );
    
    res.json({ message: 'Timeline image removed successfully' });
    
  } catch (error) {
    console.error('Delete timeline image error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

module.exports = router;