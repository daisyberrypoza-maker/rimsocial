import { useEffect, useLayoutEffect, useRef } from 'react';

const SWIPE_DURATION = 260;
const SWIPE_EASING = 'cubic-bezier(0.22, 0.61, 0.36, 1)';

// Horizontal tab navigation with finger tracking and a full outgoing/incoming slide.
export function useSwipeTabs(activeValue, values, onChange, enabled = true) {
  const surfaceRef = useRef(null);
  const enterFromRef = useRef(null);
  const busyRef = useRef(false);
  const timerRef = useRef(null);
  const frameRef = useRef(null);

  useLayoutEffect(() => {
    const from = enterFromRef.current;
    const surface = surfaceRef.current;
    if (from === null || !surface) return;
    enterFromRef.current = null;

    // The new tab is mounted off-screen first, then animates into the viewport.
    surface.style.transition = 'none';
    surface.style.transform = `translate3d(${from}px, 0, 0)`;
    void surface.offsetWidth;
    frameRef.current = window.requestAnimationFrame(() => {
      surface.style.transition = `transform ${SWIPE_DURATION}ms ${SWIPE_EASING}`;
      surface.style.transform = 'translate3d(0, 0, 0)';
      timerRef.current = window.setTimeout(() => {
        surface.style.transition = '';
        surface.style.transform = '';
        busyRef.current = false;
      }, SWIPE_DURATION + 30);
    });
  }, [activeValue]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || !enabled || values.length < 2) return undefined;

    const previousTouchAction = surface.style.touchAction;
    surface.style.touchAction = 'pan-y';
    let gesture = null;

    function resetSurface(animate = true) {
      surface.style.transition = animate ? `transform ${SWIPE_DURATION}ms ${SWIPE_EASING}` : 'none';
      surface.style.transform = 'translate3d(0, 0, 0)';
      if (animate) {
        window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => {
          surface.style.transition = '';
          surface.style.transform = '';
          busyRef.current = false;
        }, SWIPE_DURATION + 30);
      } else {
        surface.style.transition = '';
        surface.style.transform = '';
        busyRef.current = false;
      }
    }

    function onStart(event) {
      if (busyRef.current || event.touches.length !== 1) { gesture = null; return; }
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
      if (!gesture || busyRef.current || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dx = touch.clientX - gesture.x;
      const dy = touch.clientY - gesture.y;
      if (!gesture.axis) {
        if (Math.abs(dx) < 9 && Math.abs(dy) < 9) return;
        gesture.axis = Math.abs(dx) > Math.abs(dy) * 1.35 ? 'x' : 'y';
      }
      if (gesture.axis !== 'x') return;
      gesture.dx = dx;
      event.preventDefault();
      const index = values.indexOf(activeValue);
      const atEdge = (dx > 0 && index === 0) || (dx < 0 && index === values.length - 1);
      surface.style.transition = 'none';
      surface.style.transform = `translate3d(${atEdge ? dx * 0.28 : dx}px, 0, 0)`;
    }

    function onEnd() {
      const current = gesture;
      gesture = null;
      if (!current || current.axis !== 'x' || busyRef.current) return;
      const index = values.indexOf(activeValue);
      const elapsed = Date.now() - current.startedAt;
      const distance = Math.abs(current.dx);
      const nextIndex = current.dx < 0 ? index + 1 : index - 1;
      const canMove = index >= 0 && nextIndex >= 0 && nextIndex < values.length;
      const commit = canMove && (distance > Math.max(60, window.innerWidth * 0.18) || (elapsed < 320 && distance > 45));
      if (!commit) {
        resetSurface(true);
        return;
      }

      busyRef.current = true;
      const width = surface.getBoundingClientRect().width || window.innerWidth;
      const outgoing = current.dx < 0 ? -width : width;
      const incoming = -outgoing;
      surface.style.transition = `transform ${SWIPE_DURATION}ms ${SWIPE_EASING}`;
      surface.style.transform = `translate3d(${outgoing}px, 0, 0)`;
      timerRef.current = window.setTimeout(() => {
        enterFromRef.current = incoming;
        onChange(values[nextIndex]);
      }, SWIPE_DURATION);
    }

    function onCancel() {
      gesture = null;
      if (!busyRef.current) resetSurface(true);
    }

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

  useEffect(() => () => {
    window.clearTimeout(timerRef.current);
    if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
  }, []);

  return surfaceRef;
}
