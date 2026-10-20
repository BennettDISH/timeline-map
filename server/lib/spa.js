// The SPA's share of routing: which requests get the app's page and which never may.
//
// A client route (/w/3/m/7, /p/<token>, /auth/callback) gets the page so a direct load or a
// refresh works. The API and anything that names a file (an image, a script, a stylesheet
// that is not in the build) get a JSON 404 instead: an <img> pointed at a wrong URL, or a
// probe, must never get the app's HTML back as if it were the file.

// //api/images-base64/serve/x.png is the same request as /api/images-base64/serve/x.png (a
// base URL ending in / joined to a path starting with /). Without this it missed every API
// route and fell to the page. Runs first, so the routers and helmet see the plain path.
function collapseLeadingSlashes(req, res, next) {
  if (req.url.startsWith('//')) req.url = req.url.replace(/^\/{2,}/, '/');
  next();
}

const API_PATH = /^\/+api(\/|$)/;
// the last segment ends in an extension: no client route does (ids are numbers, share tokens
// are base64url)
const FILE_PATH = /\.[A-Za-z0-9]{1,8}$/;

function wantsPage(path) {
  return !API_PATH.test(path) && !FILE_PATH.test(path);
}

// The fallback handler: the page for client routes, next() (the JSON 404) for the rest.
// `pageFor(req)` picks which copy of index.html this request gets. Mounted with app.use and
// no path, so it reads the same on every Express: '/{*path}' is Express 5's spelling, and on
// a stale Express 4 install it matched no client route at all, / included.
function spaFallback(pageFor) {
  return (req, res, next) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || !wantsPage(req.path)) return next();
    res.type('html').send(pageFor(req));
  };
}

module.exports = { collapseLeadingSlashes, wantsPage, spaFallback };
