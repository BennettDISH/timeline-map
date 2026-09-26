const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { deleteObject } = require('../storage');
const { storeImage } = require('../lib/storeImage');
const { isId } = require('../lib/validate');
const { ownsWorld, notFound } = require('../lib/route');
const { resolveImageUrl } = require('../utils/imageUrl');
const router = express.Router();

// POST /api/images/upload (and the older /api/images-base64/upload): the bytes arrive
// base64-encoded in a JSON body and land in R2 — or, with no R2 configured, in Postgres
// (the fallback the /serve route below reads back).
const upload = async (req, res) => {
  try {
    const { imageData, world_id, alt_text, folder_id } = req.body;
    // a name is a string of 1 to 255 characters (a pasted file arrives as 'image.png')
    const originalName = typeof req.body.originalName === 'string' ? req.body.originalName.trim().slice(0, 255) : '';

    if (!imageData || !originalName || !isId(world_id)) {
      return res.status(400).json({ message: 'Image data, original name, and world ID are required' });
    }

    if (!(await ownsWorld(world_id, req.user.id))) return notFound(res, 'World not found');

    // Validate base64 image data
    const base64Match = typeof imageData === 'string' && imageData.match(/^data:image\/(jpeg|jpg|png|gif|webp);base64,(.+)$/);
    if (!base64Match) {
      return res.status(400).json({ message: 'Only PNG, JPEG, GIF or WebP images can be uploaded' });
    }

    const [, declared, base64Data] = base64Match;
    const buffer = Buffer.from(base64Data, 'base64');
    const fileSize = buffer.length;

    // Check file size (10MB limit)
    if (fileSize > 10485760) {
      return res.status(400).json({ message: 'File size must be less than 10MB' });
    }
    // the BYTES decide what it is, not the name or the declared type: a text file called
    // x.png is refused instead of becoming a broken tile
    const sniffed = sniff(buffer);
    if (!sniffed) return res.status(400).json({ message: 'That file is not a PNG, JPEG, GIF or WebP image' });
    const mimeType = sniffed; // the real type wins over the declared one
    void declared;
    // an optional folder must be one of this world's
    let folderId = null;
    if (folder_id != null && folder_id !== '') {
      if (!isId(folder_id) || !(await pool.query('SELECT 1 FROM image_folders WHERE id=$1 AND world_id=$2', [folder_id, world_id])).rows.length) {
        return res.status(400).json({ message: 'That folder is not in this world' });
      }
      folderId = Number(folder_id);
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomString = Math.round(Math.random() * 1E9);
    const extension = mimeType === 'jpeg' ? 'jpg' : mimeType;
    const filename = `img-${timestamp}-${randomString}.${extension}`;

    // R2 when configured, else the Postgres fallback (lib/storeImage decides)
    const { filePath: filePathValue, storageKey, base64ToStore } = await storeImage({ worldId: world_id, filename, buffer, mimeType: `image/${mimeType}`, dataUrl: imageData });

    let result;
    try {
      result = await pool.query(`
        INSERT INTO images (filename, original_name, file_path, file_size, mime_type, world_id, uploaded_by, alt_text, base64_data, storage_key, folder_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `, [
        filename,
        originalName,
        filePathValue,
        fileSize,
        `image/${mimeType}`,
        world_id,
        req.user.id,
        typeof alt_text === 'string' && alt_text.trim() ? alt_text.trim().slice(0, 2000) : null,
        base64ToStore,
        storageKey,
        folderId,
      ]);
    } catch (e) {
      // the object went up before the row: a failed insert must not leave it behind
      if (storageKey) await deleteObject(storageKey).catch((err) => console.error('R2 cleanup after failed insert:', err.message));
      throw e;
    }

    const imageRecord = result.rows[0];
    const imageUrl = resolveImageUrl(req, imageRecord.file_path);

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
        uploadedAt: imageRecord.created_at,
        url: imageUrl
      }
    });

  } catch (error) {
    console.error('Base64 upload error:', error);
    res.status(500).json({ message: 'Upload failed' });
  }
};
router.post('/upload', authenticateToken, upload);

// the first bytes of each accepted format; 'jpg' and 'jpeg' both store as image/jpeg
function sniff(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'gif';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

// GET /api/images-base64/serve/:filename - Serve image from base64 data (PUBLIC - no auth required)
router.get('/serve/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    const result = await pool.query('SELECT base64_data, mime_type FROM images WHERE filename = $1', [filename]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Image not found' });
    }

    const { base64_data, mime_type } = result.rows[0];

    // only Postgres-fallback rows have bytes here; R2-backed rows are never referenced by this
    // path (resolveImageUrl hands out their absolute URL), so there is nothing to redirect to
    if (!base64_data) return res.status(404).json({ message: 'Image data not found' });

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
    res.status(500).json({ message: 'Error serving image' });
  }
});

module.exports = router;
module.exports.upload = upload;