const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// All image routes require authentication
router.use(authenticateToken);

// GET /api/images
router.get('/', async (req, res) => {
  try {
    const { tags, search, limit = 50, offset = 0, world_id, folder_id, unassigned } = req.query;

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
      SELECT i.*, u.username as uploaded_by_username
      FROM images i
      LEFT JOIN users u ON i.uploaded_by = u.id
      WHERE i.world_id = $1
    `;
    const params = [world_id];
    let paramCount = 1;

    // Filter by tags if provided
    if (tags) {
      paramCount++;
      query += ` AND i.tags && $${paramCount}`;
      params.push(tags.split(',').map(tag => tag.trim()));
    }

    // Search in filename or alt_text
    if (search) {
      paramCount++;
      query += ` AND (i.original_name ILIKE $${paramCount} OR i.alt_text ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }

    // Filter by folder
    if (folder_id) {
      paramCount++;
      query += ` AND i.folder_id = $${paramCount}`;
      params.push(folder_id);
    }

    // Filter for unassigned (no folder)
    if (unassigned === 'true') {
      query += ` AND i.folder_id IS NULL`;
    }

    query += ` ORDER BY i.created_at DESC LIMIT $${++paramCount} OFFSET $${++paramCount}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);
    
    const images = result.rows.map(row => ({
      id: row.id,
      filename: row.filename,
      originalName: row.original_name,
      filePath: row.file_path,
      fileSize: row.file_size,
      mimeType: row.mime_type,
      altText: row.alt_text,
      tags: row.tags,
      folderId: row.folder_id,
      uploadedAt: row.created_at,
      uploadedBy: row.uploaded_by_username,
      url: `${req.protocol}://${req.get('host')}${row.file_path}`
    }));

    res.json({ 
      images,
      total: images.length,
      hasMore: images.length === parseInt(limit)
    });
    
  } catch (error) {
    console.error('Get images error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// GET /api/images/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT i.*, u.username as uploaded_by_username
      FROM images i
      LEFT JOIN users u ON i.uploaded_by = u.id
      WHERE i.id = $1
    `, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Image not found' });
    }

    const row = result.rows[0];
    const image = {
      id: row.id,
      filename: row.filename,
      originalName: row.original_name,
      filePath: row.file_path,
      fileSize: row.file_size,
      mimeType: row.mime_type,
      altText: row.alt_text,
      tags: row.tags,
      folderId: row.folder_id,
      uploadedAt: row.created_at,
      uploadedBy: row.uploaded_by_username,
      url: `${req.protocol}://${req.get('host')}${row.file_path}`
    };

    res.json({ image });
    
  } catch (error) {
    console.error('Get image error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// PUT /api/images/:id - Update image metadata
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { alt_text, tags, folder_id } = req.body;
    
    // Get image info first to check ownership
    const imageResult = await pool.query('SELECT * FROM images WHERE id = $1', [id]);
    
    if (imageResult.rows.length === 0) {
      return res.status(404).json({ message: 'Image not found' });
    }

    const image = imageResult.rows[0];
    
    // Check if user owns the image or is admin
    if (image.uploaded_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to update this image' });
    }

    // If folder_id is provided, verify it exists and belongs to the same world
    if (folder_id) {
      const folderCheck = await pool.query(
        'SELECT id FROM image_folders WHERE id = $1 AND world_id = $2',
        [folder_id, image.world_id]
      );

      if (folderCheck.rows.length === 0) {
        return res.status(400).json({ message: 'Invalid folder ID or folder does not belong to this world' });
      }
    }

    // Update image metadata
    const updateResult = await pool.query(`
      UPDATE images 
      SET alt_text = $1, tags = $2, folder_id = $3
      WHERE id = $4
      RETURNING *
    `, [
      alt_text || image.alt_text,
      tags ? (typeof tags === 'string' ? tags.split(',').map(tag => tag.trim()) : tags) : image.tags,
      folder_id !== undefined ? folder_id : image.folder_id,
      id
    ]);

    const updatedImage = updateResult.rows[0];
    
    res.json({ 
      message: 'Image updated successfully',
      image: {
        id: updatedImage.id,
        filename: updatedImage.filename,
        originalName: updatedImage.original_name,
        filePath: updatedImage.file_path,
        fileSize: updatedImage.file_size,
        mimeType: updatedImage.mime_type,
        altText: updatedImage.alt_text,
        tags: updatedImage.tags,
        folderId: updatedImage.folder_id,
        uploadedAt: updatedImage.created_at,
        url: `${req.protocol}://${req.get('host')}${updatedImage.file_path}`
      }
    });
    
  } catch (error) {
    console.error('Update image error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// DELETE /api/images/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get image info first
    const imageResult = await pool.query('SELECT * FROM images WHERE id = $1', [id]);
    
    if (imageResult.rows.length === 0) {
      return res.status(404).json({ message: 'Image not found' });
    }

    const image = imageResult.rows[0];
    
    // Check if user owns the image or is admin
    if (image.uploaded_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not authorized to delete this image' });
    }

    // Delete from database
    await pool.query('DELETE FROM images WHERE id = $1', [id]);

    res.json({ message: 'Image deleted successfully' });
    
  } catch (error) {
    console.error('Delete image error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

module.exports = router;