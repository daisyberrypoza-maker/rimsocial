import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useAppStore } from '../store.js';
import { loadPage } from '../lib/paged.js';
import { toast } from '../toast.js';
import PostCard from '../components/PostCard.jsx';

const STALE_AFTER_MS = 60 * 1000;
const WINDOW = 1; // render the current post and one on each side

// tab: 'discover' | 'following'
// Renders only the posts near the one on screen, so long feeds stay light.
export default function Feed({ tab }) {
  const cached = useAppStore((s) => s.feeds[tab]);
  const setFeed = useAppStore((s) => s.setFeed);
  const containerRef = useRef(null);
  const saveTimer = useRef(null);
  const scrollHideTimer = useRef(null);
  const touchStartY = useRef(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);

  const items = cached?.items || [];
  const nextCursor = cached?.nextCursor ?? null;
  const [active, setActive] = useState(Math.min(cached?.activeIndex || 0, Math.max(items.length - 1, 0)));
  const path = `/v1/feed/${tab}`;

  const run = useCallback((reset) => {
    setLoading(true);
    return loadPage(tab, path, reset)
      .catch((e) => toast(e.message))
      .finally(() => setLoading(false));
  }, [tab, path]);

  // On open: restore the position, or refresh if the saved list is old
  useLayoutEffect(() => {
    const el = containerRef.current;
    const stale = !cached?.updatedAt || Date.now() - cached.updatedAt > STALE_AFTER_MS;
    if (stale) {
      if (el) el.scrollTop = 0;
      setActive(0);
      setFeed(tab, { activeIndex: 0 });
      run(true);
    } else if (el && cached?.activeIndex) {
      el.scrollTop = cached.activeIndex * el.clientHeight;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function pullToRefresh(e) {
    const delta = e.changedTouches[0].clientY - touchStartY.current;
    if (delta < 85 || containerRef.current?.scrollTop > 0 || refreshing) return;
    setRefreshing(true);
    try { await run(true); } finally { setRefreshing(false); }
  }

  function onScroll(e) {
    const el = e.currentTarget;
    el.classList.add('is-scrolling');
    clearTimeout(scrollHideTimer.current);
    scrollHideTimer.current = setTimeout(() => el.classList.remove('is-scrolling'), 450);
    const idx = Math.round(el.scrollTop / el.clientHeight);
    if (idx !== active) setActive(idx);

    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setFeed(tab, { activeIndex: idx }), 300);

    // Load the next page a few posts before the end
    if (nextCursor && !loading && idx >= items.length - 4) run(false);
  }

  return (
    <>
      <div className="feed" ref={containerRef} onScroll={onScroll} onTouchStart={(e) => { touchStartY.current = e.touches[0].clientY; }} onTouchEnd={pullToRefresh}>
        {refreshing && <div className="feed-refresh-indicator"><span className="refresh-spinner" /> Refreshing</div>}
        {items.map((p, i) =>
          Math.abs(i - active) <= WINDOW
            ? <PostCard key={p.id} post={p} active={i === active} />
            : <div key={p.id} className="slot" />
        )}
        {loading && <div className="slot"><p className="muted">Loading…</p></div>}
        {!items.length && !loading && (
          <div className="slot"><p className="muted">Nothing here yet. Post something or follow creators.</p></div>
        )}
      </div>
    </>
  );
}
