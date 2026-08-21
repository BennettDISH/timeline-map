// Thin REST client for the Gemini API — the Forge's only outward connection.
// Text (the mind) and images (Nano Banana) both go through generateContent; no SDK,
// just fetch. Model IDs are env-overridable so a successor model is a variable bump,
// not a code change.

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
// gemini-2.5-pro was retired for new API users; 3.1-pro-preview is Google's named successor.
const textModel = () => process.env.FORGE_TEXT_MODEL || 'gemini-3.1-pro-preview';
const imageModel = () => process.env.FORGE_IMAGE_MODEL || 'gemini-2.5-flash-image';

const enabled = () => Boolean(process.env.GEMINI_API_KEY) && process.env.FORGE_ENABLED !== '0';

async function call(model, body, timeoutMs) {
  const res = await fetch(`${BASE}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.error?.message || `Gemini responded ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

const parts = (json) => json?.candidates?.[0]?.content?.parts || [];

// Ask the text model for a JSON reply. `messages` is [{ role: 'user'|'model', text }].
// responseMimeType pins the output to bare JSON (no markdown fences), but we still
// fall back to extracting the outermost object if a model ever wraps it.
async function generateJSON({ system, messages, maxTokens = 20000 }) {
  const json = await call(textModel(), {
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
    generationConfig: { responseMimeType: 'application/json', maxOutputTokens: maxTokens, temperature: 0.9 },
  }, 180000);
  const text = parts(json).map((p) => p.text || '').join('');
  if (!text.trim()) throw new Error('The mind returned nothing (the reply may have been safety-blocked)');
  try { return JSON.parse(text); } catch (e) {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch (e2) { /* fall through */ } }
    throw new Error('The mind returned malformed JSON');
  }
}

// Paint one image with Nano Banana. `refs` are reference images ([{ mimeType, data }],
// base64) — the style anchor rides here. Returns { mimeType, data } (base64 PNG).
// imageConfig.aspectRatio is newer surface area than the model itself; if the API
// rejects it we retry once without, rather than failing the whole generation.
async function generateImage({ prompt, refs = [], aspect }) {
  const req = (withAspect) => call(imageModel(), {
    contents: [{
      role: 'user',
      parts: [
        ...refs.map((r) => ({ inlineData: { mimeType: r.mimeType, data: r.data } })),
        { text: prompt },
      ],
    }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      ...(withAspect && aspect ? { imageConfig: { aspectRatio: aspect } } : {}),
    },
  }, 120000);
  let json;
  try { json = await req(true); } catch (e) {
    if (e.status === 400 && aspect) json = await req(false);
    else throw e;
  }
  const img = parts(json).find((p) => p.inlineData?.data);
  if (!img) {
    const said = parts(json).map((p) => p.text || '').join(' ').trim();
    throw new Error(said ? `No image came back — the model said: ${said.slice(0, 200)}` : 'No image came back');
  }
  return { mimeType: img.inlineData.mimeType || 'image/png', data: img.inlineData.data };
}

module.exports = { enabled, generateJSON, generateImage };
