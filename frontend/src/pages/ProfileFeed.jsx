import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppStore } from '../store.js';
import { loadPage } from '../lib/paged.js';
import { toast } from '../toast.js';
import PostCard from '../components/PostCard.jsx';
import { logError } from '../toast.js';

export default function ProfileFeed() {
  const { username } = useParams();
  const navigate = useNavigate();
  const key = `u:${username}`;
  const cached = useAppStore((s) => s.feeds[key]);
  const items = cached?.items || [];
  const nextCursor = cached?.nextCursor ?? null;
  const container = useRef(null);
  const scrollHideTimer = useRef(null);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback((reset = false) => {
    setLoading(true);
    return loadPage(key, `/v1/users/${encodeURIComponent(username)}/posts`, reset)
      .catch((e) => logError(e))
      .finally(() => setLoading(false));
  }, [key, username]);

  useEffect(() => {
    load(true);
    return () => {};
  }, [load]);

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

  return <main className="profile-watch-page">
    <button className="profile-watch-back" onClick={() => navigate(`/u/${username}`)} aria-label="Back to profile">← @{username}</button>
    <div className="feed profile-watch-feed" ref={container} onScroll={onScroll}>
      {items.map((post, index) => <PostCard key={post.id} post={post} active={index === active} />)}
      {!items.length && !loading && <div className="slot"><p className="muted">This profile has no public posts yet.</p></div>}
    </div>
  </main>;
}
