import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppStore } from '../store.js';
import { loadPage } from '../lib/paged.js';
import { api } from '../api.js';
import { toast } from '../toast.js';
import PostCard from '../components/PostCard.jsx';
import '../pages/UploadStatus.css';
import { logError } from '../toast.js';
import { clamp, snapTarget } from '../lib/snapPaging.js';

// Tabs already opened in this app session. A cold start (app closed and reopened)
// clears this, so the feed always starts at the first post.
const openedThisSession = {};
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
  const tag = (p) => ({ ...p, popularStory: true });
  extra.slice(0, 1).forEach((p) => out.splice(Math.min(2, out.length), 0, tag(p)));
  extra.slice(1, 2).forEach((p) => out.splice(Math.min(9, out.length), 0, tag(p)));
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
  const touchStartT = useRef(0);
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
  // Popular stories are mixed in only when the feed has posts, so an empty feed shows the empty message
  const shown = items.length ? mixPopular(items, popular) : items;
  const nextCursor = cached?.nextCursor ?? null;
  const [active, setActive] = useState(Math.min(cached?.activeIndex || 0, Math.max(items.length - 1, 0)));
  const path = `/v1/feed/${tab}`;

  const run = useCallback((reset) => {
    setLoading(true);
    return loadPage(tab, path, reset)
      .catch((e) => logError(e))
      .finally(() => setLoading(false));
  }, [tab, path]);

  const location = useLocation();
  const tabPath = tab === 'following' ? '/following' : '/';

  // Moves the feed to a post index and remembers which post is on screen.
  function jumpTo(index) {
    const el = containerRef.current;
    if (el) el.scrollTop = index * el.clientHeight;
    setActive(index);
    setFeed(tab, { activeIndex: index, activePostId: shown[index]?.id || null });
  }

  // Returning to the tab: if there is a newer first post, open it; otherwise keep the post
  // being watched. The saved post is shown at once, then the list is refreshed behind it.
  function returnToTab() {
    const before = useAppStore.getState().feeds[tab]?.items || [];
    const headBefore = before[0]?.id;
    const saved = useAppStore.getState().feeds[tab] || {};
    const pick = (list) => {
      const byId = saved.activePostId ? list.findIndex((p) => p.id === saved.activePostId) : -1;
      return byId >= 0 ? byId : Math.min(saved.activeIndex || 0, Math.max(list.length - 1, 0));
    };
    const first = pick(before);
    if (before.length) jumpTo(first);
    run(true).then(() => {
      const after = useAppStore.getState().feeds[tab]?.items || [];
      if (!after.length) return;
      if (after[0]?.id !== headBefore) { jumpTo(0); return; }
      const next = pick(after);
      if (next !== first) jumpTo(next);
    });
  }

  // Opening the tab: first open in this session starts at the first post; otherwise return to the saved post.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!openedThisSession[tab] || !cached?.items?.length) {
      openedThisSession[tab] = true;
      if (el) el.scrollTop = 0;
      setActive(0);
      setFeed(tab, { activeIndex: 0, activePostId: null });
      run(true);
      return;
    }
    openedThisSession[tab] = true;
    returnToTab();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // Tapping this tab again (bottom bar or Rimlight/Following header) while already on it
  const lastLocationKey = useRef(location.key);
  useEffect(() => {
    if (location.key === lastLocationKey.current) return;
    lastLocationKey.current = location.key;
    if (location.pathname === tabPath) returnToTab();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  // Snap_Next_Page: the native snap is paused for the gesture, then the feed moves one video on
  // when the swipe passes 25% of the screen or is faster than 600px/s
  function pageAfterSwipe(e) {
    const el = containerRef.current;
    if (!el || refreshing) return;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dy) < 8) { el.style.scrollSnapType = ''; return; }
    const seconds = Math.max((Date.now() - touchStartT.current) / 1000, 0.016);
    const H = el.clientHeight;
    const current = Math.round(el.scrollTop / H);
    const target = clamp(snapTarget(current, dy, dy / seconds, H), 0, Math.max(0, shown.length - 1));
    el.scrollTo({ top: target * H, behavior: 'smooth' });
    setTimeout(() => { el.style.scrollSnapType = ''; }, 450);
  }

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
    saveTimer.current = setTimeout(() => setFeed(tab, { activeIndex: idx, activePostId: shown[idx]?.id || null }), 300);

    // Load the next page a few posts before the end
    if (nextCursor && !loading && idx >= shown.length - 4) run(false);
  }

  return (
    <>
      {pending?.kind === 'post' && <span className="feed-uploading" aria-label={`${pending.status || 'Uploading'} ${pending.progress || 0}%`}>
        {pending.mediaKind === 'video' ? <video src={pending.thumb} muted playsInline preload="metadata" /> : <img src={pending.thumb} alt="" />}
        <span className="feed-upload-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={pending.progress || 0}>
          <span style={{ width: `${pending.progress || 0}%` }} />
        </span>
        <span className="feed-upload-label">{pending.status || 'Uploading'} {pending.progress || 0}%</span>
      </span>}
      <div className="feed" ref={containerRef} onScroll={onScroll} onTouchStart={(e) => { touchStartY.current = e.touches[0].clientY; touchStartT.current = Date.now(); if (containerRef.current) containerRef.current.style.scrollSnapType = 'none'; }} onTouchEnd={(e) => { pullToRefresh(e); pageAfterSwipe(e); }}>
        {refreshing && <div className="feed-refresh-indicator"> Refreshing</div>}
        {shown.map((p, i) =>
          Math.abs(i - active) <= WINDOW
            ? <PostCard key={p.id} post={p} active={i === active} />
            : <div key={p.id} className="slot" />
        )}
        {!shown.length && !loading && (
          <div className="slot"><p className="muted">Nothing here yet. Post something or follow creators.</p></div>
        )}
      </div>
    </>
  );
}
