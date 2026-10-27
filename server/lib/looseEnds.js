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

// Is the entry named in this text? The whole title, any case, not inside a longer word ("Mill"
// is not named by "Millbrook"). A title under three letters or a default one names nothing.
function names(title, text) {
  const t = String(title || '').trim().replace(/\s+/g, ' ');
  if (t.length < 3 || NAMELESS.has(t.toLowerCase()) || !text) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escape(t)}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(text);
}

const time = (v) => (v == null ? null : new Date(v).getTime());

// rows: { id, title, category, visibility, interior_map_id, touched, placed, live } from the route
// eras: { name, start_time, prep_note, recap_note, created_at }
function looseEnds(rows, eras, { clockOn = false } = {}) {
  const notes = (eras || []).map((e) => ({
    name: e.name, start: e.start_time ?? 0, at: time(e.created_at) ?? 0, prep: plain(e.prep_note), recap: plain(e.recap_note),
  }));
  const out = [];
  for (const r of rows || []) {
    if (r.category === 'party') continue;
    if (clockOn && Number(r.placed) > 0 && Number(r.live) === 0) continue;
    // the latest session that names it; a recap beats a prep (it was played, not just planned)
    let named = null;
    for (const e of notes) {
      const note = names(r.title, e.recap) ? 'recap' : names(r.title, e.prep) ? 'prep' : null;
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

module.exports = { looseEnds, names, plain };
