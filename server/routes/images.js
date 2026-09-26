const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { r2Enabled, deleteObject } = require('../storage');
const { resolveImageUrl } = require('../utils/imageUrl');
const { idParam, isId, whole, text } = require('../lib/validate');
const router = express.Router();
router.param('id', idParam);

// An image belongs to whoever uploaded it or owns the world it lives in — the same
// world-owner rule as every other route; nobody reaches across tenants
const canTouch = async (image, userId) => image.uploaded_by === userId
  || (await pool.query('SELECT 1 FROM images i JOIN worlds w ON w.id = i.world_id WHERE i.id = $1 AND w.created_by = $2', [image.id, userId])).rows.length > 0;

// All image routes require authentication
router.use(authenticateToken);

// GET /api/images
router.get('/', async (req, res) => {
  try {
    const { tags, search, world_id, folder_id, unassigned } = req.query;

    if (!isId(world_id)) {
      return res.status(400).json({ message: 'World ID is required' });
    }
    // a page is 1 to 200 images from a whole offset; anything else is the caller's mistake
    const limit = req.query.limit == null ? 50 : whole(req.query.limit);
    const offset = req.query.offset == null ? 0 : whole(req.query.offset);
    if (limit == null || limit < 1 || limit > 200 || offset == null || offset < 0) return res.status(400).json({ message: 'limit is 1 to 200 and offset is a whole number' });
    if (folder_id != null && folder_id !== '' && !isId(folder_id)) return res.status(400).json({ message: 'That is not a folder id' });

    // Verify user owns the world
    const worldCheck = await pool.query(
      'SELECT id FROM worlds WHERE id = $1 AND created_by = $2 AND is_active = true',
      [world_id, req.user.id]
    );

    if (worldCheck.rows.length === 0) {
      return res.status(404).json({ message: 'World not found' });
    }
    
    // Shared WHERE fragments so the page query and the total-count query always agree.
    let filters = '';
    const params = [world_id];
    let paramCount = 1;

    // Filter by tags if provided
    if (tags) {
      paramCount++;
      filters += ` AND i.tags && $${paramCount}`;
      params.push(tags.split(',').map(tag => tag.trim()));
    }

    // Search in filename or alt_text — the typed text is matched literally (\, % and _ are escaped)
    if (search) {
      paramCount++;
      filters += ` AND (i.original_name ILIKE $${paramCount} ESCAPE '\\' OR i.alt_text ILIKE $${paramCount} ESCAPE '\\')`;
      params.push(`%${String(search).replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    }

    // Filter by folder
    if (folder_id) {
      paramCount++;
      filters += ` AND i.folder_id = $${paramCount}`;
      params.push(folder_id);
    }

    // Filter for unassigned (no folder)
    if (unassigned === 'true') {
      filters += ` AND i.folder_id IS NULL`;
    }

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM images i WHERE i.world_id = $1${filters}`, params);
    const total = parseInt(countResult.rows[0].count);

    // map_uses/node_uses: where this image is placed in the world (backdrop / node art),
    // so the UI can say "in use" before anyone deletes it.
    const query = `
      SELECT i.id, i.filename, i.original_name, i.file_path, i.file_size, i.mime_type, i.alt_text, i.tags, i.folder_id, i.created_at,
             u.username as uploaded_by_username,
             (SELECT COUNT(*) FROM maps m WHERE m.image_id = i.id AND m.is_active = true) as map_uses,
             (SELECT COUNT(*) FROM nodes n WHERE n.image_id = i.id) as node_uses,
             (SELECT COUNT(*) FROM map_backdrops b WHERE b.image_id = i.id) as backdrop_uses,
             (SELECT COUNT(*) FROM world_minds wm WHERE wm.style_image_id = i.id) as anchor_uses
      FROM images i
      LEFT JOIN users u ON i.uploaded_by = u.id
      WHERE i.world_id = $1${filters}
      ORDER BY i.created_at DESC LIMIT $${++paramCount} OFFSET $${++paramCount}`;
    params.push(limit, offset);

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
      usage: { maps: parseInt(row.map_uses), nodes: parseInt(row.node_uses),
               backdrops: parseInt(row.backdrop_uses), anchor: parseInt(row.anchor_uses) },
      url: resolveImageUrl(req, row.file_path)
    }));

    res.json({
      images,
      total,
      hasMore: offset + images.length < total
    });
    
  } catch (error) {
    console.error('Get images error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/images/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT i.id, i.filename, i.original_name, i.file_path, i.file_size, i.mime_type, i.alt_text, i.tags, i.folder_id, i.created_at,
             u.username as uploaded_by_username
      FROM images i
      LEFT JOIN users u ON i.uploaded_by = u.id
      JOIN worlds w ON i.world_id = w.id
      WHERE i.id = $1 AND w.created_by = $2 AND w.is_active = true
    `, [id, req.user.id]);

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
      url: resolveImageUrl(req, row.file_path)
    };

    res.json({ image });
    
  } catch (error) {
    console.error('Get image error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// the ids of a bulk request: 1 to 500 distinct canonical ids, all in the caller's worlds
async function ownedIds(req) {
  const raw = Array.isArray(req.body?.ids) ? req.body.ids : null;
  if (!raw || !raw.length || raw.length > 500 || !raw.every(isId)) return null;
  const ids = [...new Set(raw.map(Number))];
  const r = await pool.query(
    'SELECT i.id FROM images i JOIN worlds w ON w.id = i.world_id WHERE i.id = ANY($1::int[]) AND w.created_by = $2 AND w.is_active = true', [ids, req.user.id]);
  return r.rows.length === ids.length ? ids : null;
}
// PUT /api/images/bulk - file many images under one folder (null = Unsorted) in one request
router.put('/bulk', async (req, res) => {
  try {
    const ids = await ownedIds(req);
    if (!ids) return res.status(400).json({ message: 'ids must be your own images (1 to 500)' });
    const folder_id = req.body.folder_id;
    if (folder_id != null) {
      if (!isId(folder_id)) return res.status(400).json({ message: 'That is not a folder id' });
      // one folder, and every image in its world
      const f = (await pool.query('SELECT world_id FROM image_folders WHERE id=$1', [folder_id])).rows[0];
      const same = f && (await pool.query('SELECT COUNT(*) FROM images WHERE id = ANY($1::int[]) AND world_id = $2', [ids, f.world_id])).rows[0];
      if (!f || parseInt(same.count) !== ids.length) return res.status(400).json({ message: 'That folder is not in the images\' world' });
    }
    const r = await pool.query('UPDATE images SET folder_id = $1 WHERE id = ANY($2::int[])', [folder_id == null ? null : Number(folder_id), ids]);
    res.json({ ok: true, moved: r.rowCount });
  } catch (error) {
    console.error('Bulk move error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
// DELETE /api/images/bulk - remove many images in one request (their R2 objects go too, best effort)
router.delete('/bulk', async (req, res) => {
  try {
    const ids = await ownedIds(req);
    if (!ids) return res.status(400).json({ message: 'ids must be your own images (1 to 500)' });
    const del = await pool.query('DELETE FROM images WHERE id = ANY($1::int[]) RETURNING storage_key', [ids]);
    if (r2Enabled) {
      for (const row of del.rows) if (row.storage_key) await deleteObject(row.storage_key).catch((e) => console.error('R2 delete failed (DB row already removed):', e.message));
    }
    res.json({ ok: true, deleted: del.rowCount });
  } catch (error) {
    console.error('Bulk delete error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/images/:id - Update image metadata
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { alt_text, tags, folder_id } = req.body;
    const sets = [], vals = [];
    if ('original_name' in req.body) {
      const nm = text(req.body.original_name, 255, { required: true });
      if (nm === undefined) return res.status(400).json({ message: 'A name is 1 to 255 characters' });
      sets.push('original_name'); vals.push(nm);
    }
    if ('alt_text' in req.body) { // a caption: '' or null clears it
      const cap = alt_text == null ? null : text(alt_text, 2000);
      if (cap === undefined) return res.status(400).json({ message: 'A caption is text' });
      sets.push('alt_text'); vals.push(cap || null);
    }
    
    // Get image info first to check ownership
    const imageResult = await pool.query('SELECT id, uploaded_by, world_id, alt_text, tags, folder_id, storage_key, file_path, filename FROM images WHERE id = $1', [id]); // metadata only — never the bytes
    
    if (imageResult.rows.length === 0) {
      return res.status(404).json({ message: 'Image not found' });
    }

    const image = imageResult.rows[0];
    
    if (!(await canTouch(image, req.user.id))) {
      return res.status(403).json({ message: "That image isn't in one of your worlds" });
    }

    // If folder_id is provided, verify it exists and belongs to the same world (null = Unsorted)
    if ('folder_id' in req.body) {
      if (folder_id != null) {
        if (!isId(folder_id) || !(await pool.query('SELECT id FROM image_folders WHERE id = $1 AND world_id = $2', [folder_id, image.world_id])).rows.length) {
          return res.status(400).json({ message: 'That folder is not in this world' });
        }
      }
      sets.push('folder_id'); vals.push(folder_id == null ? null : Number(folder_id));
    }
    if ('tags' in req.body) {
      sets.push('tags'); vals.push(tags ? (typeof tags === 'string' ? tags.split(',').map(tag => tag.trim()).filter(Boolean) : tags) : null);
    }
    if (!sets.length) return res.status(400).json({ message: 'Nothing to change' });

    // Update image metadata
    const updateResult = await pool.query(`
      UPDATE images SET ${sets.map((c, i) => `${c} = $${i + 1}`).join(', ')}
      WHERE id = $${sets.length + 1}
      RETURNING id, filename, original_name, file_path, file_size, mime_type, alt_text, tags, folder_id, created_at
    `, [...vals, id]);

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
        url: resolveImageUrl(req, updatedImage.file_path)
      }
    });
    
  } catch (error) {
    console.error('Update image error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/images/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get image info first
    const imageResult = await pool.query('SELECT id, uploaded_by, world_id, alt_text, tags, folder_id, storage_key, file_path, filename FROM images WHERE id = $1', [id]); // metadata only — never the bytes
    
    if (imageResult.rows.length === 0) {
      return res.status(404).json({ message: 'Image not found' });
    }

    const image = imageResult.rows[0];
    
    if (!(await canTouch(image, req.user.id))) {
      return res.status(403).json({ message: "That image isn't in one of your worlds" });
    }

    // Delete from database, capturing the R2 key so we can remove the object too
    const del = await pool.query('DELETE FROM images WHERE id = $1 RETURNING storage_key', [id]);

    // Best-effort R2 cleanup — never block the DB delete on a storage hiccup
    if (r2Enabled && del.rows[0] && del.rows[0].storage_key) {
      try {
        await deleteObject(del.rows[0].storage_key);
      } catch (e) {
        console.error('R2 delete failed (DB row already removed):', e.message);
      }
    }

    res.json({ message: 'Image deleted successfully' });
    
  } catch (error) {
    console.error('Delete image error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;