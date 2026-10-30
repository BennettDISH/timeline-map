// Loose ends: the entries that have not come up in a while, so the DM can tie them up. An entry
// comes up when the DM works on it (an edit, a period text, a thread, a placement: the route's
// `touched`) or names it in a session's prep or recap (the era's created_at stands in for when
// that session was played). The Party is never a loose end, and with the clock on, neither is an
// entry whose every placement ended before canon: its story is over. Oldest first.

const NAMELESS = new Set(['untitled', 'new entry', 'new node']);
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };

// a session note's words: tags out, the common entities back, spaces collapsed
const plain = (html) => String(html || '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, e) => ENTITIES[e])
  .replace(/\s+/g, ' ')
  .trim();

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A big world tests its every entry against its every session note, and a pattern holding these
// word edges takes about a millisecond to build. So the edges are built once, here, and the title's
// own pattern, far cheaper, only for a note holding every word of the title. Words split where the
// edges do (the same class and flags), and fold() gives any two letters the pattern counts as one
// the same result: the repeat takes ẞ through ß to ss, and σ stands for ς, which lowercasing picks
// by position. It may join more than the pattern does (ß and ss); then the pattern decides. The test
// checks all of this against every cased letter in Unicode, and against the one whole pattern
// this replaces: (^|[^\p{L}\p{N}])TITLE(?=$|[^\p{L}\p{N}]).
const NOT_WORD = /[^\p{L}\p{N}]+/iu;
const WORD_STARTS = /(?<=^|[^\p{L}\p{N}])/iuy;
const WORD_ENDS = /(?=$|[^\p{L}\p{N}])/iuy;
const fold = (s) => s.toUpperCase().toLowerCase().toUpperCase().toLowerCase().replace(/ς/g, 'σ');
const wordsOf = (text) => new Set(text.split(NOT_WORD).filter(Boolean).map(fold));
const holdsAt = (re, text, i) => { re.lastIndex = i; return re.test(text); };

// Is the entry named in this text? The whole title, any case, not inside a longer word ("Mill"
// is not named by "Millbrook"). A title under three letters or a default one names nothing.
// namer(title) is that test for one title (null when the title names nothing). `words` is
// wordsOf(text).
function namer(title) {
  const t = String(title || '').trim().replace(/\s+/g, ' ');
  if (t.length < 3 || NAMELESS.has(t.toLowerCase())) return null;
  const needs = [...wordsOf(t)];
  let re = null;
  return (text, words) => {
    if (!text || !needs.every((w) => words.has(w))) return false;
    re ??= new RegExp(escape(t), 'giu');
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      if (holdsAt(WORD_STARTS, text, m.index) && holdsAt(WORD_ENDS, text, m.index + m[0].length)) return true;
      re.lastIndex = m.index + (text.codePointAt(m.index) > 0xffff ? 2 : 1); // "a a" may start inside the last try, in "xa a a"
    }
    return false;
  };
}

function names(title, text) {
  return namer(title)?.(text, wordsOf(text)) ?? false;
}

const time = (v) => (v == null ? null : new Date(v).getTime());

// rows: { id, title, category, visibility, interior_map_id, touched, placed, live } from the route
// eras: { name, start_time, prep_note, recap_note, created_at }
function looseEnds(rows, eras, { clockOn = false } = {}) {
  const notes = (eras || []).map((e) => {
    const prep = plain(e.prep_note);
    const recap = plain(e.recap_note);
    return { name: e.name, start: e.start_time ?? 0, at: time(e.created_at) ?? 0, prep, recap, prepWords: wordsOf(prep), recapWords: wordsOf(recap) };
  });
  const out = [];
  for (const r of rows || []) {
    if (r.category === 'party') continue;
    if (clockOn && Number(r.placed) > 0 && Number(r.live) === 0) continue;
    // the latest session that names it; a recap beats a prep (it was played, not just planned)
    let named = null;
    const isNamed = namer(r.title);
    for (const e of isNamed ? notes : []) {
      const note = isNamed(e.recap, e.recapWords) ? 'recap' : isNamed(e.prep, e.prepWords) ? 'prep' : null;
      if (!note) continue;
      if (!named || e.at > named.at || (e.at === named.at && e.start > named.start)) named = { era: e.name, note, at: e.at, start: e.start };
    }
    const touched = time(r.touched) ?? 0;
    const last = Math.max(touched, named?.at ?? 0);
    out.push({
      id: r.id, title: r.title, category: r.category, visibility: r.visibility, hasInterior: !!r.interior_map_id,
      placed: Number(r.placed) > 0, lastUp: new Date(last).toISOString(),
      named: named ? { era: named.era, note: named.note } : null,
    });
  }
  return out.sort((a, b) => a.lastUp.localeCompare(b.lastUp) || String(a.title).localeCompare(String(b.title)) || a.id - b.id);
}

module.exports = { looseEnds, names, plain, fold };
