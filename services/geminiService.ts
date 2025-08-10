
/**
 * Replaced Gemini service with OpenAI proxy-service client.
 * This file runs in the browser (Vite front-end) and talks to serverless
 * endpoints under /api/openai and /api/openai/stream which actually
 * hold the real OpenAI API key (process.env.OPENAI_API_KEY).
 *
 * Exports kept compatible with the original usage in App.tsx:
 *  - isApiKeySet(): boolean
 *  - startChat(): { sendMessage({ message }): Promise<{ text: string }> }
 *  - continueWritingStream(storyContent): AsyncIterable<{ text: string }>
 *
 * Notes:
 *  - The front-end does NOT contain the API key. Configure OPENAI_API_KEY
 *    in your deployment provider (Vercel/Render) environment variables.
 *  - For local development you can create a .env.local with VITE_OPENAI_API_KEY
 *    set (only used as a convenience flag) but the actual API key used by
 *    the serverless functions must be OPENAI_API_KEY.
 */

export function isApiKeySet(): boolean {
  // We optimistically return true so the app attempts to initialize the AI features.
  // The serverless endpoints will actually verify the key and return an error if missing.
  return true;
}

export function startChat() {
  return {
    /**
     * sendMessage - sends a message to serverless /api/openai and returns a simple { text }
     * wrapper to keep parity with the previous Gemini chat object's API.
     */
    sendMessage: async ({ message }: { message: string }) => {
      const resp = await fetch('/api/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: message })
      });
      if (!resp.ok) {
        const errorText = await resp.text();
        throw new Error(`OpenAI proxy error: ${errorText}`);
      }
      const data = await resp.json();
      // The proxy returns { text: "..." } for convenience.
      return { text: data.text ?? (Array.isArray(data.output_text) ? data.output_text.join('') : JSON.stringify(data)) };
    }
  };
}

/**
 * continueWritingStream - returns an async-generator that yields incremental text chunks.
 * It calls the serverless streaming endpoint /api/openai/stream which proxies OpenAI's
 * streaming response. The proxy forwards server stream chunks; this generator normalizes
 * those chunks into small { text } objects for the app to append.
 */
export async function* continueWritingStream(storyContent: string) {
  const resp = await fetch('/api/openai/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: storyContent })
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenAI stream proxy error: ${text}`);
  }

  if (!resp.body) throw new Error('No response body from stream endpoint');

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // Try to split by newlines (the proxy may forward SSE or JSON-lines).
    const parts = buffer.split(/\r?\n/);
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      const line = part.trim();
      if (!line) continue;
      // Proxy might send "data: ..." SSE chunks or raw JSON lines.
      let payload = line;
      if (line.startsWith('data:')) {
        payload = line.replace(/^data:\s*/, '');
      }
      try {
        const obj = JSON.parse(payload);
        if (typeof obj === 'string') {
          yield { text: obj };
        } else if (obj?.text) {
          yield { text: obj.text };
        } else if (obj?.delta) {
          yield { text: obj.delta };
        } else {
          // if structure is unknown, stringify it
          yield { text: JSON.stringify(obj) };
        }
      } catch (e) {
        // Not JSON — send raw text chunk
        yield { text: payload };
      }
    }
  }

  if (buffer.trim()) {
    // Last piece
    try {
      const obj = JSON.parse(buffer);
      yield { text: obj?.text ?? JSON.stringify(obj) };
    } catch {
      yield { text: buffer };
    }
  }
}
