// Resolve a stored image path to a browser-loadable URL.
//
// R2-backed rows store an absolute https URL in images.file_path — pass it through untouched.
// Legacy base64-in-Postgres rows store a relative path (/api/images-base64/serve/<file>) — those
// must be host-prepended so the browser can reach our serve endpoint. Never host-prepend an
// absolute URL, or R2 images 404 from a doubled host.
function resolveImageUrl(req, filePath) {
  if (!filePath) return null;
  if (/^https?:\/\//i.test(filePath)) return filePath;
  return `${req.protocol}://${req.get('host')}${filePath}`;
}

module.exports = { resolveImageUrl };
