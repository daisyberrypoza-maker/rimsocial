const CACHE_PREFIX = 'rimsocial-shell-';
const CACHE_NAME = CACHE_PREFIX + 'v1';
const APP_ROOT = new URL('./', self.registration.scope).pathname;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try { await cache.add(APP_ROOT); } catch { /* online load can populate the shell later */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith(APP_ROOT + 'v1/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const response = await fetch(request);
        if (response.ok) await cache.put(APP_ROOT, response.clone());
        return response;
      } catch {
        return (await cache.match(APP_ROOT)) || Response.error();
      }
    })());
    return;
  }

  // Vite emits fingerprinted JS/CSS assets, so new deployments get new URLs.
  if (url.pathname.startsWith(APP_ROOT + 'assets/')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })());
  }
});
