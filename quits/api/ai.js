// Vercel Serverless Function at /api/ai.
// The OpenAI key lives ONLY in Vercel → Project → Settings → Environment Variables → OPENAI_API_KEY.
// It is never sent to the browser and is not in this code.
const MODELS = ['gpt-5-mini', 'gpt-4.1-mini', 'gpt-4o-mini'];
const PER_IP = 20, WINDOW = 10 * 60 * 1000;   // 20 AI requests per visitor per 10 minutes
const GLOBAL_PER_HOUR = 300;                    // safety cap per server instance
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
function sameSite(req) {
  const origin = req.headers.origin;
  if (!origin) return false;                                   // browsers always send Origin on POST
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  try { const o = new URL(origin); if (o.host === req.headers.host) return true; } catch { return false; }
  return allowed.includes(origin);
}

module.exports = async (req, res) => {
  const send = (code, obj) => res.status(code).setHeader('Content-Type', 'application/json').send(JSON.stringify(obj));
  if (req.method !== 'POST') return send(405, { error: 'POST only' });
  if (!process.env.OPENAI_API_KEY) return send(501, { error: 'AI is not set up on the server.' });
  if (!sameSite(req)) return send(403, { error: 'Requests are allowed only from the Quits site.' });
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return send(429, { error: 'Too many AI requests. Try again in a few minutes.' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return send(400, { error: 'Bad JSON' }); } }
  body = body || {};
  const messages = (Array.isArray(body.messages) ? body.messages : []).slice(-14)
    .filter(m => m && ['system', 'user', 'assistant'].includes(m.role) && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: m.content.slice(0, 12000) }));
  if (!messages.length || JSON.stringify(messages).length > 30000) return send(413, { error: 'Request too large.' });
  const extra = process.env.OPENAI_MODEL ? [process.env.OPENAI_MODEL] : [];
  const model = [...extra, ...MODELS].includes(body.model) ? body.model : (extra[0] || MODELS[0]);
  const payload = { model, messages };
  if (body.json) payload.response_format = { type: 'json_object' };

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify(payload)
    });
    const text = await r.text();
    if (r.ok) { res.status(200).setHeader('Content-Type', 'application/json'); return res.send(text); }
    // Pass through only a short reason; never the key or full upstream details.
    const reason = /model/i.test(text) ? 'model not available' : r.status === 429 ? 'OpenAI limit reached' : 'OpenAI error';
    return send(r.status === 401 ? 502 : r.status, { error: reason });
  } catch (e) {
    return send(502, { error: 'Could not reach OpenAI.' });
  }
};
