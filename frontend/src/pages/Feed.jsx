import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import { useAppStore } from '../store.js';
import { loadPage } from '../lib/paged.js';
import { toast } from '../toast.js';
import PostCard from '../components/PostCard.jsx';
import { logError } from '../toast.js';

const STALE_AFTER_MS = 60 * 1000;
const WINDOW = 1; // render the current post and one on each side

// tab: 'discover' | 'following'
// Renders only the posts near the one on screen, so long feeds stay light.
export default function Feed({ tab }) {
  const cached = useAppStore((s) => s.feeds[tab]);
  const setFeed = useAppStore((s) => s.setFeed);
  const pending = useAppStore((s) => s.pendingUpload);
  const me = useAppStore((s) => s.user);
  const navigate = useNavigate();
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
    if (nextCursor && !loading && idx >= items.length - 4) run(false);
  }

  return (
    <>
      {pending?.kind === 'post' && <span className="feed-uploading" aria-hidden="true">
        {pending.mediaKind === 'video' ? <video src={pending.thumb} muted playsInline preload="metadata" /> : <img src={pending.thumb} alt="" />}
      </span>}
      <header className="sp-top" aria-label="Spotlight">
        <button type="button" className="sp-round sp-avatar" onClick={() => navigate(me?.username ? `/u/${me.username}` : '/')} aria-label="Your profile"><Avatar user={me || {}} size={34} /></button>
        <button type="button" className="sp-round" onClick={() => navigate('/search')} aria-label="Search"><Icon name="search" size={20} /></button>
        <h1 className="sp-title">Spotlight</h1>
        <button type="button" className="sp-round" onClick={() => navigate('/friends')} aria-label="Find friends"><Icon name="user-plus" size={20} /></button>
        <button type="button" className="sp-round" onClick={() => navigate('/upload')} aria-label="Create"><Icon name="plus" size={22} /></button>
      </header>
      <div className="feed" ref={containerRef} onScroll={onScroll} onTouchStart={(e) => { touchStartY.current = e.touches[0].clientY; }} onTouchEnd={pullToRefresh}>
        {refreshing && <div className="feed-refresh-indicator"> Refreshing</div>}
        {items.map((p, i) =>
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
