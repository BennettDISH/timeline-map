const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { deleteObject } = require('../storage');
const { storeImage, refuseWithoutStorage } = require('../lib/storeImage');
const { isId } = require('../lib/validate');
const { wrap, ownsWorld, notFound } = require('../lib/route');
const { resolveImageUrl } = require('../utils/imageUrl');
const spend = require('../lib/spend');
const stock = require('../lib/stock');
const router = express.Router();

router.use(authenticateToken);

// GET /api/images/stock: the stock library the node picker offers, and the line that credits it
router.get('/', (req, res) => res.json({ credit: stock.CREDIT, items: stock.list() }));

const shape = (req, row) => ({
  id: row.id, filename: row.filename, originalName: row.original_name, filePath: row.file_path,
  fileSize: row.file_size, mimeType: row.mime_type, altText: row.alt_text, uploadedAt: row.created_at,
  url: resolveImageUrl(req, row.file_path),
});
const COLS = 'id, filename, original_name, file_path, file_size, mime_type, alt_text, created_at';

// POST /api/images/stock {world_id, name}: copy one stock picture into a world's Archive and
// answer with the image, as an upload does. A picture the world already has comes back as it is
// (no second copy, nothing spent). A new copy is fetched from the media bucket (checked against
// its content hash), spends the day's upload allowance like an upload, and lands in R2 under the
// world's prefix; a failed insert takes the object back out.
router.post('/', wrap('Stock pick', "Couldn't add that picture")(async (req, res) => {
  const { world_id, name } = req.body || {};
  if (!isId(world_id) || typeof name !== 'string' || !name) return res.status(400).json({ message: 'A world and a stock picture are required' });
  const item = stock.byName.get(name);
  if (!item) return res.status(400).json({ message: 'There is no stock picture by that name' });
  if (!(await ownsWorld(world_id, req.user.id))) return notFound(res, 'World not found');

  const filename = stock.fileName(item);
  const had = (await pool.query(`SELECT ${COLS} FROM images WHERE world_id=$1 AND filename=$2 ORDER BY id LIMIT 1`, [world_id, filename])).rows[0];
  if (had) return res.json({ image: shape(req, had), kind: item.kind, reused: true });

  if (refuseWithoutStorage(res)) return;
  let buffer;
  try {
    buffer = await stock.fetchStock(item);
  } catch (e) {
    console.error('Stock fetch failed:', e.message);
    return res.status(502).json({ message: "That picture couldn't be fetched just now — try again in a minute" });
  }
  if (!(await spend.charge(req, res, 'upload', Math.max(1, Math.ceil(buffer.length / 1024))))) return;

  const { filePath, storageKey } = await storeImage({ worldId: world_id, filename, buffer, mimeType: 'image/webp' });
  let row;
  try {
    row = (await pool.query(
      `INSERT INTO images (filename, original_name, file_path, file_size, mime_type, world_id, uploaded_by, alt_text, storage_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${COLS}`,
      [filename, `${item.title} (stock)`, filePath, buffer.length, 'image/webp', world_id, req.user.id,
        `Stock ${item.kind} from the Atlas library. ${stock.CREDIT}`.trim(), storageKey])).rows[0];
  } catch (e) {
    await deleteObject(storageKey).catch((err) => console.error('R2 cleanup after failed insert:', err.message));
    throw e;
  }
  res.json({ image: shape(req, row), kind: item.kind, reused: false });
}));

module.exports = router;
