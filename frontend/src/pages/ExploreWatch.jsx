import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppStore } from '../store.js';
import { loadPage } from '../lib/paged.js';
import { toast } from '../toast.js';
import PostCard from '../components/PostCard.jsx';
import { goBack } from '../lib/goBack.js';

const KEY = 'explore';
const PATH = '/v1/feed/explore';

// Vertical feed of Explore posts, starting at the post that was tapped.
export default function ExploreWatch() {
  const { postId } = useParams();
  const navigate = useNavigate();
  const cached = useAppStore((s) => s.feeds[KEY]);
  const items = cached?.items || [];
  const nextCursor = cached?.nextCursor ?? null;
  const container = useRef(null);
  const started = useRef(false);
  const scrollHideTimer = useRef(null);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback((reset = false) => {
    setLoading(true);
    return loadPage(KEY, PATH, reset)
      .catch((e) => toast(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!items.length) load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Jump to the tapped post once the list is available
  useEffect(() => {
    if (started.current || !items.length) return;
    const index = Math.max(0, items.findIndex((p) => p.id === postId));
    started.current = true;
    setActive(index);
    requestAnimationFrame(() => {
      const el = container.current;
      if (el) el.scrollTop = index * el.clientHeight;
    });
  }, [items, postId]);

  function onScroll(e) {
    const el = e.currentTarget;
    el.classList.add('is-scrolling');
    el.closest('.profile-watch-page')?.classList.add('is-scrolling');
    clearTimeout(scrollHideTimer.current);
    scrollHideTimer.current = setTimeout(() => {
      el.classList.remove('is-scrolling');
      el.closest('.profile-watch-page')?.classList.remove('is-scrolling');
    }, 450);
    const index = Math.round(el.scrollTop / Math.max(1, el.clientHeight));
    setActive(index);
    if (nextCursor && !loading && index >= items.length - 3) load(false);
  }

  return <main className="profile-watch-page xp-watch">
    <button className="profile-watch-back" onClick={() => goBack(navigate)} aria-label="Back to Explore">← Explore</button>
    <div className="feed profile-watch-feed" ref={container} onScroll={onScroll}>
      {items.map((post, index) => <PostCard key={post.id} post={post} active={index === active} />)}
      {loading && <div className="slot"><p className="muted">Loading posts…</p></div>}
      {!items.length && !loading && <div className="slot"><p className="muted">Nothing to watch yet.</p></div>}
    </div>
  </main>;
}
