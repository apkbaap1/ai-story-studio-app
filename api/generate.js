// Unified OpenAI proxy endpoint
// Accepts POST JSON: { prompt: string, stream?: boolean }
// If stream is true, proxies a streaming response; otherwise returns JSON { text }
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = req.body || (await new Promise(r => {
      let data = '';
      req.on('data', chunk => data += chunk);
      req.on('end', () => r(JSON.parse(data || '{}')));
    }));
    const prompt = body.prompt ?? body.input ?? '';
    const stream = !!body.stream;

    const apiUrl = 'https://api.openai.com/v1/responses';
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    };

    const payload = {
      model: 'gpt-5-mini',
      input: prompt,
      // you can add more options like temperature, max_output_tokens etc.
    };

    if (!stream) {
      const r = await fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify(payload) });
      const data = await r.json();
      // Normalize into text
      let text = '';
      if (data?.output?.length) {
        for (const out of data.output) {
          if (out?.content) {
            for (const c of out.content) {
              if (c?.text) text += c.text;
              else if (typeof c === 'string') text += c;
              else if (c?.type === 'output_text' && c?.text) text += c.text;
            }
          } else if (typeof out === 'string') {
            text += out;
          }
        }
      } else if (data?.text) {
        text = data.text;
      } else if (data?.output_text) {
        text = Array.isArray(data.output_text) ? data.output_text.join('') : data.output_text;
      } else {
        text = JSON.stringify(data);
      }
      return res.status(200).json({ text, raw: data });
    } else {
      // Stream mode: call OpenAI with stream=true and pipe chunks
      const r = await fetch(apiUrl, { method: 'POST', headers, body: JSON.stringify({ ...payload, stream: true }) });
      if (!r.ok) {
        const txt = await r.text();
        return res.status(r.status).send(txt);
      }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      });
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        res.write(chunk);
      }
      res.end();
    }
  } catch (err) {
    console.error('generate proxy error', err);
    try { res.status(500).json({ error: String(err) }); } catch (e) { /* ignore */ }
  }
}
