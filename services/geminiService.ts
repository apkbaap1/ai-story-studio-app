/**
 * Frontend client that talks to /api/generate
 * Exposes same functions used in App.tsx
 */
export function isApiKeySet(): boolean { return true; }

export function startChat() {
  return {
    sendMessage: async ({ message }: { message: string }) => {
      const resp = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: message })
      });
      if (!resp.ok) {
        const t = await resp.text();
        throw new Error(`Server error: ${t}`);
      }
      const data = await resp.json();
      return { text: data.text ?? '' };
    }
  };
}

export async function* continueWritingStream(storyContent: string) {
  const resp = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: storyContent, stream: true })
  });
  if (!resp.ok) {
    throw new Error(`Stream error: ${await resp.text()}`);
  }
  if (!resp.body) throw new Error('No response body');
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\r?\n/);
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      const line = part.trim();
      if (!line) continue;
      let payload = line;
      if (line.startsWith('data:')) payload = line.replace(/^data:\s*/, '');
      try {
        const obj = JSON.parse(payload);
        if (obj?.text) yield { text: obj.text };
        else if (obj?.delta) yield { text: obj.delta };
        else yield { text: JSON.stringify(obj) };
      } catch {
        yield { text: payload };
      }
    }
  }
  if (buffer.trim()) {
    try { const obj = JSON.parse(buffer); yield { text: obj?.text ?? JSON.stringify(obj) }; }
    catch { yield { text: buffer }; }
  }
}
