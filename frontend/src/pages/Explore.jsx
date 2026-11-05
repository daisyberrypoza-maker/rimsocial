import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAppStore } from '../store.js';
import { loadPage } from '../lib/paged.js';
import { toast } from '../toast.js';
import { mediaUrl } from '../lib/config.js';
import { formatCount } from '../lib/format.js';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';

const KEY = 'explore';
const PATH = '/v1/feed/discover';
const STALE_AFTER_MS = 60 * 1000;

export default function Explore() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cached = useAppStore((s) => s.feeds[KEY]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState('all');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
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

  useEffect(() => {
    const el = sentinel.current;
    if (!el || results) return undefined;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && hasMore && !loading) more(false);
    }, { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, items.length, results]);

  async function search(e) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) { setResults(null); return; }
    setSearching(true);
    try { setResults(await api(`/v1/search?q=${encodeURIComponent(q)}&type=${searchType}`)); }
    catch (err) { toast(err.message); }
    finally { setSearching(false); }
  }

  function searchHashtag(tag) {
    setQuery(`#${tag}`);
    setSearchType('hashtags');
    setTimeout(() => api(`/v1/search?q=${encodeURIComponent(`#${tag}`)}&type=hashtags`).then(setResults).catch((e) => toast(e.message)), 0);
  }

  useEffect(() => {
    const initial = searchParams.get('q');
    if (!initial) return;
    const type = initial.startsWith('#') ? 'hashtags' : 'all';
    setQuery(initial); setSearchType(type);
    api(`/v1/search?q=${encodeURIComponent(initial)}&type=${type}`).then(setResults).catch((e) => toast(e.message));
  }, [searchParams]);

  return (
    <div className="page explore-page">
      <form className="explore-search" onSubmit={search}>
        <Icon name="search" size={21} />
        <input aria-label="Search creators, posts and hashtags" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people, videos, #hashtags" />
        {query && <button type="button" className="search-clear" onClick={() => { setQuery(''); setResults(null); }}>×</button>}
        <button type="submit" disabled={searching}>{searching ? '…' : 'Search'}</button>
      </form>
      <div className="search-filters" role="group" aria-label="Search type">
        {['all', 'people', 'posts', 'hashtags'].map((t) => <button type="button" key={t} className={searchType === t ? 'on' : ''} onClick={() => { setSearchType(t); if (query.trim()) api(`/v1/search?q=${encodeURIComponent(query)}&type=${t}`).then(setResults).catch((e) => toast(e.message)); }}>{t === 'all' ? 'Top' : t === 'people' ? 'People' : t === 'posts' ? 'Videos & posts' : '# Hashtags'}</button>)}
      </div>

      {results ? <>
        {results.people?.length > 0 && <section className="people-results"><h3>People</h3>{results.people.map((person) => <button className="person-result" key={person.id} onClick={() => navigate(`/u/${person.username}`)}><Avatar user={person} size={46} /><span><strong>{person.displayName}</strong><small>@{person.username} · {formatCount(person.followerCount)} followers</small></span><Icon name="chevron" size={20} /></button>)}</section>}
        {results.posts?.length > 0 && <><h3 className="explore-section-title">Posts</h3><div className="grid">{results.posts.map((p) => <button key={p.id} className="tile" onClick={() => navigate(`/p/${p.id}`)}>{p.kind === 'video' ? <video src={mediaUrl(p.mediaUrl)} poster={mediaUrl(p.thumbUrl) || undefined} muted playsInline preload="metadata" /> : <img src={mediaUrl(p.mediaUrl)} alt="" loading="lazy" />}<span className="tile-shade" />{p.caption && <span className="tile-title">{p.caption}</span>}<span className="tile-count">{formatCount(p.viewCount)}</span></button>)}</div></>}
        {!results.people?.length && !results.posts?.length && <p className="muted center">No results yet. Try another name or hashtag.</p>}
      </> : <>
        <div className="explore-heading"><h2>Explore</h2><span className="muted">Find your next favourite</span></div>
        <div className="hashtag-chips"><button onClick={() => searchHashtag('fyp')}>#fyp</button><button onClick={() => searchHashtag('trending')}>#trending</button><button onClick={() => searchHashtag('comedy')}>#comedy</button><button onClick={() => searchHashtag('music')}>#music</button></div>
        <div className="grid">{items.map((p) => <button key={p.id} className="tile" onClick={() => navigate(`/p/${p.id}`)}>{p.kind === 'video' ? <video src={mediaUrl(p.mediaUrl)} poster={mediaUrl(p.thumbUrl) || undefined} muted playsInline preload="metadata" /> : <img src={mediaUrl(p.mediaUrl)} alt="" loading="lazy" />}<span className="tile-shade" />{p.caption && <span className="tile-title">{p.caption}</span>}<span className="tile-count">{formatCount(p.viewCount)}</span></button>)}</div>
        <div ref={sentinel} className="sentinel" />{loading && <p className="muted center">Loading…</p>}{!items.length && !loading && <p className="muted center">Nothing to explore yet.</p>}
      </>}
    </div>
  );
}
