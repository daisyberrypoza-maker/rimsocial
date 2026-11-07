import { useEffect } from 'react';

// Main tabs in bottom-bar order. Swipe left for the next tab, right for the previous one.
export const TAB_PATHS = ['/stories', '/', '/chat', '/upload', '/explore'];

// Swipes that start on these elements belong to them (text entry, video, carousels, sheets)
const IGNORE = 'input, textarea, select, video, [contenteditable="true"], [data-no-swipe], .story-rail, .sv-root, .rv-sheet, .rv-sheet-backdrop, .as-backdrop, .sv-share-backdrop, [role="dialog"], [role="listbox"]';
const LOCK_PX = 10;          // movement needed before we decide the direction
const SETTLE_MS = 230;       // length of the slide or spring-back
const busyRef = { current: false };

function appEl() { return document.querySelector('.app'); }
function setOffset(px) { appEl()?.style.setProperty('--swipe-x', `${px}px`); }
function setClass(name, on) { appEl()?.classList.toggle(name, on); }

// Follows the finger, then slides the screen to the next tab (Snapchat-style) or springs back.
export function useTabSwipe(navigate, pathname, enabled) {
  useEffect(() => {
    if (!enabled || !TAB_PATHS.includes(pathname)) return undefined;
    const index = TAB_PATHS.indexOf(pathname);
    let gesture = null; // { x, y, time, mode: 'pending' | 'horizontal' | 'ignore', dx }

    const targetFor = (dx) => TAB_PATHS[dx < 0 ? index + 1 : index - 1];

    function settle(to, onDone) {
      setClass('swipe-anim', true);
      setOffset(to);
      window.setTimeout(onDone, SETTLE_MS);
    }

    function springBack() {
      settle(0, () => {
        setClass('swipe-anim', false);
        setClass('swiping', false);
        setOffset(0);
        busyRef.current = false;
      });
    }

    function onStart(event) {
      if (busyRef.current || event.touches.length !== 1 || (event.target.closest && event.target.closest(IGNORE))) { gesture = null; return; }
      const touch = event.touches[0];
      gesture = { x: touch.clientX, y: touch.clientY, time: Date.now(), mode: 'pending', dx: 0 };
    }

    function onMove(event) {
      if (!gesture || busyRef.current || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dx = touch.clientX - gesture.x;
      const dy = touch.clientY - gesture.y;
      if (gesture.mode === 'pending') {
        if (Math.abs(dx) < LOCK_PX && Math.abs(dy) < LOCK_PX) return;
        if (Math.abs(dx) > Math.abs(dy) * 1.4) {
          gesture.mode = 'horizontal';
          setClass('swipe-anim', false);
          setClass('swiping', true);
        } else {
          gesture.mode = 'ignore';
          return;
        }
      }
      if (gesture.mode !== 'horizontal') return;
      gesture.dx = dx;
      // Resists at the first and last tab, as Snapchat does
      const edge = !targetFor(dx);
      setOffset(edge ? dx * 0.3 : dx);
    }

    function onEnd(event) {
      const current = gesture;
      gesture = null;
      if (!current || current.mode !== 'horizontal' || busyRef.current) return;
      const dx = current.dx;
      const elapsed = Date.now() - current.time;
      const target = targetFor(dx);
      const commit = Boolean(target) && (Math.abs(dx) > window.innerWidth * 0.25 || (elapsed < 320 && Math.abs(dx) > 50));
      if (!commit) { busyRef.current = true; springBack(); return; }

      busyRef.current = true;
      const width = window.innerWidth;
      const outTo = dx < 0 ? -width : width;
      settle(outTo, () => {
        // The new screen starts off to the side the finger came from, then slides in
        setClass('swipe-anim', false);
        // Replace, not push: moving between bottom tabs never adds a Back step
        navigate(target, { replace: true });
        setOffset(-outTo);
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
          settle(0, () => {
            setClass('swipe-anim', false);
            setClass('swiping', false);
            setOffset(0);
            busyRef.current = false;
          });
        }));
      });
      void event;
    }

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    // A cancelled touch ends the gesture too, so the page is never left pushed to the side
    const onCancel = () => { gesture = null; if (!busyRef.current) { setClass('swiping', false); setClass('swipe-anim', false); setOffset(0); } };
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onCancel);
    };
  }, [enabled, navigate, pathname]);
}
