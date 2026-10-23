const { r2Enabled, putObject } = require('../storage');

const NO_STORAGE = 'Images cannot be saved yet: this server has no image storage (R2) set up';

// Where an image's bytes live, decided once for the upload and the Forge's paintings: on R2,
// always. The row keeps only the object key and the absolute URL. With R2 off there is nowhere
// to put them (no base64 in Postgres any more), so this throws; callers run
// `refuseWithoutStorage` first so nothing is charged or painted for a file that cannot be kept.
async function storeImage({ worldId, filename, buffer, mimeType }) {
  if (!r2Enabled) throw Object.assign(new Error('R2 is not configured'), { userMessage: NO_STORAGE });
  const storageKey = `worlds/${worldId}/${filename}`;
  const filePath = await putObject(storageKey, buffer, mimeType); // absolute R2 URL
  return { filePath, storageKey };
}

// Answers 503 and returns true when R2 is off (use before any spend or paid call).
function refuseWithoutStorage(res) {
  if (r2Enabled) return false;
  res.status(503).json({ message: NO_STORAGE });
  return true;
}

module.exports = { storeImage, refuseWithoutStorage, NO_STORAGE };
