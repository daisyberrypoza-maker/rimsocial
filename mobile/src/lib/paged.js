import { api } from '../api';
import { useAppStore } from '../store';

// Loads the next page of a list into the store. Same-key requests are shared.
const inflight = new Map();

export function loadPage(key, path, reset = false) {
  if (inflight.has(key)) return inflight.get(key);
  const current = useAppStore.getState().feeds[key] || {};
  if (!reset && !current.nextCursor) return Promise.resolve();

  const params = [];
  if (!reset && current.nextCursor) params.push(`cursor=${encodeURIComponent(current.nextCursor)}`);
  const url = params.length ? `${path}${path.includes('?') ? '&' : '?'}${params.join('&')}` : path;

  const request = api(url)
    .then((data) => {
      const existing = reset ? [] : (useAppStore.getState().feeds[key]?.items || []);
      const seen = new Set(existing.map((p) => p.id));
      const items = [...existing, ...data.items.filter((p) => !seen.has(p.id))];
      useAppStore.getState().setFeed(key, { items, nextCursor: data.nextCursor, updatedAt: Date.now() });
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, request);
  return request;
}
