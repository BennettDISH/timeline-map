const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL;
const SSO_CLIENT_ID = process.env.SSO_CLIENT_ID;
const SSO_CLIENT_SECRET = process.env.SSO_CLIENT_SECRET;

async function centralRegister({ username, email, password, first_name, last_name }) {
  const res = await fetch(`${AUTH_SERVICE_URL}/api/auth/proxy/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password, first_name, last_name, client_id: SSO_CLIENT_ID, client_secret: SSO_CLIENT_SECRET })
  });
  return { ok: res.ok, status: res.status, data: await res.json() };
}

async function centralLogin({ email, password }) {
  const res = await fetch(`${AUTH_SERVICE_URL}/api/auth/proxy/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, client_id: SSO_CLIENT_ID, client_secret: SSO_CLIENT_SECRET })
  });
  return { ok: res.ok, status: res.status, data: await res.json() };
}

// Mint a central guest account for this app (one click, no redirect). Server-to-server,
// authenticated by the app's client credentials — the browser never sees them.
async function centralGuest() {
  const res = await fetch(`${AUTH_SERVICE_URL}/api/auth/proxy/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: SSO_CLIENT_ID, client_secret: SSO_CLIENT_SECRET })
  });
  return { ok: res.ok, status: res.status, data: await res.json() };
}

// Tell Waypoint that a user this app keeps signed in itself is still here: the sliding token
// means they never sign in through Waypoint again, and Waypoint prunes a guest it has not seen
// sign in for GUEST_RETENTION_DAYS. It counts as a sign-in there.
async function centralSeen(centralUserId) {
  if (!AUTH_SERVICE_URL) return { ok: false, status: 0 };
  const res = await fetch(`${AUTH_SERVICE_URL}/api/auth/proxy/seen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ central_user_id: centralUserId, client_id: SSO_CLIENT_ID, client_secret: SSO_CLIENT_SECRET })
  });
  return { ok: res.ok, status: res.status };
}

async function exchangeCode(code, redirectUri) {
  const body = {
    grant_type: 'authorization_code',
    code,
    client_id: SSO_CLIENT_ID,
    client_secret: SSO_CLIENT_SECRET
  };
  // The auth-service binds redirect_uri when present (RFC 6749 §4.1.3); send the exact value the
  // authorize request used so we stay compatible when it becomes mandatory.
  if (redirectUri) body.redirect_uri = redirectUri;
  const res = await fetch(`${AUTH_SERVICE_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { ok: res.ok, status: res.status, data: await res.json() };
}

module.exports = { AUTH_SERVICE_URL, SSO_CLIENT_ID, centralRegister, centralLogin, centralGuest, centralSeen, exchangeCode };
