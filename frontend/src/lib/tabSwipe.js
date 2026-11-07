import { useEffect } from 'react';

// Main tabs in bottom-bar order. Swipe left for the next tab, right for the previous one.
export const TAB_PATHS = ['/', '/chat', '/upload', '/explore', '/stories'];

// Swipes that start on these elements belong to them (text entry, video, carousels, sheets)
const IGNORE = 'input, textarea, select, video, [contenteditable="true"], [data-no-swipe], .story-rail, .sv-root, .rv-sheet, .rv-sheet-backdrop, .as-backdrop, .sv-share-backdrop, [role="dialog"], [role="listbox"]';
const MIN_DISTANCE = 70;
const MAX_DURATION = 700;

export function useTabSwipe(navigate, pathname, enabled) {
  useEffect(() => {
    if (!enabled || !TAB_PATHS.includes(pathname)) return undefined;
    let start = null;

    const onStart = (event) => {
      if (event.touches.length !== 1 || (event.target.closest && event.target.closest(IGNORE))) { start = null; return; }
      const touch = event.touches[0];
      start = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    };

    const onEnd = (event) => {
      const origin = start;
      start = null;
      if (!origin || Date.now() - origin.time > MAX_DURATION) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - origin.x;
      const dy = touch.clientY - origin.y;
      // Mostly horizontal only, so vertical scrolling is never mistaken for a swipe
      if (Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.6) return;
      const index = TAB_PATHS.indexOf(pathname);
      const target = TAB_PATHS[dx < 0 ? index + 1 : index - 1];
      if (target) navigate(target);
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchend', onEnd);
    };
  }, [enabled, navigate, pathname]);
}
