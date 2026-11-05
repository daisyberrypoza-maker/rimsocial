import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store.js';
import { loadPage } from '../lib/paged.js';
import { toast } from '../toast.js';
import { mediaUrl } from '../lib/config.js';
import { formatCount } from '../lib/format.js';

const KEY = 'explore';
const PATH = '/v1/feed/discover';
const STALE_AFTER_MS = 60 * 1000;

export default function Explore() {
  const navigate = useNavigate();
  const cached = useAppStore((s) => s.feeds[KEY]);
  const [loading, setLoading] = useState(false);
  const sentinel = useRef(null);
  const items = cached?.items || [];
  const hasMore = Boolean(cached?.nextCursor);

  function more(reset = false) {
    setLoading(true);
    return loadPage(KEY, PATH, reset)
      .catch((e) => toast(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const stale = !cached?.updatedAt || Date.now() - cached.updatedAt > STALE_AFTER_MS;
    if (stale) more(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the next page when the bottom of the grid comes into view
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && hasMore && !loading) more(false);
    }, { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, loading, items.length]);

  return (
    <div className="page">
      <div className="grid">
        {items.map((p) => (
          <button key={p.id} className="tile" onClick={() => navigate(`/u/${p.author?.username}`)}>
            {p.kind === 'video'
              ? <video src={mediaUrl(p.mediaUrl)} poster={mediaUrl(p.thumbUrl) || undefined} muted playsInline preload="metadata" />
              : <img src={mediaUrl(p.mediaUrl)} alt="" loading="lazy" />}
            <span className="tile-shade" />
            {p.caption && <span className="tile-title">{p.caption}</span>}
            <span className="tile-count">{formatCount(p.viewCount)}</span>
          </button>
        ))}
      </div>
      <div ref={sentinel} className="sentinel" />
      {loading && <p className="muted center">Loading…</p>}
      {!items.length && !loading && <p className="muted center">Nothing to explore yet.</p>}
    </div>
  );
}
