// Where sign-in may send you: a path on this site only. "//x" and "/\x" (a browser reads the
// backslash as a slash) name another site, and a tab or newline is dropped by the browser on the
// way to the same thing, so any of those goes to "/" instead.
export const safeNext = (v) =>
  (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') && !/[\\\u0000-\u001f]/.test(v) ? v : '/')
