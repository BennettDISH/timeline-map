const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// All timeline routes require authentication
router.use(authenticateToken);

// PUT /api/worlds/:id/timeline - Update world timeline settings
router.put('/:id/timeline', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      timeline_enabled = false, 
      timeline_min_time = 0, 
      timeline_max_time = 100, 
      timeline_current_time = 50, 
      timeline_time_unit = 'years' 
    } = req.body;

    // Check if world exists and user owns it
    const worldCheck = await pool.query(
      'SELECT id FROM worlds WHERE id = $1 AND created_by = $2 AND is_active = true',
      [id, req.user.id]
    );

    if (worldCheck.rows.length === 0) {
      return res.status(404).json({ message: 'World not found' });
    }

    // Validate timeline settings
    if (timeline_min_time >= timeline_max_time) {
      return res.status(400).json({ message: 'Minimum time must be less than maximum time' });
    }

    if (timeline_current_time < timeline_min_time || timeline_current_time > timeline_max_time) {
      return res.status(400).json({ message: 'Current time must be between minimum and maximum time' });
    }

    const result = await pool.query(`
      UPDATE worlds 
      SET timeline_enabled = $1, 
          timeline_min_time = $2, 
          timeline_max_time = $3, 
          timeline_current_time = $4, 
          timeline_time_unit = $5,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $6 AND created_by = $7
      RETURNING *
    `, [timeline_enabled, timeline_min_time, timeline_max_time, timeline_current_time, timeline_time_unit, id, req.user.id]);

    const world = result.rows[0];
    
    res.json({
      message: 'Timeline settings updated successfully',
      world: {
        id: world.id,
        name: world.name,
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
    console.error('Update timeline settings error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// POST /api/worlds/:id/timeline/time - Update only current timeline time (for scrubber)
router.post('/:id/timeline/time', async (req, res) => {
  try {
    const { id } = req.params;
    const { current_time } = req.body;

    if (current_time === undefined || typeof current_time !== 'number') {
      return res.status(400).json({ message: 'Current time is required and must be a number' });
    }

    // Check if world exists and user owns it
    const worldCheck = await pool.query(
      'SELECT timeline_min_time, timeline_max_time FROM worlds WHERE id = $1 AND created_by = $2 AND is_active = true',
      [id, req.user.id]
    );

    if (worldCheck.rows.length === 0) {
      return res.status(404).json({ message: 'World not found' });
    }

    const { timeline_min_time, timeline_max_time } = worldCheck.rows[0];

    // Validate current time is within bounds
    if (current_time < timeline_min_time || current_time > timeline_max_time) {
      return res.status(400).json({ 
        message: `Current time must be between ${timeline_min_time} and ${timeline_max_time}` 
      });
    }

    await pool.query(
      'UPDATE worlds SET timeline_current_time = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [current_time, id]
    );
    
    res.json({
      message: 'Timeline position updated successfully',
      currentTime: current_time
    });
  } catch (error) {
    console.error('Update timeline position error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

module.exports = router;