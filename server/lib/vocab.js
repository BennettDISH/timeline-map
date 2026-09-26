// One vocabulary for node categories, shared by every server-side validator (the share
// API's marker form, the Forge contract, and the Atlas routes). The client mirrors it in
// client/src/utils/categories.js. 'party' is not here on purpose: there is exactly one
// Party node per world and nothing but the table's own footsteps ever creates it.
const CATEGORIES = ['note', 'place', 'person', 'item', 'lore', 'event'];
module.exports = { CATEGORIES };
