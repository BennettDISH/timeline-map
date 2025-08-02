const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// All event routes require authentication
router.use(authenticateToken);

// GET /api/events?mapId=:mapId - Get all events for a map
router.get('/', async (req, res) => {
  try {
    const { mapId } = req.query;
    
    if (!mapId) {
      return res.status(400).json({ message: 'Map ID is required' });
    }

    // Verify user owns the world this map belongs to
    const mapCheck = await pool.query(`
      SELECT m.id, m.world_id, w.created_by 
      FROM maps m 
      JOIN worlds w ON m.world_id = w.id 
      WHERE m.id = $1 AND m.is_active = true AND w.is_active = true
    `, [mapId]);

    if (mapCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Map not found' });
    }

    const map = mapCheck.rows[0];
    if (map.created_by !== req.user.id) {
      return res.status(403).json({ message: 'Access denied to this map' });
    }
    
    const result = await pool.query(`
      SELECT e.*, u.username as created_by_username, i.file_path as image_url
      FROM events e
      LEFT JOIN users u ON e.created_by = u.id
      LEFT JOIN images i ON e.image_id = i.id
      WHERE e.map_id = $1 AND e.is_active = true
      ORDER BY e.start_time ASC, e.created_at DESC
    `, [mapId]);
    
    const events = result.rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description,
      content: row.content,
      mapId: row.map_id,
      x: parseFloat(row.x_position),
      y: parseFloat(row.y_position),
      xPixel: row.x_pixel || 0,
      yPixel: row.y_pixel || 0,
      startTime: row.start_time,
      endTime: row.end_time,
      timelineEnabled: row.timeline_enabled,
      imageId: row.image_id,
      imageUrl: row.image_url ? `${req.protocol}://${req.get('host')}${row.image_url}` : null,
      createdBy: row.created_by_username,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      tooltipText: row.tooltip_text,
      linkToMapId: row.link_to_map_id,
      eventType: row.event_type
    }));

    res.json({ 
      events,
      total: events.length 
    });
    
  } catch (error) {
    console.error('Get events error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// GET /api/events/:id - Get specific event
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT e.*, u.username as created_by_username, i.file_path as image_url,
             m.world_id, w.created_by as world_owner
      FROM events e
      LEFT JOIN users u ON e.created_by = u.id
      LEFT JOIN images i ON e.image_id = i.id
      JOIN maps m ON e.map_id = m.id
      JOIN worlds w ON m.world_id = w.id
      WHERE e.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Event not found' });
    }

    const row = result.rows[0];
    
    // Verify user owns the world this event belongs to
    if (row.world_owner !== req.user.id) {
      return res.status(403).json({ message: 'Access denied to this event' });
    }
    
    const event = {
      id: row.id,
      title: row.title,
      description: row.description,
      content: row.content,
      mapId: row.map_id,
      x: parseFloat(row.x_position),
      y: parseFloat(row.y_position),
      startTime: row.start_time,
      endTime: row.end_time,
      timelineEnabled: row.timeline_enabled,
      imageId: row.image_id,
      imageUrl: row.image_url ? `${req.protocol}://${req.get('host')}${row.image_url}` : null,
      createdBy: row.created_by_username,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      tooltipText: row.tooltip_text,
      linkToMapId: row.link_to_map_id,
      eventType: row.event_type
    };

    res.json({ event });
    
  } catch (error) {
    console.error('Get event error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// POST /api/events - Create new event/node
router.post('/', async (req, res) => {
  try {
    const { 
      title, description, content, map_id, x_position, y_position, x_pixel = 0, y_pixel = 0,
      start_time = 0, end_time = 100, timeline_enabled = false, image_id, tooltip_text, 
      link_to_map_id, event_type = 'standard' 
    } = req.body;
    
    if (!title || !map_id || x_position === undefined || y_position === undefined) {
      return res.status(400).json({ message: 'Title, map ID, and position coordinates are required' });
    }

    // Verify user owns the world this map belongs to
    const mapCheck = await pool.query(`
      SELECT m.id, m.world_id, w.created_by 
      FROM maps m 
      JOIN worlds w ON m.world_id = w.id 
      WHERE m.id = $1 AND m.is_active = true AND w.is_active = true
    `, [map_id]);

    if (mapCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Map not found' });
    }

    const map = mapCheck.rows[0];
    if (map.created_by !== req.user.id) {
      return res.status(403).json({ message: 'Access denied to this map' });
    }
    
    // Coordinates can be anywhere on the infinite grid (no bounds checking)
    
    // Verify image belongs to the world if provided
    if (image_id) {
      const imageCheck = await pool.query(
        'SELECT id FROM images WHERE id = $1 AND world_id = $2',
        [image_id, map.world_id]
      );
      
      if (imageCheck.rows.length === 0) {
        return res.status(400).json({ message: 'Image not found in this world' });
      }
    }
    
    // Verify linked map belongs to the world if provided
    if (link_to_map_id) {
      const linkedMapCheck = await pool.query(
        'SELECT id FROM maps WHERE id = $1 AND world_id = $2 AND is_active = true',
        [link_to_map_id, map.world_id]
      );
      
      if (linkedMapCheck.rows.length === 0) {
        return res.status(400).json({ message: 'Linked map not found in this world' });
      }
    }
    
    const result = await pool.query(`
      INSERT INTO events (
        title, description, content, map_id, x_position, y_position, x_pixel, y_pixel,
        start_time, end_time, timeline_enabled, image_id, created_by, tooltip_text,
        link_to_map_id, event_type
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `, [
      title, description, content, map_id, x_position, y_position, x_pixel, y_pixel,
      start_time, end_time, timeline_enabled, image_id || null, req.user.id, tooltip_text || null,
      link_to_map_id || null, event_type
    ]);

    const newEvent = result.rows[0];
    
    res.status(201).json({
      message: 'Event created successfully',
      event: {
        id: newEvent.id,
        title: newEvent.title,
        description: newEvent.description,
        content: newEvent.content,
        mapId: newEvent.map_id,
        x: parseFloat(newEvent.x_position),
        y: parseFloat(newEvent.y_position),
        startTime: newEvent.start_time,
        endTime: newEvent.end_time,
        timelineEnabled: newEvent.timeline_enabled,
        imageId: newEvent.image_id,
        createdAt: newEvent.created_at,
        updatedAt: newEvent.updated_at,
        tooltipText: newEvent.tooltip_text,
        linkToMapId: newEvent.link_to_map_id,
        eventType: newEvent.event_type
      }
    });
    
  } catch (error) {
    console.error('Create event error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// PUT /api/events/:id - Update event
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      title, description, content, x_position, y_position, x_pixel, y_pixel,
      start_time, end_time, timeline_enabled, image_id, tooltip_text, 
      link_to_map_id, event_type 
    } = req.body;
    
    // Get current event to verify ownership
    const currentEvent = await pool.query(`
      SELECT e.*, m.world_id, w.created_by 
      FROM events e
      JOIN maps m ON e.map_id = m.id
      JOIN worlds w ON m.world_id = w.id
      WHERE e.id = $1
    `, [id]);
    
    if (currentEvent.rows.length === 0) {
      return res.status(404).json({ message: 'Event not found' });
    }
    
    const event = currentEvent.rows[0];
    
    // Verify user owns the world this event belongs to
    if (event.created_by !== req.user.id) {
      return res.status(403).json({ message: 'Access denied to this event' });
    }
    
    // Coordinates can be anywhere on the infinite grid (no bounds checking)
    
    // Verify image belongs to the world if provided
    if (image_id && image_id !== event.image_id) {
      const imageCheck = await pool.query(
        'SELECT id FROM images WHERE id = $1 AND world_id = $2',
        [image_id, event.world_id]
      );
      
      if (imageCheck.rows.length === 0) {
        return res.status(400).json({ message: 'Image not found in this world' });
      }
    }
    
    // Verify linked map belongs to the world if provided
    if (link_to_map_id && link_to_map_id !== event.link_to_map_id) {
      const linkedMapCheck = await pool.query(
        'SELECT id FROM maps WHERE id = $1 AND world_id = $2 AND is_active = true',
        [link_to_map_id, event.world_id]
      );
      
      if (linkedMapCheck.rows.length === 0) {
        return res.status(400).json({ message: 'Linked map not found in this world' });
      }
    }
    
    const result = await pool.query(`
      UPDATE events 
      SET title = COALESCE($1, title),
          description = COALESCE($2, description),
          content = COALESCE($3, content),
          x_position = COALESCE($4, x_position),
          y_position = COALESCE($5, y_position),
          x_pixel = COALESCE($6, x_pixel),
          y_pixel = COALESCE($7, y_pixel),
          start_time = COALESCE($8, start_time),
          end_time = COALESCE($9, end_time),
          timeline_enabled = COALESCE($10, timeline_enabled),
          image_id = COALESCE($11, image_id),
          tooltip_text = COALESCE($12, tooltip_text),
          link_to_map_id = COALESCE($13, link_to_map_id),
          event_type = COALESCE($14, event_type),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $15
      RETURNING *
    `, [
      title, description, content, x_position, y_position, x_pixel, y_pixel,
      start_time, end_time, timeline_enabled, image_id, tooltip_text, 
      link_to_map_id, event_type, id
    ]);

    const updatedEvent = result.rows[0];
    
    res.json({
      message: 'Event updated successfully',
      event: {
        id: updatedEvent.id,
        title: updatedEvent.title,
        description: updatedEvent.description,
        content: updatedEvent.content,
        mapId: updatedEvent.map_id,
        x: parseFloat(updatedEvent.x_position),
        y: parseFloat(updatedEvent.y_position),
        startTime: updatedEvent.start_time,
        endTime: updatedEvent.end_time,
        timelineEnabled: updatedEvent.timeline_enabled,
        imageId: updatedEvent.image_id,
        createdAt: updatedEvent.created_at,
        updatedAt: updatedEvent.updated_at,
        tooltipText: updatedEvent.tooltip_text,
        linkToMapId: updatedEvent.link_to_map_id,
        eventType: updatedEvent.event_type
      }
    });
    
  } catch (error) {
    console.error('Update event error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// DELETE /api/events/:id - Delete event
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get current event to verify ownership
    const currentEvent = await pool.query(`
      SELECT e.*, m.world_id, w.created_by 
      FROM events e
      JOIN maps m ON e.map_id = m.id
      JOIN worlds w ON m.world_id = w.id
      WHERE e.id = $1
    `, [id]);
    
    if (currentEvent.rows.length === 0) {
      return res.status(404).json({ message: 'Event not found' });
    }
    
    const event = currentEvent.rows[0];
    
    // Verify user owns the world this event belongs to
    if (event.created_by !== req.user.id) {
      return res.status(403).json({ message: 'Access denied to this event' });
    }
    
    // Soft delete by setting is_active to false
    await pool.query('UPDATE events SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1', [id]);
    
    res.json({ message: 'Event deleted successfully' });
    
  } catch (error) {
    console.error('Delete event error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

module.exports = router;