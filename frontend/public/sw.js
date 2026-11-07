// RimSocial service worker.
// - App shell: network first, cached copy when offline. Fingerprinted JS/CSS: cache first.
// - Images and avatars: cache first, so repeat views are instant.
// - Videos: served from the cache when prefetched (including seeking), otherwise from the network.
// - The page can ask for media to be prefetched ("prefetch" message) so stories play without waiting.

const SHELL_CACHE = 'rimsocial-shell-v2';
const MEDIA_CACHE = 'rimsocial-media-v1';
const KEEP_CACHES = [SHELL_CACHE, MEDIA_CACHE];
const MEDIA_LIMIT = 400;                       // images and videos kept on the device
const VIDEO_MAX_BYTES = 25 * 1024 * 1024;      // larger videos stream from the network only
const APP_ROOT = new URL('./', self.registration.scope).pathname;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    try { await cache.add(APP_ROOT); } catch { /* the shell is stored on the first online visit */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith('rimsocial-') && !KEEP_CACHES.includes(key)).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

// Keep the cache within its limit by removing the oldest entries first.
async function trim(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - limit; i += 1) await cache.delete(keys[i]);
}

// Images and avatars: served from the device when present. Fetched and stored only when missing,
// so a cached picture never costs a second download while it is shown.
async function cacheFirst(request) {
  const cache = await caches.open(MEDIA_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok || response.type === 'opaque') {
      await cache.put(request, response.clone());
      trim(MEDIA_CACHE, MEDIA_LIMIT);
    }
    return response;
  } catch {
    return Response.error();
  }
}

// Recently used videos stay in memory, so a player's many range requests do not re-read the file each time.
const videoBlobs = new Map(); // url -> Blob, most recently used last
const VIDEO_MEMORY_LIMIT = 3;

async function cachedVideoBlob(url) {
  if (videoBlobs.has(url)) {
    const known = videoBlobs.get(url);
    videoBlobs.delete(url);
    videoBlobs.set(url, known);
    return known;
  }
  const cache = await caches.open(MEDIA_CACHE);
  const hit = await cache.match(url);
  if (!hit) return null;
  const blob = await hit.blob();
  videoBlobs.set(url, blob);
  while (videoBlobs.size > VIDEO_MEMORY_LIMIT) videoBlobs.delete(videoBlobs.keys().next().value);
  return blob;
}

// Serves a cached video, answering byte-range requests so the player can seek.
async function videoResponse(request) {
  const blob = await cachedVideoBlob(request.url);
  if (!blob) return fetch(request);
  const type = blob.type || 'video/mp4';
  const range = request.headers.get('range');
  if (!range) {
    return new Response(blob, { status: 200, headers: { 'Content-Type': type, 'Content-Length': String(blob.size), 'Accept-Ranges': 'bytes' } });
  }
  const match = /bytes=(\d*)-(\d*)/.exec(range);
  const size = blob.size;
  let start = 0;
  let end = size - 1;
  if (match && match[1] !== '') {
    start = Number(match[1]);
    if (match[2] !== '') end = Math.min(Number(match[2]), size - 1);
  } else if (match && match[2] !== '') {
    start = Math.max(0, size - Number(match[2]));
  }
  if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  const chunk = blob.slice(start, end + 1);
  return new Response(chunk, {
    status: 206,
    headers: { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(chunk.size), 'Accept-Ranges': 'bytes' },
  });
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
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

  // Fingerprinted JS/CSS: new deployments get new URLs, so cache first is safe
  if (url.origin === self.location.origin && url.pathname.startsWith(APP_ROOT + 'assets/')) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })());
    return;
  }

  if (request.destination === 'image') {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.destination === 'video' || request.headers.has('range')) {
    event.respondWith(videoResponse(request));
  }
});

// Prefetch from the page: [{ url, kind: 'image' | 'video' }]. Warms the cache so media is ready when opened.
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'prefetch' && Array.isArray(data.items)) {
    event.waitUntil(prefetch(data.items));
  } else if (data.type === 'clear-media') {
    event.waitUntil(caches.delete(MEDIA_CACHE));
  }
});

async function prefetch(items) {
  const cache = await caches.open(MEDIA_CACHE);
  for (const item of items) {
    if (!item || !item.url) continue;
    try {
      if (await cache.match(item.url)) continue;
      if (item.kind === 'video') {
        const response = await fetch(item.url, { mode: 'cors', credentials: 'omit' });
        if (!response.ok) continue;
        const length = Number(response.headers.get('content-length') || 0);
        if (length > VIDEO_MAX_BYTES) continue;
        await cache.put(item.url, response);
      } else {
        const response = await fetch(item.url, { mode: 'no-cors', credentials: 'omit' });
        if (response.ok || response.type === 'opaque') await cache.put(item.url, response);
      }
    } catch { /* offline or blocked: the media loads normally when opened */ }
  }
  await trim(MEDIA_CACHE, MEDIA_LIMIT);
}
