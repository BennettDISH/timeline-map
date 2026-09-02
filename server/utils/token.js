const jwt = require('jsonwebtoken');

// Sessions are stateless JWTs the browser holds, so there are only two ways to end one
// early: keep the window short, and give the server a way to disown tokens it already
// signed. TOKEN_TTL does the first. The `tv` (token version) claim does the second —
// authenticateToken compares it against users.token_version, so bumping that column
// (logout, a compromised account) invalidates every token minted before the bump.
//
// Tokens with no `tv` at all are the pre-revocation ones; the middleware rejects those
// too, which costs one sign-in at deploy and clears any already-stolen token.
const TOKEN_TTL = process.env.JWT_EXPIRES_IN || '24h';

const generateToken = (userId, tokenVersion) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is not set.');
  }
  return jwt.sign(
    { userId, tv: Number(tokenVersion) || 0 },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
};

// Sliding session: once a token is past halfway through its life, hand back a fresh one.
// An actively-used browser rides forward and never meets the (deliberately short) expiry,
// while one left idle for a full TTL still does. Returns null when there is nothing to do.
const refreshIfStale = (decoded, tokenVersion) => {
  if (!decoded || !decoded.iat || !decoded.exp) return null;
  const halfway = decoded.iat + (decoded.exp - decoded.iat) / 2;
  if (Math.floor(Date.now() / 1000) < halfway) return null;
  return generateToken(decoded.userId, tokenVersion);
};

module.exports = { generateToken, refreshIfStale, TOKEN_TTL };
