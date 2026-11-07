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

export function clearMediaCache() {
  const controller = typeof navigator !== 'undefined' ? navigator.serviceWorker?.controller : null;
  controller?.postMessage({ type: 'clear-media' });
}
