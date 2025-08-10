
/**
 * Streaming proxy: forwards a streaming response from OpenAI to the client.
 * The proxy will pipe OpenAI's streamed body to the client so the front-end
 * can consume it as an async iterable.
 *
 * Note: this endpoint uses native fetch to call OpenAI with `stream: true`.
 * Make sure you set OPENAI_API_KEY in your deployment environment variables.
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    // read body (works on many serverless platforms)
    const body = req.body || (await new Promise(r => {
      let data = '';
      req.on('data', chunk => data += chunk);
      req.on('end', () => r(JSON.parse(data || '{}')));
    }));
    const input = body.input ?? '';

    const openaiResp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-5',
        input,
        stream: true
      })
    });

    if (!openaiResp.ok) {
      const txt = await openaiResp.text();
      res.status(openaiResp.status).send(txt);
      return;
    }

    // Forward headers for streaming
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    });

    const reader = openaiResp.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      // Write raw chunk to client. Client-side generator will normalize it.
      res.write(chunk);
    }

    res.end();
  } catch (err) {
    console.error('OpenAI stream proxy error', err);
    try { res.status(500).json({ error: String(err) }); } catch (e) { /* ignore */ }
  }
}
