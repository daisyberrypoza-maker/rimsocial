import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAppStore } from '../store.js';
import { loadPage } from '../lib/paged.js';
import { api } from '../api.js';
import { toast } from '../toast.js';
import PostCard from '../components/PostCard.jsx';
import '../pages/UploadStatus.css';
import { logError } from '../toast.js';

const STALE_AFTER_MS = 60 * 1000;
const WINDOW = 1; // render the current post and one on each side

// tab: 'discover' | 'following'
// Renders only the posts near the one on screen, so long feeds stay light.
// Puts popular stories into the post list at the 3rd and 10th places, skipping any already in the list
function mixPopular(items, popular) {
  if (!popular.length) return items;
  const listed = new Set(items.map((p) => p.id));
  const extra = popular.filter((p) => !listed.has(p.id));
  if (!extra.length) return items;
  const out = [...items];
  extra.slice(0, 1).forEach((p) => out.splice(Math.min(2, out.length), 0, p));
  extra.slice(1, 2).forEach((p) => out.splice(Math.min(9, out.length), 0, p));
  return out;
}

export default function Feed({ tab }) {
  const cached = useAppStore((s) => s.feeds[tab]);
  const setFeed = useAppStore((s) => s.setFeed);
  const pending = useAppStore((s) => s.pendingUpload);
  const containerRef = useRef(null);
  const saveTimer = useRef(null);
  const scrollHideTimer = useRef(null);
  const touchStartY = useRef(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [popular, setPopular] = useState([]);
  // Popular public stories for Rimlight, refreshed when the tab opens
  useEffect(() => {
    let alive = true;
    api('/v1/stories/popular').then((d) => { if (alive) setPopular(d.items || []); }).catch(() => {});
    return () => { alive = false; };
  }, [tab]);

  const items = cached?.items || [];
  // Popular stories appear among the posts: two of them, at the 3rd and 10th places, when not already listed
  const shown = mixPopular(items, popular);
  const nextCursor = cached?.nextCursor ?? null;
  const [active, setActive] = useState(Math.min(cached?.activeIndex || 0, Math.max(items.length - 1, 0)));
  const path = `/v1/feed/${tab}`;

  const run = useCallback((reset) => {
    setLoading(true);
    return loadPage(tab, path, reset)
      .catch((e) => logError(e))
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
    if (nextCursor && !loading && idx >= shown.length - 4) run(false);
  }

  return (
    <>
      {pending?.kind === 'post' && <span className="feed-uploading" aria-hidden="true">
        {pending.mediaKind === 'video' ? <video src={pending.thumb} muted playsInline preload="metadata" /> : <img src={pending.thumb} alt="" />}
      </span>}
      <div className="feed" ref={containerRef} onScroll={onScroll} onTouchStart={(e) => { touchStartY.current = e.touches[0].clientY; }} onTouchEnd={pullToRefresh}>
        {refreshing && <div className="feed-refresh-indicator"> Refreshing</div>}
        {shown.map((p, i) =>
          Math.abs(i - active) <= WINDOW
            ? <PostCard key={p.id} post={p} active={i === active} />
            : <div key={p.id} className="slot" />
        )}
        {!items.length && !loading && (
          <div className="slot"><p className="muted">Nothing here yet. Post something or follow creators.</p></div>
        )}
      </div>
    </>
  );
}
