import { useEffect, useRef } from 'react';

// Bottom-tab order. Upload is intentionally included even though it has no visible bottom bar.
export const TAB_PATHS = ['/search', '/chat', '/upload', '/stories', '/'];
const IGNORE = 'input, textarea, select, audio, [contenteditable="true"], [data-no-swipe], .story-rail, .sv-root, .rv-sheet, .rv-sheet-backdrop, .as-backdrop, .sv-share-backdrop, [role="dialog"], [role="listbox"]';
const LOCK_PX = 10;
const SETTLE_MS = 220;

function insideHorizontalStrip(node) {
  for (let el = node instanceof Element ? node : node?.parentElement; el && el !== document.body; el = el.parentElement) {
    if (el.classList?.contains('app')) break;
    const style = window.getComputedStyle(el);
    if ((style.overflowX === 'auto' || style.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) return true;
  }
  return false;
}
function appEl() { return document.querySelector('.app'); }
function setOffset(px) { appEl()?.style.setProperty('--swipe-x', `${px}px`); }
function setClass(name, on) { appEl()?.classList.toggle(name, on); }

export function useTabSwipe(navigate, pathname, enabled) {
  const busyRef = useRef(false);
  const afterMountRef = useRef(null);
  const fallbackRef = useRef(null);

  useEffect(() => {
    if (!enabled || !TAB_PATHS.includes(pathname)) return undefined;
    const index = TAB_PATHS.indexOf(pathname);
    let gesture = null;

    const clearMotion = () => {
      window.clearTimeout(fallbackRef.current);
      fallbackRef.current = null;
      setClass('swipe-anim', false);
      setClass('swiping', false);
      setOffset(0);
      busyRef.current = false;
      afterMountRef.current = null;
    };

    function settle(to, done) {
      setClass('swipe-anim', true);
      setOffset(to);
      window.setTimeout(done, SETTLE_MS);
    }

    function springBack() {
      settle(0, clearMotion);
    }

    function onStart(event) {
      const target = event.target;
      if (busyRef.current || event.touches.length !== 1 ||
          target.closest?.(IGNORE) || target.closest?.('[data-local-tab-swipe]') ||
          insideHorizontalStrip(target)) {
        gesture = null;
        return;
      }
      const t = event.touches[0];
      gesture = { x: t.clientX, y: t.clientY, time: Date.now(), mode: 'pending', dx: 0 };
    }

    function onMove(event) {
      if (!gesture || busyRef.current || event.touches.length !== 1) return;
      const t = event.touches[0];
      const dx = t.clientX - gesture.x;
      const dy = t.clientY - gesture.y;
      if (gesture.mode === 'pending') {
        if (Math.abs(dx) < LOCK_PX && Math.abs(dy) < LOCK_PX) return;
        if (Math.abs(dx) <= Math.abs(dy) * 1.25) { gesture.mode = 'ignore'; return; }
        gesture.mode = 'horizontal';
        setClass('swipe-anim', false);
        setClass('swiping', true);
      }
      if (gesture.mode !== 'horizontal') return;
      event.preventDefault();
      gesture.dx = dx;
      const hasTarget = dx < 0 ? index < TAB_PATHS.length - 1 : index > 0;
      setOffset(hasTarget ? dx : dx * 0.28);
    }

    function onEnd() {
      const current = gesture;
      gesture = null;
      if (!current || current.mode !== 'horizontal' || busyRef.current || Math.abs(current.dx) < 1) return;
      const dx = current.dx;
      const elapsed = Date.now() - current.time;
      const nextIndex = dx < 0 ? index + 1 : index - 1;
      const valid = nextIndex >= 0 && nextIndex < TAB_PATHS.length;
      const commit = valid && (Math.abs(dx) >= Math.max(64, window.innerWidth * 0.18) || (elapsed < 350 && Math.abs(dx) > 48));
      if (!commit) { busyRef.current = true; springBack(); return; }

      busyRef.current = true;
      const outgoing = dx < 0 ? -window.innerWidth : window.innerWidth;
      settle(outgoing, () => {
        setClass('swipe-anim', false);
        setOffset(-outgoing);
        const slideIn = () => {
          if (afterMountRef.current !== slideIn) return;
          afterMountRef.current = null;
          settle(0, clearMotion);
        };
        afterMountRef.current = slideIn;
        window.clearTimeout(fallbackRef.current);
        fallbackRef.current = window.setTimeout(slideIn, 900);
        navigate(TAB_PATHS[nextIndex], { replace: true });
      });
    }

    function onCancel() {
      gesture = null;
      if (!busyRef.current) clearMotion();
    }

    // A route change mounts the next screen; animate it in exactly once.
    if (afterMountRef.current) {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => afterMountRef.current?.()));
    }
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onCancel);
    };
  }, [enabled, navigate, pathname]);

  useEffect(() => () => {
    window.clearTimeout(fallbackRef.current);
    setClass('swipe-anim', false);
    setClass('swiping', false);
    setOffset(0);
  }, []);
}
