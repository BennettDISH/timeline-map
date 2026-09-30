// The DM's session notes (the Session notes box: eras.prep_note / recap_note), as the mind reads
// them: plain text, newest session first, within a budget. A recap is what happened at the
// table; a prep is the plan before it was played. The notes are stored as cleaned HTML (the
// client's utils/richNote.js), or plain text from before the box was rich.
const pool = require('../config/database');

const NOTES_BUDGET = 30000; // characters across every session shown

// rich note → plain text: headings marked, list items as "- ", paragraphs on their own lines
function noteText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<(h3|h4)[^>]*>/gi, '\n## ')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|h3|h4|ul|ol|blockquote)>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n')
    .trim();
}

// The section of the mind's instructions that holds the notes ('' when there are none). A
// session whose notes would pass the budget is cut short only when it is the newest one;
// otherwise it and everything older is left out, and the count says so.
async function sessionNotes(worldId, db = pool) {
  const rows = (await db.query(
    `SELECT name, start_time, end_time, prep_note, recap_note FROM eras
     WHERE world_id=$1 AND (COALESCE(prep_note,'') <> '' OR COALESCE(recap_note,'') <> '')
     ORDER BY start_time DESC, id DESC`, [worldId])).rows;
  const parts = [];
  let left = NOTES_BUDGET;
  for (const e of rows) {
    const recap = noteText(e.recap_note), prep = noteText(e.prep_note);
    if (!recap && !prep) continue;
    const block = [
      `== ${e.name} (${e.start_time}–${e.end_time}) ==`,
      recap && `RECAP — what happened at the table:\n${recap}`,
      prep && `PREP — the DM's plan before it was played (possibilities, not canon):\n${prep}`,
    ].filter(Boolean).join('\n');
    if (block.length > left) { if (!parts.length) parts.push(`${block.slice(0, left)}\n[… cut short]`); break; }
    parts.push(block);
    left -= block.length;
  }
  if (!parts.length) return '';
  const hidden = rows.length - parts.length;
  return `THE DM'S SESSION NOTES (from the Session notes box, newest session first${hidden > 0 ? `; ${hidden} older session${hidden === 1 ? '' : 's'} not shown` : ''}):\n${parts.join('\n\n')}`;
}

module.exports = { noteText, sessionNotes, NOTES_BUDGET };
