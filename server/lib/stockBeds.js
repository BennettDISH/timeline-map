// The stock ambience beds a DM can pick for a map (the files and labels are the client's:
// client/src/audio/names.js lists the same names, and server/test/sound.test.js holds the two
// together). A pick needs no column: it is maps.ambience_prompt = 'stock:amb.forest' with
// ambience_url NULL, so what handles a generated file (the delete from R2, a world copy, the
// media-host rewrite) never takes a stock pick for one. A map with an ambience_url plays that.

const STOCK_BEDS = Object.freeze(['amb.wilds', 'amb.forest', 'amb.town', 'amb.sea', 'amb.dungeon', 'amb.mountain', 'amb.storm']);
const MARK = 'stock:';

/** What to store in maps.ambience_prompt for a pick (null clears it). */
const bedMark = (bed) => (bed ? `${MARK}${bed}` : null);

/** The stock bed a map row has picked, or null: its own file, a typed prompt or an unknown name is no pick. */
function stockBedOf(row) {
  const p = row?.ambience_prompt;
  if (row?.ambience_url || typeof p !== 'string' || !p.startsWith(MARK)) return null;
  const bed = p.slice(MARK.length);
  return STOCK_BEDS.includes(bed) ? bed : null;
}

module.exports = { STOCK_BEDS, bedMark, stockBedOf };
