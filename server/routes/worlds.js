const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { r2Enabled, deletePrefix } = require('../storage');
const { resolveImageUrl } = require('../utils/imageUrl');
const { worldName, text, idParam } = require('../lib/validate');
const router = express.Router();

// All world routes require authentication
router.use(authenticateToken);
// a non-canonical id is a 404 before any query runs (never a Postgres error dressed as 500)
router.param('id', idParam);

// GET /api/worlds - Get all worlds for the current user
router.get('/', async (req, res) => {
  try {
    // Counts as subselects (not joins) so the three one-to-many tables don't multiply rows.
    // cover_path: the root map's backdrop is the world's face; fall back to its newest image.
    const result = await pool.query(`
      SELECT w.*,
             (SELECT COUNT(*) FROM maps m WHERE m.world_id = w.id) as map_count,
             (SELECT COUNT(*) FROM images i WHERE i.world_id = w.id) as image_count,
             (SELECT COUNT(*) FROM nodes n WHERE n.world_id = w.id) as node_count,
             (SELECT ci.file_path FROM maps rm JOIN images ci ON ci.id = rm.image_id
                WHERE rm.id = w.root_map_id) as cover_path,
             (SELECT li.file_path FROM images li WHERE li.world_id = w.id
                ORDER BY li.created_at DESC LIMIT 1) as cover_fallback
      FROM worlds w
      WHERE w.created_by = $1
      -- "most recently charted" means the last edit ANYWHERE in the world: a node or a map
      -- touched tonight outranks a world merely renamed last week
      ORDER BY GREATEST(w.updated_at,
        COALESCE((SELECT MAX(n.updated_at) FROM nodes n WHERE n.world_id = w.id), w.updated_at),
        COALESCE((SELECT MAX(m.updated_at) FROM maps m WHERE m.world_id = w.id), w.updated_at)) DESC
    `, [req.user.id]);

    const worlds = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      mapCount: parseInt(row.map_count),
      imageCount: parseInt(row.image_count),
      nodeCount: parseInt(row.node_count),
      coverUrl: resolveImageUrl(req, row.cover_path || row.cover_fallback),
      shared: !!row.share_token,
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
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/worlds - Create new world
router.post('/', async (req, res) => {
  try {
    // the one world-name rule (shared with rename and clone in atlas.js): text, 1 to 255 characters
    const name = worldName(req.body?.name);
    if (name === undefined) return res.status(400).json({ message: 'A world needs a name of 1 to 255 characters' });
    const description = text(req.body?.description, 2000);
    if (description === undefined) return res.status(400).json({ message: 'The description is text' });

    // Check if user already has a world with this name
    const existingWorld = await pool.query(
      'SELECT id FROM worlds WHERE name = $1 AND created_by = $2',
      [name, req.user.id]
    );

    if (existingWorld.rows.length > 0) {
      return res.status(409).json({ message: 'You already have a world with this name' });
    }

    const result = await pool.query(`
      INSERT INTO worlds (name, description, created_by)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [name, description || null, req.user.id]);

    const world = result.rows[0];
    
    res.status(201).json({
      message: 'World created successfully',
      world: {
        id: world.id,
        name: world.name,
        description: world.description,
        createdAt: world.created_at,
        updatedAt: world.updated_at,
        mapCount: 0,
        imageCount: 0
      }
    });
  } catch (error) {
    console.error('Create world error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/worlds/:id - Delete world (a hard delete; everything cascades, R2 objects follow)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if world exists and user owns it
    const worldCheck = await pool.query(
      'SELECT id, name FROM worlds WHERE id = $1 AND created_by = $2',
      [id, req.user.id]
    );

    if (worldCheck.rows.length === 0) {
      return res.status(404).json({ message: 'World not found' });
    }

    // Hard delete — ON DELETE CASCADE reclaims this world's maps, nodes, images, folders, eras and its Forge mind.
    await pool.query('DELETE FROM worlds WHERE id = $1 AND created_by = $2', [id, req.user.id]);

    // Best-effort: remove this world's objects from R2
    if (r2Enabled) {
      try {
        await deletePrefix(`worlds/${id}/`);
      } catch (e) {
        console.error('R2 world prefix delete failed:', e.message);
      }
    }

    res.json({ message: 'World deleted successfully' });
  } catch (error) {
    console.error('Delete world error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;