const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// GET /api/image-folders?world_id=123 - Get all folders for a world
router.get('/', async (req, res) => {
  try {
    const { world_id } = req.query;

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

    // Get all folders for this world
    const result = await pool.query(`
      SELECT f.*, 
             parent.name as parent_name,
             COUNT(DISTINCT child.id) as child_count
      FROM image_folders f
      LEFT JOIN image_folders parent ON f.parent_id = parent.id
      LEFT JOIN image_folders child ON f.id = child.parent_id
      WHERE f.world_id = $1
      GROUP BY f.id, parent.name
      ORDER BY f.parent_id NULLS FIRST, f.name
    `, [world_id]);

    const folders = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      parentId: row.parent_id,
      parentName: row.parent_name,
      worldId: row.world_id,
      createdBy: row.created_by,
      createdAt: row.created_at,
      color: row.color,
      icon: row.icon,
      childCount: parseInt(row.child_count)
    }));

    res.json({ folders });
    
  } catch (error) {
    console.error('Get folders error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// POST /api/image-folders - Create a new folder
router.post('/', async (req, res) => {
  try {
    const { name, parent_id, world_id, color = '#4CAF50', icon = '📁' } = req.body;

    if (!name || !world_id) {
      return res.status(400).json({ message: 'Name and world_id are required' });
    }

    // Verify user owns the world
    const worldCheck = await pool.query(
      'SELECT id FROM worlds WHERE id = $1 AND created_by = $2 AND is_active = true',
      [world_id, req.user.id]
    );

    if (worldCheck.rows.length === 0) {
      return res.status(404).json({ message: 'World not found or access denied' });
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

    // Create the folder
    const result = await pool.query(`
      INSERT INTO image_folders (name, parent_id, world_id, created_by, color, icon)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [name.trim(), parent_id || null, world_id, req.user.id, color, icon]);

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
        color: folder.color,
        icon: folder.icon,
        childCount: 0
      }
    });
    
  } catch (error) {
    if (error.code === '23505') { // Unique constraint violation
      return res.status(400).json({ message: 'A folder with this name already exists in this location' });
    }
    console.error('Create folder error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// PUT /api/image-folders/:id - Update folder
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, color, icon } = req.body;

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

    // Update folder
    const result = await pool.query(`
      UPDATE image_folders 
      SET name = COALESCE($1, name), 
          color = COALESCE($2, color), 
          icon = COALESCE($3, icon)
      WHERE id = $4
      RETURNING *
    `, [name?.trim(), color, icon, id]);

    const folder = result.rows[0];

    res.json({ 
      message: 'Folder updated successfully',
      folder: {
        id: folder.id,
        name: folder.name,
        parentId: folder.parent_id,
        worldId: folder.world_id,
        createdBy: folder.created_by,
        createdAt: folder.created_at,
        color: folder.color,
        icon: folder.icon
      }
    });
    
  } catch (error) {
    if (error.code === '23505') { // Unique constraint violation
      return res.status(400).json({ message: 'A folder with this name already exists in this location' });
    }
    console.error('Update folder error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
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

    // Check if folder has children
    const childrenCheck = await pool.query(
      'SELECT COUNT(*) as count FROM image_folders WHERE parent_id = $1',
      [id]
    );

    if (parseInt(childrenCheck.rows[0].count) > 0) {
      return res.status(400).json({ message: 'Cannot delete folder that contains subfolders. Delete subfolders first.' });
    }

    // Delete folder (this will also remove any image associations via cascade)
    await pool.query('DELETE FROM image_folders WHERE id = $1', [id]);

    res.json({ message: 'Folder deleted successfully' });
    
  } catch (error) {
    console.error('Delete folder error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

module.exports = router;