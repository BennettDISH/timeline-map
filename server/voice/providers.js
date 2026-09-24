// The voice providers behind one interface. Which one speaks is decided by the keys present
// (or pinned with VOICE_PROVIDER): Gemini and OpenAI are STEERABLE — a written description
// of how someone sounds shapes the performance — while ElevenLabs offers the widest choice
// of distinct voices and is the only one that generates ambience. Every driver returns
// { bytes, mimeType, ext } so storage never cares who spoke.

const eleven = require('./elevenlabs');

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const OPENAI_BASE = 'https://api.openai.com/v1';

// Gemini's prebuilt voices with Google's own one-word characters, so the DM can pick by feel.
const GEMINI_VOICES = [
  ['Zephyr', 'bright'], ['Puck', 'upbeat'], ['Charon', 'informative'], ['Kore', 'firm'], ['Fenrir', 'excitable'],
  ['Leda', 'youthful'], ['Orus', 'firm'], ['Aoede', 'breezy'], ['Callirrhoe', 'easy-going'], ['Autonoe', 'bright'],
  ['Enceladus', 'breathy'], ['Iapetus', 'clear'], ['Umbriel', 'easy-going'], ['Algieba', 'smooth'], ['Despina', 'smooth'],
  ['Erinome', 'clear'], ['Algenib', 'gravelly'], ['Rasalgethi', 'informative'], ['Laomedeia', 'upbeat'], ['Achernar', 'soft'],
  ['Alnilam', 'firm'], ['Schedar', 'even'], ['Gacrux', 'mature'], ['Pulcherrima', 'forward'], ['Achird', 'friendly'],
  ['Zubenelgenubi', 'casual'], ['Vindemiatrix', 'gentle'], ['Sadachbia', 'lively'], ['Sadaltager', 'knowledgeable'], ['Sulafat', 'warm'],
].map(([name, feel]) => ({ id: name, name, labels: { feel } }));

const OPENAI_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse', 'marin', 'cedar']
  .map((v) => ({ id: v, name: v[0].toUpperCase() + v.slice(1), labels: {} }));

const has = (k) => Boolean(process.env[k]);
const PROVIDERS = {
  gemini: { key: 'GEMINI_API_KEY', steerable: true },
  openai: { key: 'OPENAI_API_KEY', steerable: true },
  elevenlabs: { key: 'ELEVENLABS_API_KEY', steerable: false },
};

// VOICE_PROVIDER pins one (if its key exists); otherwise the first key found, Gemini first.
function provider() {
  if (process.env.VOICE_ENABLED === '0') return null;
  const pinned = (process.env.VOICE_PROVIDER || '').toLowerCase();
  if (PROVIDERS[pinned] && has(PROVIDERS[pinned].key)) return pinned;
  for (const p of ['gemini', 'openai', 'elevenlabs']) if (has(PROVIDERS[p].key)) return p;
  return null;
}
const status = () => {
  const p = provider();
  return { enabled: !!p, provider: p, steerable: p ? PROVIDERS[p].steerable : false, ambience: !!p && has('ELEVENLABS_API_KEY') };
};

async function listVoices() {
  const p = provider();
  if (p === 'gemini') return GEMINI_VOICES;
  if (p === 'openai') return OPENAI_VOICES;
  if (p === 'elevenlabs') return eleven.listVoices();
  return [];
}

// Raw 16-bit PCM → a WAV file browsers can play natively.
function wavFromPcm(pcm, sampleRate = 24000, channels = 1) {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * 2;
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(byteRate, 28); header.writeUInt16LE(channels * 2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function speakGemini({ voiceId, style, text }) {
  const models = [process.env.VOICE_TTS_MODEL || 'gemini-2.5-flash-tts', 'gemini-2.5-flash-preview-tts'];
  const prompt = style ? `${style}. Say exactly this, in that voice: ${text}` : text;
  let last;
  for (const model of [...new Set(models)]) {
    const res = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceId || 'Kore' } } },
        },
      }),
      signal: AbortSignal.timeout(60000),
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 404) { last = new Error(json?.error?.message || `model ${model} not found`); continue; }
    if (!res.ok) throw new Error(json?.error?.message || `Gemini speech ${res.status}`);
    const part = (json.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
    if (!part) throw new Error('Gemini returned no audio (the line may have been blocked)');
    const rate = Number((part.inlineData.mimeType || '').match(/rate=(\d+)/)?.[1]) || 24000;
    return { bytes: wavFromPcm(Buffer.from(part.inlineData.data, 'base64'), rate), mimeType: 'audio/wav', ext: 'wav' };
  }
  throw last || new Error('Gemini speech unavailable');
}

async function speakOpenAI({ voiceId, style, text }) {
  const res = await fetch(`${OPENAI_BASE}/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: process.env.VOICE_TTS_MODEL_OPENAI || 'gpt-4o-mini-tts',
      voice: voiceId || 'onyx', input: text, response_format: 'mp3',
      ...(style ? { instructions: style } : {}),
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`OpenAI speech ${res.status}${t ? `: ${t.slice(0, 160)}` : ''}`); }
  return { bytes: Buffer.from(await res.arrayBuffer()), mimeType: 'audio/mpeg', ext: 'mp3' };
}

async function speak({ voiceId, style, text }) {
  const p = provider();
  if (p === 'gemini') return speakGemini({ voiceId, style, text });
  if (p === 'openai') return speakOpenAI({ voiceId, style, text });
  if (p === 'elevenlabs') return { bytes: await eleven.speak(voiceId, text), mimeType: 'audio/mpeg', ext: 'mp3' };
  throw new Error('No voice provider is configured');
}

// Ambience is ElevenLabs-only for now (no big-name model offers sound design as a plain call).
async function ambience(prompt, seconds) {
  if (!has('ELEVENLABS_API_KEY')) throw new Error('Ambience needs an ElevenLabs key');
  return { bytes: await eleven.soundscape(prompt, seconds), mimeType: 'audio/mpeg', ext: 'mp3' };
}

module.exports = { status, provider, listVoices, speak, ambience };
