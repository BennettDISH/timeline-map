import axios from 'axios'

// The one axios instance every AUTHENTICATED service shares. It attaches the token per
// request, and when the server says the token itself is bad (expired / invalid / user gone)
// it clears the session and returns to login — instead of every page silently failing
// forever behind a stale token. Public services (shareService) stay on their own instance.
// 20 s: a save that never answers surfaces as a failure (and a retry) instead of a chip
// stuck on Saving… forever. Long calls (Forge, voice) pass their own timeouts per request.
const http = axios.create({ headers: { 'Content-Type': 'application/json' }, timeout: 20000 })

// Forget this browser's session AND its per-account pointers (the last map, the current
// world): the next account on this browser must never land in someone else's world.
export const clearLocalSession = () => {
  for (const k of ['auth_token', 'user', 'atlas_last_location', 'current_world', 'current_world_id']) {
    try { localStorage.removeItem(k) } catch (e) { /* ignore */ }
  }
}

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Credential endpoints legitimately return 401/403 to a user who is TRYING to log in;
// never bounce those. Everywhere else, only bounce when the message is about the token —
// a plain "insufficient permissions" 403 (e.g. non-admin hitting /api/admin) is not a
// reason to end the session.
// `logout` is in here for the opposite reason to the others: it is the one call that is
// SUPPOSED to end the session, so a 401/403 from it is expected, not a signal to hard-
// redirect on top of the sign-out the caller is already performing.
const CREDENTIAL_URL = /\/auth\/(login|logout|register|guest|sso)/
const TOKEN_MSG = /token|access token|user not found/i

http.interceptors.response.use(
  (response) => {
    // sliding session: the server hands back a fresh token past the halfway mark
    const fresh = response.headers?.['x-refreshed-token']
    if (fresh) { try { localStorage.setItem('auth_token', fresh) } catch (e) { /* ignore */ } }
    return response
  },
  (error) => {
    const status = error.response?.status
    const message = error.response?.data?.message || ''
    const url = error.config?.url || ''
    const tokenDead = status === 401 || (status === 403 && TOKEN_MSG.test(message))
    if (tokenDead && !CREDENTIAL_URL.test(url) && !/^\/p(\/|$)/.test(window.location.pathname)) { // never off a player's page
      // let the workspace stash unsaved edits first (synchronous listeners), then say why
      try { window.dispatchEvent(new CustomEvent('atlas:auth-expired')) } catch (e) { /* ignore */ }
      try { sessionStorage.setItem('atlas_session_ended', '1') } catch (e) { /* ignore */ }
      clearLocalSession()
      window.location.href = `/login?reason=expired&next=${encodeURIComponent(window.location.pathname)}`
    }
    return Promise.reject(error)
  }
)

// The one sentence a failure shows. The server's own answer is used when it is one (a 4xx:
// 'A lifespan ends after it starts', 'You already have a world with this name'); a 5xx, a
// timeout or no network gets the caller's fallback — with a connection hint when nothing
// answered at all — never axios's 'Request failed with status code 502' or a bare 'Server error'.
export const errText = (e, fallback = 'Something went wrong — try again') => {
  const status = e?.response?.status
  const msg = e?.response?.data?.message
  if (status && status < 500 && typeof msg === 'string' && msg.trim()) return msg
  if (e?.isAxiosError && !e.response) return fallback.includes(' — ') ? fallback : `${fallback} — check your connection`
  return fallback
}
// a refused save (400/409: the server said what was wrong) is not retried; a blip is
export const refused = (e) => { const s = e?.response?.status; return s >= 400 && s < 500 }

export default http
