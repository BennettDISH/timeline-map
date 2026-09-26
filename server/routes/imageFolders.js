const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { idParam, isId, text } = require('../lib/validate');
const router = express.Router();
router.param('id', idParam);

// All routes require authentication
router.use(authenticateToken);

// GET /api/image-folders?world_id=123 - Get all folders for a world
router.get('/', async (req, res) => {
  try {
    const { world_id } = req.query;

    if (!isId(world_id)) {
      return res.status(400).json({ message: 'World ID is required' });
    }

    // Verify user owns the world
    const worldCheck = await pool.query(
      'SELECT id FROM worlds WHERE id = $1 AND created_by = $2 AND is_active = true',
      [world_id, req.user.id]
    );

    if (worldCheck.rows.length === 0) {
      return res.status(404).json({ message: 'World not found' });
    }

    // Get all folders for this world
    const result = await pool.query(`
      SELECT f.*, (SELECT COUNT(*) FROM images i WHERE i.folder_id = f.id) as image_count
      FROM image_folders f
      WHERE f.world_id = $1
      ORDER BY f.parent_id NULLS FIRST, f.name
    `, [world_id]);

    const folders = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      parentId: row.parent_id,
      worldId: row.world_id,
      createdBy: row.created_by,
      createdAt: row.created_at,
      imageCount: parseInt(row.image_count)
    }));

    // World-level counts so the rail's "All art" / "Unsorted" rows don't need an image fetch.
    const totals = (await pool.query(
      `SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE folder_id IS NULL) as unsorted
       FROM images WHERE world_id = $1`, [world_id])).rows[0];

    res.json({ folders, total: parseInt(totals.total), unsorted: parseInt(totals.unsorted) });
    
  } catch (error) {
    console.error('Get folders error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// the same name at the same level, case-insensitively, the top level included
async function nameTaken(worldId, parentId, name, exceptId = null) {
  const r = await pool.query(
    'SELECT 1 FROM image_folders WHERE world_id = $1 AND parent_id IS NOT DISTINCT FROM $2 AND lower(name) = lower($3) AND ($4::int IS NULL OR id <> $4)',
    [worldId, parentId == null ? null : Number(parentId), name, exceptId]);
  return r.rows.length > 0;
}

// POST /api/image-folders - Create a new folder
router.post('/', async (req, res) => {
  try {
    const { parent_id, world_id } = req.body;
    const name = text(req.body.name, 255, { required: true });
    if (name === undefined) return res.status(400).json({ message: 'A folder needs a name of 1 to 255 characters' });
    if (!isId(world_id)) {
      return res.status(400).json({ message: 'Name and world_id are required' });
    }
    if (parent_id != null && parent_id !== '' && !isId(parent_id)) return res.status(400).json({ message: 'That is not a folder id' });

    // Verify user owns the world
    const worldCheck = await pool.query(
      'SELECT id FROM worlds WHERE id = $1 AND created_by = $2 AND is_active = true',
      [world_id, req.user.id]
    );

    if (worldCheck.rows.length === 0) {
      return res.status(404).json({ message: 'World not found' });
    }

    // If parent_id is provided, verify it exists and belongs to the same world
    if (parent_id) {
      const parentCheck = await pool.query(
        'SELECT id FROM image_folders WHERE id = $1 AND world_id = $2 AND created_by = $3',
        [parent_id, world_id, req.user.id]
      );

      if (parentCheck.rows.length === 0) {
        return res.status(404).json({ message: 'Parent folder not found or access denied' });
      }
    }

    // one name per level, top level included (the UNIQUE constraint treats NULL parents as all different)
    if (await nameTaken(world_id, parent_id || null, name)) return res.status(409).json({ message: 'A folder with this name already exists here' });
    // Create the folder
    const result = await pool.query(`
      INSERT INTO image_folders (name, parent_id, world_id, created_by)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [name, parent_id || null, world_id, req.user.id]);

    const folder = result.rows[0];

    res.json({ 
      message: 'Folder created successfully',
      folder: {
        id: folder.id,
        name: folder.name,
        parentId: folder.parent_id,
        worldId: folder.world_id,
        createdBy: folder.created_by,
        createdAt: folder.created_at,
        imageCount: 0
      }
    });
    
  } catch (error) {
    if (error.code === '23505') { // Unique constraint violation
      return res.status(400).json({ message: 'A folder with this name already exists in this location' });
    }
    console.error('Create folder error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/image-folders/:id - Update folder
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const name = req.body.name == null ? null : text(req.body.name, 255, { required: true });
    if (name === undefined) return res.status(400).json({ message: 'A folder needs a name of 1 to 255 characters' });

    // Get folder and verify ownership
    const folderCheck = await pool.query(`
      SELECT f.*, w.created_by as world_owner
      FROM image_folders f
      JOIN worlds w ON f.world_id = w.id
      WHERE f.id = $1 AND (f.created_by = $2 OR w.created_by = $2)
    `, [id, req.user.id]);

    if (folderCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Folder not found or access denied' });
    }
    const cur = folderCheck.rows[0];
    if (name && (await nameTaken(cur.world_id, cur.parent_id, name, cur.id))) return res.status(409).json({ message: 'A folder with this name already exists here' });

    // Update folder
    const result = await pool.query(`
      UPDATE image_folders 
      SET name = COALESCE($1, name)
      WHERE id = $2
      RETURNING *
    `, [name, id]);

    const folder = result.rows[0];

    res.json({ 
      message: 'Folder updated successfully',
      folder: {
        id: folder.id,
        name: folder.name,
        parentId: folder.parent_id,
        worldId: folder.world_id,
        createdBy: folder.created_by,
        createdAt: folder.created_at
      }
    });
    
  } catch (error) {
    if (error.code === '23505') { // Unique constraint violation
      return res.status(400).json({ message: 'A folder with this name already exists in this location' });
    }
    console.error('Update folder error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/image-folders/:id - Delete folder
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Get folder and verify ownership
    const folderCheck = await pool.query(`
      SELECT f.*, w.created_by as world_owner
      FROM image_folders f
      JOIN worlds w ON f.world_id = w.id
      WHERE f.id = $1 AND (f.created_by = $2 OR w.created_by = $2)
    `, [id, req.user.id]);

    if (folderCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Folder not found or access denied' });
    }

    // the folder goes with its subfolders (parent_id cascades); every image in the subtree
    // returns to Unsorted (folder_id is set null), never deleted
    const sub = (await pool.query(
      `WITH RECURSIVE t(id) AS (SELECT id FROM image_folders WHERE id = $1 UNION SELECT f.id FROM image_folders f JOIN t ON f.parent_id = t.id)
       SELECT COUNT(*) - 1 AS subfolders FROM t`, [id])).rows[0];
    await pool.query('DELETE FROM image_folders WHERE id = $1', [id]);

    res.json({ message: 'Folder deleted successfully', subfolders: parseInt(sub.subfolders) });
    
  } catch (error) {
    console.error('Delete folder error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;