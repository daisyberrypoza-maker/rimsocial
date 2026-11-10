import { api } from '../api.js';
import { useAppStore } from '../store.js';

// Story ring state for people shown on any screen. Requests are batched into one call and a result is reused for a
// minute, so a ring that changes (new story, all watched) shows up without a page reload.
const FRESH_MS = 60000;
const queued = new Set();
const fetchedAt = new Map();
let timer = null;

export function requestStoryRings(userId) {
  if (!userId) return;
  const key = String(userId);
  if (queued.has(key)) return;
  const known = useAppStore.getState().storyRings?.[key] !== undefined;
  if (known && Date.now() - (fetchedAt.get(key) || 0) < FRESH_MS) return;
  queued.add(key);
  if (!timer) timer = setTimeout(flush, 30);
}

async function flush() {
  timer = null;
  const ids = [...queued];
  queued.clear();
  if (!ids.length) return;
  try {
    const data = await api(`/v1/stories/rings?ids=${encodeURIComponent(ids.join(','))}`);
    const rings = {};
    for (const id of ids) {
      rings[id] = data.rings?.[id] || null;
      fetchedAt.set(id, Date.now());
    }
    useAppStore.getState().setStoryRings(rings);
  } catch {
    // Leave the avatar plain; it is asked again the next time it mounts
  }
}
