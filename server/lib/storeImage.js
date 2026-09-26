const { r2Enabled, putObject } = require('../storage');

// Where an image's bytes live, decided once for the upload, the Forge's paintings and the
// clone: R2 when it is configured (the row keeps the object key and the absolute URL), else
// the Postgres fallback (the bytes stay in base64_data and the /serve route streams them).
async function storeImage({ worldId, filename, buffer, mimeType, dataUrl }) {
  if (r2Enabled) {
    const storageKey = `worlds/${worldId}/${filename}`;
    const filePath = await putObject(storageKey, buffer, mimeType); // absolute R2 URL
    return { filePath, storageKey, base64ToStore: null };
  }
  return { filePath: `/api/images-base64/serve/${filename}`, storageKey: null, base64ToStore: dataUrl };
}

module.exports = { storeImage };
