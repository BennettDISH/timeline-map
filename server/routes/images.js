const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Create unique filename with timestamp and random string
    const timestamp = Date.now();
    const randomString = Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname).toLowerCase();
    const filename = `img-${timestamp}-${randomString}${extension}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760 // 10MB default
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = (process.env.ALLOWED_FILE_TYPES || 'image/jpeg,image/png,image/gif,image/webp,image/jpg').split(',');
    
    // Also check file extension as backup
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const fileExtension = path.extname(file.originalname).toLowerCase();
    
    if (allowedTypes.includes(file.mimetype) && allowedExtensions.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Allowed: ${allowedExtensions.join(', ')}`), false);
    }
  }
});

// All image routes require authentication
router.use(authenticateToken);

// POST /api/images/upload
router.post('/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const { alt_text, tags, world_id } = req.body;

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

    // Save file info to database
    const result = await pool.query(`
      INSERT INTO images (filename, original_name, file_path, file_size, mime_type, world_id, uploaded_by, alt_text, tags)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      req.file.filename,
      req.file.originalname,
      `/uploads/${req.file.filename}`,
      req.file.size,
      req.file.mimetype,
      world_id,
      req.user.id,
      alt_text || null,
      tags ? tags.split(',').map(tag => tag.trim()) : null
    ]);

    const imageRecord = result.rows[0];

    const imageUrl = `${req.protocol}://${req.get('host')}${imageRecord.file_path}`;
    
    console.log('Image uploaded successfully:', {
      filename: imageRecord.filename,
      filePath: imageRecord.file_path,
      fullPath: path.join(__dirname, '../uploads', imageRecord.filename),
      url: imageUrl,
      fileExists: require('fs').existsSync(path.join(__dirname, '../uploads', imageRecord.filename))
    });

    res.json({ 
      message: 'File uploaded successfully',
      image: {
        id: imageRecord.id,
        filename: imageRecord.filename,
        originalName: imageRecord.original_name,
        filePath: imageRecord.file_path,
        fileSize: imageRecord.file_size,
        mimeType: imageRecord.mime_type,
        altText: imageRecord.alt_text,
        tags: imageRecord.tags,
        uploadedAt: imageRecord.created_at,
        url: imageUrl
      }
    });

  } catch (error) {
    console.error('Upload error:', error);
    
    // Clean up file if database insert failed
    if (req.file) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error('Failed to clean up file:', cleanupError);
      }
    }
    
    res.status(500).json({ message: 'Upload failed: ' + error.message });
  }
});

// GET /api/images
router.get('/', async (req, res) => {
  try {
    const { tags, search, limit = 50, offset = 0, world_id } = req.query;

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

    // Delete from database first
    await pool.query('DELETE FROM images WHERE id = $1', [id]);

    // Delete physical file
    const filePath = path.join(uploadsDir, image.filename);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (fileError) {
      console.error('Failed to delete physical file:', fileError);
      // Continue - database deletion succeeded
    }

    res.json({ message: 'Image deleted successfully' });
    
  } catch (error) {
    console.error('Delete image error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

module.exports = router;