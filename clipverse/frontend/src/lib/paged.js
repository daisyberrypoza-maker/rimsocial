import { api } from '../api.js';
import { useAppStore } from '../store.js';

// Loads the next page of a list into the store. Duplicate requests for the
// same list are shared, and items already shown are not added twice.
const inflight = new Map();

export function loadPage(key, path, reset = false) {
  if (inflight.has(key)) return inflight.get(key);

  const current = useAppStore.getState().feeds[key] || {};
  if (!reset && !current.nextCursor) return Promise.resolve();

  const params = new URLSearchParams();
  if (!reset && current.nextCursor) params.set('cursor', current.nextCursor);
  const query = params.toString();
  const url = query ? `${path}${path.includes('?') ? '&' : '?'}${query}` : path;

  const request = api(url)
    .then((data) => {
      const existing = reset ? [] : (useAppStore.getState().feeds[key]?.items || []);
      const seen = new Set(existing.map((p) => p.id));
      const items = [...existing, ...data.items.filter((p) => !seen.has(p.id))];
      useAppStore.getState().setFeed(key, {
        items,
        nextCursor: data.nextCursor,
        updatedAt: Date.now(),
      });
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, request);
  return request;
}
