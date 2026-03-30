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

async function exchangeCode(code) {
  const res = await fetch(`${AUTH_SERVICE_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, client_id: SSO_CLIENT_ID, client_secret: SSO_CLIENT_SECRET })
  });
  return { ok: res.ok, status: res.status, data: await res.json() };
}

module.exports = { centralRegister, centralLogin, exchangeCode };
