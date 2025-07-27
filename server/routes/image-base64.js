const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const router = express.Router();

// All image routes require authentication
router.use(authenticateToken);

// POST /api/images-base64/upload - Upload image as base64
router.post('/upload', async (req, res) => {
  try {
    const { imageData, originalName, world_id, alt_text, tags } = req.body;

    console.log('Base64 upload request:', {
      hasImageData: !!imageData,
      originalName,
      world_id,
      imageDataLength: imageData ? imageData.length : 0,
      imageDataPrefix: imageData ? imageData.substring(0, 50) : 'none'
    });

    if (!imageData || !originalName || !world_id) {
      return res.status(400).json({ message: 'Image data, original name, and world ID are required' });
    }

    // Verify user owns the world
    const worldCheck = await pool.query(
      'SELECT id FROM worlds WHERE id = $1 AND created_by = $2 AND is_active = true',
      [world_id, req.user.id]
    );

    if (worldCheck.rows.length === 0) {
      return res.status(404).json({ message: 'World not found or access denied' });
    }

    // Validate base64 image data
    const base64Match = imageData.match(/^data:image\/(jpeg|jpg|png|gif|webp);base64,(.+)$/);
    if (!base64Match) {
      return res.status(400).json({ message: 'Invalid image data format' });
    }

    const [, mimeType, base64Data] = base64Match;
    const fileSize = Buffer.byteLength(base64Data, 'base64');
    
    // Check file size (10MB limit)
    if (fileSize > 10485760) {
      return res.status(400).json({ message: 'File size must be less than 10MB' });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomString = Math.round(Math.random() * 1E9);
    const extension = mimeType === 'jpeg' ? 'jpg' : mimeType;
    const filename = `img-${timestamp}-${randomString}.${extension}`;

    // Save to database with base64 data
    const result = await pool.query(`
      INSERT INTO images (filename, original_name, file_path, file_size, mime_type, world_id, uploaded_by, alt_text, tags, base64_data)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      filename,
      originalName,
      `/api/images-base64/serve/${filename}`, // Custom serve endpoint
      fileSize,
      `image/${mimeType}`,
      world_id,
      req.user.id,
      alt_text || null,
      tags ? tags.split(',').map(tag => tag.trim()) : null,
      imageData // Store full base64 data
    ]);

    const imageRecord = result.rows[0];
    const imageUrl = `${req.protocol}://${req.get('host')}/api/images-base64/serve/${filename}`;

    console.log('Base64 upload successful:', {
      id: imageRecord.id,
      filename: imageRecord.filename,
      url: imageUrl,
      hasBase64Data: !!imageRecord.base64_data
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
    console.error('Base64 upload error:', error);
    res.status(500).json({ message: 'Upload failed: ' + error.message });
  }
});

// GET /api/images-base64/serve/:filename - Serve image from base64 data
router.get('/serve/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    console.log('Serving image:', filename);
    
    const result = await pool.query('SELECT base64_data, mime_type FROM images WHERE filename = $1', [filename]);
    
    if (result.rows.length === 0) {
      console.log('Image not found in database:', filename);
      return res.status(404).json({ message: 'Image not found' });
    }

    const { base64_data, mime_type } = result.rows[0];
    
    console.log('Found image:', {
      filename,
      mime_type,
      hasBase64Data: !!base64_data,
      base64Length: base64_data ? base64_data.length : 0
    });
    
    if (!base64_data) {
      return res.status(404).json({ message: 'Image data not found' });
    }

    // Extract base64 data
    const base64Match = base64_data.match(/^data:image\/[^;]+;base64,(.+)$/);
    if (!base64Match) {
      return res.status(500).json({ message: 'Invalid image data format' });
    }

    const imageBuffer = Buffer.from(base64Match[1], 'base64');
    
    res.set({
      'Content-Type': mime_type,
      'Content-Length': imageBuffer.length,
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*'
    });
    
    res.send(imageBuffer);

  } catch (error) {
    console.error('Serve image error:', error);
    res.status(500).json({ message: 'Error serving image: ' + error.message });
  }
});

module.exports = router;