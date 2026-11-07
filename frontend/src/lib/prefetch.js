import { mediaUrl, videoStreamUrl } from './config.js';

// Warms the device cache for media before it is needed. Failures are ignored:
// anything not prefetched still loads normally when opened.
export function prefetchMedia(items) {
  const list = (items || []).filter((item) => item && item.url);
  if (!list.length) return;
  const controller = typeof navigator !== 'undefined' ? navigator.serviceWorker?.controller : null;
  if (controller) {
    controller.postMessage({ type: 'prefetch', items: list });
  } else {
    // No service worker yet (first visit): at least warm the browser's own image cache
    list.filter((item) => item.kind !== 'video').forEach((item) => { const img = new Image(); img.decoding = 'async'; img.src = item.url; });
  }
}

// Every address a piece of media can be loaded from (the plain file and the streamed video)
export function mediaAddresses(path) {
  const plain = mediaUrl(path);
  if (!plain) return [];
  const stream = videoStreamUrl(plain);
  return stream && stream !== plain ? [plain, stream] : [plain];
}

// Removes media from the device when the server no longer has it. Items are objects with a mediaUrl.
export function evictMedia(items) {
  const urls = (items || []).flatMap((item) => mediaAddresses(item && item.mediaUrl));
  const controller = typeof navigator !== 'undefined' ? navigator.serviceWorker?.controller : null;
  if (urls.length) controller?.postMessage({ type: 'evict', urls });
}

// Items present before but missing now: their media must not be kept
export function missingItems(before, after) {
  const kept = new Set((after || []).map((item) => item && item.id));
  return (before || []).filter((item) => item && !kept.has(item.id));
}

export function clearMediaCache() {
  const controller = typeof navigator !== 'undefined' ? navigator.serviceWorker?.controller : null;
  controller?.postMessage({ type: 'clear-media' });
}
