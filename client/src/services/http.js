import axios from 'axios'

// The one axios instance every AUTHENTICATED service shares. It attaches the token per
// request, and when the server says the token itself is bad (expired / invalid / user gone)
// it clears the session and returns to login — instead of every page silently failing
// forever behind a stale token. Public services (shareService) stay on their own instance.
// 20 s: a save that never answers surfaces as a failure (and a retry) instead of a chip
// stuck on Saving… forever. Long calls (Forge, voice) pass their own timeouts per request.
const http = axios.create({ headers: { 'Content-Type': 'application/json' }, timeout: 20000 })

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
    if (tokenDead && !CREDENTIAL_URL.test(url)) {
      // let the workspace stash unsaved edits first (synchronous listeners), then say why
      try { window.dispatchEvent(new CustomEvent('atlas:auth-expired')) } catch (e) { /* ignore */ }
      try { sessionStorage.setItem('atlas_session_ended', '1') } catch (e) { /* ignore */ }
      localStorage.removeItem('auth_token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default http
