
// Simple serverless proxy to OpenAI Responses API (non-streaming)
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = req.body || (await new Promise(r => {
      let data = '';
      req.on('data', chunk => data += chunk);
      req.on('end', () => r(JSON.parse(data || '{}')));
    }));

    const input = body.input ?? body.prompt ?? '';

    const resp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-5',
        input,
        // You can tune options here, e.g. verbosity: 'medium'
      })
    });

    const data = await resp.json();
    // Normalize a simple text output for the frontend
    // Try common shapes
    let text = '';

    if (data?.output?.length) {
      // Responses API shape often places text in output[0].content[0].text
      try {
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
      } catch (e) {
        text = JSON.stringify(data);
      }
    } else if (data?.text) {
      text = data.text;
    } else if (data?.output_text) {
      text = Array.isArray(data.output_text) ? data.output_text.join('') : data.output_text;
    } else {
      text = JSON.stringify(data);
    }

    return res.status(200).json({ text, raw: data });
  } catch (err) {
    console.error('OpenAI proxy error', err);
    return res.status(500).json({ error: String(err) });
  }
}
