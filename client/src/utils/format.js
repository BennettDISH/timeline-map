// Counting words for the shell pages.
export const plural = (c, w) => `${c} ${w}${c === 1 ? '' : 's'}`
export const entries = (c) => `${c} ${c === 1 ? 'entry' : 'entries'}`
