import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';

// Pull down from the top of a screen to refresh it. Works on touch screens; inner scrollers that are not at the top block it.
const TRIGGER_PX = 64;
const MAX_PX = 96;

function scrolledAway(node) {
  for (let el = node; el && el !== document.body; el = el.parentElement) {
    if (el.scrollTop > 0) return true;
  }
  return (window.scrollY || document.documentElement.scrollTop || 0) > 0;
}

export function usePullRefresh(onRefresh) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const start = useRef(null);
  const pullRef = useRef(0);
  const busyRef = useRef(false);
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  useEffect(() => {
    function onStart(event) {
      if (busyRef.current || event.touches.length !== 1 || scrolledAway(event.target)) { start.current = null; return; }
      start.current = { x: event.touches[0].clientX, y: event.touches[0].clientY, dir: null };
    }
    function onMove(event) {
      const s = start.current;
      if (!s || event.touches.length !== 1) return;
      const dx = event.touches[0].clientX - s.x;
      const dy = event.touches[0].clientY - s.y;
      if (!s.dir) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        s.dir = dy > 0 && dy > Math.abs(dx) ? 'pull' : 'other';
      }
      if (s.dir !== 'pull') return;
      const p = Math.min(MAX_PX, dy * 0.5);
      pullRef.current = p;
      setPull(p);
    }
    async function onEnd() {
      const s = start.current;
      start.current = null;
      const p = pullRef.current;
      pullRef.current = 0;
      if (!s || s.dir !== 'pull' || p < TRIGGER_PX || busyRef.current) { setPull(0); return; }
      busyRef.current = true;
      setBusy(true);
      setPull(TRIGGER_PX);
      try { await refreshRef.current(); } catch (_) { /* the screen shows its own error */ }
      busyRef.current = false;
      setBusy(false);
      setPull(0);
    }
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  const indicator = (
    <div className={`ptr${busy ? ' ptr-busy' : ''}`} style={{ height: pull }} aria-live="polite" aria-hidden={pull === 0 && !busy}>
      <span className={`ptr-icon${busy ? ' spin' : ''}`} style={{ opacity: busy ? 1 : Math.min(1, pull / TRIGGER_PX), transform: busy ? undefined : `rotate(${Math.min(180, pull * 2.8)}deg)` }}>
        <Icon name="refresh" size={18} />
      </span>
    </div>
  );
  return { indicator, busy };
}
