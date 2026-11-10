import { useEffect, useRef } from 'react';

// Reusable horizontal navigation for screens that contain local tabs or filters.
export function useSwipeTabs(activeValue, values, onChange, enabled = true) {
  const surfaceRef = useRef(null);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || !enabled || values.length < 2) return undefined;

    const previousTouchAction = surface.style.touchAction;
    surface.style.touchAction = 'pan-y';
    let gesture = null;

    function onStart(event) {
      if (event.touches.length !== 1) { gesture = null; return; }
      const target = event.target;
      if (target.closest?.('input, textarea, select, video, audio, [contenteditable="true"], [data-no-swipe], .story-rail, .sv-root, .rv-sheet, [role="dialog"]')) {
        gesture = null;
        return;
      }
      for (let el = target instanceof Element ? target : target?.parentElement; el && el !== surface; el = el.parentElement) {
        const style = window.getComputedStyle(el);
        if ((style.overflowX === 'auto' || style.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) {
          gesture = null;
          return;
        }
      }
      const touch = event.touches[0];
      gesture = { x: touch.clientX, y: touch.clientY, dx: 0, axis: null, startedAt: Date.now() };
    }

    function onMove(event) {
      if (!gesture || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dx = touch.clientX - gesture.x;
      const dy = touch.clientY - gesture.y;
      if (!gesture.axis) {
        if (Math.abs(dx) < 9 && Math.abs(dy) < 9) return;
        gesture.axis = Math.abs(dx) > Math.abs(dy) * 1.35 ? 'x' : 'y';
      }
      if (gesture.axis === 'x') {
        gesture.dx = dx;
        event.preventDefault();
      }
    }

    function onEnd() {
      const current = gesture;
      gesture = null;
      if (!current || current.axis !== 'x') return;
      const index = values.indexOf(activeValue);
      const elapsed = Date.now() - current.startedAt;
      const distance = Math.abs(current.dx);
      if (distance < 60 && !(elapsed < 300 && distance > 42)) return;
      const nextIndex = current.dx < 0 ? index + 1 : index - 1;
      if (index >= 0 && nextIndex >= 0 && nextIndex < values.length) onChange(values[nextIndex]);
    }

    function onCancel() { gesture = null; }

    surface.addEventListener('touchstart', onStart, { passive: true });
    surface.addEventListener('touchmove', onMove, { passive: false });
    surface.addEventListener('touchend', onEnd, { passive: true });
    surface.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      surface.removeEventListener('touchstart', onStart);
      surface.removeEventListener('touchmove', onMove);
      surface.removeEventListener('touchend', onEnd);
      surface.removeEventListener('touchcancel', onCancel);
      surface.style.touchAction = previousTouchAction;
    };
  }, [activeValue, enabled, onChange, values]);

  return surfaceRef;
}
