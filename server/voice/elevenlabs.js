// ElevenLabs — voices for the people of the world, and ambience for its places. The only
// outward connection of the voice layer; inert without ELEVENLABS_API_KEY. Model IDs are
// env-overridable so a successor model is a variable bump, not a code change.

const BASE = 'https://api.elevenlabs.io';
const enabled = () => Boolean(process.env.ELEVENLABS_API_KEY) && process.env.VOICE_ENABLED !== '0';
const headers = () => ({ 'xi-api-key': process.env.ELEVENLABS_API_KEY });

async function fail(res, what) {
  const t = await res.text().catch(() => '');
  const err = new Error(`ElevenLabs ${what} ${res.status}${t ? `: ${t.slice(0, 160)}` : ''}`);
  err.status = res.status;
  throw err;
}

let voiceCache = { at: 0, list: [] };
// The account's voices (premade + any the DM has added), cached for ten minutes.
async function listVoices() {
  if (Date.now() - voiceCache.at < 10 * 60 * 1000 && voiceCache.list.length) return voiceCache.list;
  const res = await fetch(`${BASE}/v1/voices`, { headers: headers(), signal: AbortSignal.timeout(20000) });
  if (!res.ok) await fail(res, 'voices');
  const j = await res.json();
  const list = (j.voices || []).map((v) => ({
    id: v.voice_id, name: v.name, category: v.category || null, preview: v.preview_url || null,
    labels: v.labels || {},
  }));
  voiceCache = { at: Date.now(), list };
  return list;
}

// One spoken line. Returns MP3 bytes.
async function speak(voiceId, text) {
  const res = await fetch(`${BASE}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: process.env.VOICE_TTS_MODEL || 'eleven_multilingual_v2',
      voice_settings: { stability: 0.45, similarity_boost: 0.8 },
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) await fail(res, 'speech');
  return Buffer.from(await res.arrayBuffer());
}

// A generated soundscape from a text prompt (up to 22 seconds; looped on the client).
async function soundscape(prompt, seconds = 20) {
  const res = await fetch(`${BASE}/v1/sound-generation`, {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text: prompt, duration_seconds: Math.max(1, Math.min(22, seconds)), prompt_influence: 0.3 }),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) await fail(res, 'sound');
  return Buffer.from(await res.arrayBuffer());
}

module.exports = { enabled, listVoices, speak, soundscape };
