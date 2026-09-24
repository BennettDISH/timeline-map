// The voice API: a DM gives a person a voice and a line, a place an ambience. Like the
// Forge it is a harness — without ELEVENLABS_API_KEY every route but /status answers 404.
// Generated audio is player-facing content, stored in R2 and served by URL; the share API
// hands players a node's line only when the node itself is visible to them.

const express = require('express');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { r2Enabled, putObject } = require('../storage');
const voice = require('../voice/providers');
const router = express.Router();

router.use(authenticateToken);
router.get('/status', (req, res) => res.json(voice.status()));
router.use((req, res, next) => (voice.status().enabled ? next() : res.status(404).json({ message: 'Route not found' })));
router.use(rateLimit({ windowMs: 60 * 60 * 1000, max: 120 }));

const wrap = (fn) => (req, res) =>
  fn(req, res).catch((err) => { console.error('voice error:', err); res.status(500).json({ message: err.message || 'Server error' }); });

async function ownsWorld(worldId, userId) {
  const r = await pool.query('SELECT id FROM worlds WHERE id=$1 AND created_by=$2 AND is_active=true', [worldId, userId]);
  return r.rows.length > 0;
}
const needStorage = (res) => res.status(400).json({ message: 'Audio needs object storage (R2) configured' });

router.get('/voices', wrap(async (req, res) => {
  res.json({ voices: await voice.listVoices(), ...voice.status() });
}));

// POST /nodes/:id/voice — choose which voice this person speaks with.
router.post('/nodes/:id/voice', wrap(async (req, res) => {
  const n = (await pool.query('SELECT id, world_id FROM nodes WHERE id=$1', [req.params.id])).rows[0];
  if (!n || !(await ownsWorld(n.world_id, req.user.id))) return res.status(404).json({ message: 'Node not found' });
  const voiceId = req.body?.voice_id ? String(req.body.voice_id).slice(0, 64) : null;
  const voiceName = req.body?.voice_name ? String(req.body.voice_name).slice(0, 120) : null;
  const sets = ['voice_id=$1', 'voice_name=$2']; const vals = [voiceId, voiceName];
  if ('voice_style' in (req.body || {})) { sets.push(`voice_style=$${vals.push(String(req.body.voice_style || '').slice(0, 400) || null)}`); }
  vals.push(n.id);
  await pool.query(`UPDATE nodes SET ${sets.join(', ')}, updated_at=CURRENT_TIMESTAMP WHERE id=$${vals.length}`, vals);
  res.json({ ok: true });
}));

// POST /nodes/:id/line — speak one line in the node's voice; players hear it on the sheet.
router.post('/nodes/:id/line', wrap(async (req, res) => {
  const n = (await pool.query('SELECT id, world_id, title, voice_id, voice_style FROM nodes WHERE id=$1', [req.params.id])).rows[0];
  if (!n || !(await ownsWorld(n.world_id, req.user.id))) return res.status(404).json({ message: 'Node not found' });
  if (!n.voice_id) return res.status(400).json({ message: 'Pick a voice first' });
  if (!r2Enabled) return needStorage(res);
  const text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 400) : '';
  if (!text) return res.status(400).json({ message: 'Give them something to say' });
  const out = await voice.speak({ voiceId: n.voice_id, style: n.voice_style, text });
  const key = `worlds/${n.world_id}/voice-${n.id}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.${out.ext}`;
  const url = await putObject(key, out.bytes, out.mimeType);
  await pool.query('UPDATE nodes SET voice_line=$1, voice_url=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$3', [text, url, n.id]);
  res.json({ line: text, url });
}));
router.delete('/nodes/:id/line', wrap(async (req, res) => {
  const n = (await pool.query('SELECT id, world_id FROM nodes WHERE id=$1', [req.params.id])).rows[0];
  if (!n || !(await ownsWorld(n.world_id, req.user.id))) return res.status(404).json({ message: 'Node not found' });
  await pool.query('UPDATE nodes SET voice_line=NULL, voice_url=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=$1', [n.id]);
  res.json({ ok: true });
}));

// POST /maps/:id/ambience — a generated soundscape for this space (looped by the client).
router.post('/maps/:id/ambience', wrap(async (req, res) => {
  const m = (await pool.query('SELECT id, world_id, title FROM maps WHERE id=$1', [req.params.id])).rows[0];
  if (!m || !(await ownsWorld(m.world_id, req.user.id))) return res.status(404).json({ message: 'Map not found' });
  if (!r2Enabled) return needStorage(res);
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim().slice(0, 400) : '';
  if (!prompt) return res.status(400).json({ message: 'Describe the sound of this place' });
  const out = await voice.ambience(prompt, Number(req.body?.seconds) || 20);
  const key = `worlds/${m.world_id}/ambience-${m.id}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.${out.ext}`;
  const url = await putObject(key, out.bytes, out.mimeType);
  await pool.query('UPDATE maps SET ambience_prompt=$1, ambience_url=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$3', [prompt, url, m.id]);
  res.json({ prompt, url });
}));
router.delete('/maps/:id/ambience', wrap(async (req, res) => {
  const m = (await pool.query('SELECT id, world_id FROM maps WHERE id=$1', [req.params.id])).rows[0];
  if (!m || !(await ownsWorld(m.world_id, req.user.id))) return res.status(404).json({ message: 'Map not found' });
  await pool.query('UPDATE maps SET ambience_prompt=NULL, ambience_url=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=$1', [m.id]);
  res.json({ ok: true });
}));

module.exports = router;
