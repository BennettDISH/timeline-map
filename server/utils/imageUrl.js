// Resolve a stored image path to a browser-loadable URL.
//
// R2-backed rows store an absolute https URL in images.file_path — pass it through untouched.
// The sample world's art stores a relative path (/sample/<file>), which must be host-prepended so
// the browser can reach it. Never host-prepend an absolute URL, or R2 images 404 from a doubled host.
function resolveImageUrl(req, filePath) {
  if (!filePath) return null;
  if (/^https?:\/\//i.test(filePath)) return filePath;
  return `${req.protocol}://${req.get('host')}${filePath}`;
}

module.exports = { resolveImageUrl };
