// Counting words for the shell pages.
export const plural = (c, w) => `${c} ${w}${c === 1 ? '' : 's'}`
export const entries = (c) => `${c} ${c === 1 ? 'entry' : 'entries'}`
// how long ago, from seconds: "just now", "12 min ago", "3 h ago"
export const ago = (s) => (s < 60 ? 'just now' : s < 3600 ? `${Math.floor(s / 60)} min ago` : `${Math.floor(s / 3600)} h ago`)
