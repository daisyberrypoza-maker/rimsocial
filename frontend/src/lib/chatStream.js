import { API_BASE } from './config.js';

// Opens the live stream with the auth header and reports each change as a window 'rs-chat' event.
// Reconnects with a short back-off if the connection drops.
export function startChatStream(getToken) {
  let stopped = false;
  let controller = null;
  let delay = 1000;

  async function connect() {
    while (!stopped) {
      const token = getToken();
      if (!token) return;
      controller = new AbortController();
      try {
        const res = await fetch(`${API_BASE}/v1/messages/stream`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error('stream unavailable');
        delay = 1000;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (!stopped) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let end = buffer.indexOf('\n\n');
          while (end !== -1) {
            const block = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const data = block.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
            if (data) {
              try { window.dispatchEvent(new CustomEvent('rs-chat', { detail: JSON.parse(data) })); } catch { /* ignore malformed event */ }
            }
            end = buffer.indexOf('\n\n');
          }
        }
      } catch {
        // dropped or aborted: retry below
      }
      if (stopped) return;
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 15000);
    }
  }

  connect();
  return () => {
    stopped = true;
    controller?.abort();
  };
}
