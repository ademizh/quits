// Netlify Function at /api/ai (same protections as api/ai.js for Vercel).
// Key: Netlify → Site configuration → Environment variables → OPENAI_API_KEY. Never in code.
const MODELS = ['gpt-5-mini', 'gpt-4.1-mini', 'gpt-4o-mini'];
const PER_IP = 20, WINDOW = 10 * 60 * 1000, GLOBAL_PER_HOUR = 300;
const hits = new Map(); let globalHits = [];
function limited(ip) {
  const now = Date.now();
  globalHits = globalHits.filter(t => now - t < 3600e3);
  if (globalHits.length >= GLOBAL_PER_HOUR) return true;
  const list = (hits.get(ip) || []).filter(t => now - t < WINDOW);
  if (list.length >= PER_IP) { hits.set(ip, list); return true; }
  list.push(now); hits.set(ip, list); globalHits.push(now);
  if (hits.size > 5000) hits.clear();
  return false;
}
const json = (code, obj) => new Response(JSON.stringify(obj), { status: code, headers: { 'Content-Type': 'application/json' } });

export default async (req, context) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  const key = process.env.OPENAI_API_KEY;
  if (!key) return json(501, { error: 'AI is not set up on the server.' });
  const origin = req.headers.get('origin'), host = req.headers.get('host');
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  let ok = false; try { ok = !!origin && (new URL(origin).host === host || allowed.includes(origin)); } catch { ok = false; }
  if (!ok) return json(403, { error: 'Requests are allowed only from the Quits site.' });
  const ip = (context && context.ip) || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return json(429, { error: 'Too many AI requests. Try again in a few minutes.' });
  let body; try { body = await req.json(); } catch { return json(400, { error: 'Bad JSON' }); }
  const messages = (Array.isArray(body.messages) ? body.messages : []).slice(-14)
    .filter(m => m && ['system', 'user', 'assistant'].includes(m.role) && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: m.content.slice(0, 12000) }));
  if (!messages.length || JSON.stringify(messages).length > 30000) return json(413, { error: 'Request too large.' });
  const extra = process.env.OPENAI_MODEL ? [process.env.OPENAI_MODEL] : [];
  const model = [...extra, ...MODELS].includes(body.model) ? body.model : (extra[0] || MODELS[0]);
  const payload = { model, messages };
  if (body.json) payload.response_format = { type: 'json_object' };
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(payload) });
    const text = await r.text();
    if (r.ok) return new Response(text, { status: 200, headers: { 'Content-Type': 'application/json' } });
    const reason = /model/i.test(text) ? 'model not available' : r.status === 429 ? 'OpenAI limit reached' : 'OpenAI error';
    return json(r.status === 401 ? 502 : r.status, { error: reason });
  } catch { return json(502, { error: 'Could not reach OpenAI.' }); }
};
export const config = { path: '/api/ai' };
