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
  const [followBusy, setFollowBusy] = useState({});
  const [recommendations, setRecommendations] = useState({ suggested: [], followBack: [] });
  const sentinel = useRef(null);
  const touchStartY = useRef(0);
  const [refreshing, setRefreshing] = useState(false);
  const items = cached?.items || [];
  const hasMore = Boolean(cached?.nextCursor);

  function more(reset = false) {
    setLoading(true);
    return loadPage(KEY, PATH, reset)
      .catch((e) => toast(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    api('/v1/users/suggestions').then(setRecommendations).catch(() => {});
  }, []);

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

  async function refreshExplore() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      if (results && query.trim()) setResults(await api(`/v1/search?q=${encodeURIComponent(query.trim())}&type=${searchType}`));
      else await more(true);
    } catch (e) { toast(e.message); }
    finally { setRefreshing(false); }
  }

  async function search(e) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) { setResults(null); return; }
    setSearching(true);
    try { setResults(await api(`/v1/search?q=${encodeURIComponent(q)}&type=${searchType}`)); }
    catch (err) { toast(err.message); }
    finally { setSearching(false); }
  }

  async function toggleFollow(person) {
    if (followBusy[person.id]) return;
    setFollowBusy((current) => ({ ...current, [person.id]: true }));
    try {
      const response = person.isFollowing
        ? await api(`/v1/users/${person.id}/follow`, { method: 'DELETE' })
        : await api(`/v1/users/${person.id}/follow`, { method: 'POST' });
      const updatePerson = (item) => item.id === person.id
        ? { ...item, isFollowing: response.isFollowing, followerCount: response.followerCount }
        : item;
      setResults((current) => current ? ({ ...current, people: (current.people || []).map(updatePerson) }) : current);
      setRecommendations((current) => ({
        suggested: current.suggested.map(updatePerson),
        followBack: current.followBack.map(updatePerson),
      }));
    } catch (err) { toast(err.message); }
    finally { setFollowBusy((current) => ({ ...current, [person.id]: false })); }
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
    <div className="ig-explore" onTouchStart={(e) => { touchStartY.current = e.touches[0].clientY; }} onTouchEnd={(e) => { if (e.changedTouches[0].clientY - touchStartY.current > 90 && e.currentTarget.scrollTop <= 0) refreshExplore(); }}>
      {refreshing && <div className="pull-refresh-indicator"><span className="refresh-spinner" /> Refreshing…</div>}
      <form className="ig-search" onSubmit={search} role="search">
        <Icon name="search" size={18} />
        <input aria-label="Search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" />
        {query && <button type="button" className="ig-search-clear" onClick={() => { setQuery(''); setResults(null); }} aria-label="Clear search">×</button>}
      </form>
      {(query.trim() || results) && <div className="ig-filters" role="tablist" aria-label="Search filters">
        {[['all', 'Top'], ['people', 'Accounts'], ['posts', 'Posts'], ['hashtags', 'Hashtags']].map(([t, label]) => <button type="button" role="tab" aria-selected={searchType === t} key={t} className={searchType === t ? 'on' : ''} onClick={() => { setSearchType(t); if (query.trim()) api(`/v1/search?q=${encodeURIComponent(query)}&type=${t}`).then(setResults).catch((e) => toast(e.message)); }}>{label}</button>)}
        <button type="button" role="tab" aria-selected={false} onClick={() => searchHashtag('music')}>Music</button>
        <button type="button" role="tab" aria-selected={false} onClick={() => searchHashtag('comedy')}>Comedy</button>
      </div>}

      {results ? <>
        {results.people?.length > 0 && <section className="ig-section">
          <h3 className="ig-section-title">Accounts</h3>
          {results.people.map((person) => <div className="ig-person" key={person.id}>
            <button className="ig-person-main" onClick={() => navigate(`/u/${person.username}`)}><Avatar user={person} size={44} /><span><strong>{person.username}</strong><small>{person.displayName} · {formatCount(person.followerCount)} followers</small></span></button>
            <button className={person.isFollowing ? 'ig-follow following' : 'ig-follow'} onClick={() => toggleFollow(person)} disabled={Boolean(followBusy[person.id])}>{followBusy[person.id] ? '…' : person.isFollowing ? 'Following' : 'Follow'}</button>
          </div>)}
        </section>}
        {results.posts?.length > 0 && <section className="ig-section"><h3 className="ig-section-title">Posts</h3><div className="ig-grid">{results.posts.map((p) => <button key={p.id} className="ig-tile" onClick={() => navigate(`/p/${p.id}`)}>{p.kind === 'video' ? <video src={mediaUrl(p.mediaUrl)} poster={mediaUrl(p.thumbUrl) || undefined} muted playsInline preload="metadata" /> : <img src={mediaUrl(p.mediaUrl)} alt="" loading="lazy" />}<span className="ig-tile-views">▶ {formatCount(p.viewCount)}</span></button>)}</div></section>}
        {!results.people?.length && !results.posts?.length && <p className="ig-empty">No results. Try another name or hashtag.</p>}
      </> : <>
        {recommendations.suggested.length > 0 && <section className="ig-section">
          <div className="ig-section-head"><h3 className="ig-section-title">Suggested for you</h3><button type="button" className="ig-link" onClick={() => navigate('/explore?q=')}>See all</button></div>
          <div className="ig-suggest-row">
            {recommendations.suggested.map((person) => <div className="ig-suggest-card" key={person.id}>
              <button className="ig-suggest-main" onClick={() => navigate(`/u/${person.username}`)}><Avatar user={person} size={64} /><strong>{person.username}</strong><small>{person.displayName || 'Suggested for you'}</small></button>
              <button className={person.isFollowing ? 'ig-follow following' : 'ig-follow'} onClick={() => toggleFollow(person)} disabled={Boolean(followBusy[person.id])}>{followBusy[person.id] ? '…' : person.isFollowing ? 'Following' : 'Follow'}</button>
            </div>)}
          </div>
        </section>}
        {recommendations.followBack.length > 0 && <section className="ig-section">
          <div className="ig-section-head"><h3 className="ig-section-title">Follows you</h3><button type="button" className="ig-link" onClick={() => navigate('/explore?q=')}>See all</button></div>
          {recommendations.followBack.map((person) => <div className="ig-person" key={person.id}>
            <button className="ig-person-main" onClick={() => navigate(`/u/${person.username}`)}><Avatar user={person} size={44} /><span><strong>{person.username}</strong><small>{person.displayName || 'Follows you'}</small></span></button>
            <button className={person.isFollowing ? 'ig-follow following' : 'ig-follow'} onClick={() => toggleFollow(person)} disabled={Boolean(followBusy[person.id])}>{followBusy[person.id] ? '…' : person.isFollowing ? 'Following' : 'Follow back'}</button>
          </div>)}
        </section>}
        <div className="xp-title">Explore</div>
        <div className="xp-grid">{items.map((p) => <button key={p.id} className="xp-card" onClick={() => navigate(`/explore/watch/${p.id}`)}>
          <span className="xp-media">{p.kind === 'video' ? <video src={mediaUrl(p.mediaUrl)} poster={mediaUrl(p.thumbUrl) || undefined} muted playsInline preload="metadata" /> : <img src={mediaUrl(p.mediaUrl)} alt="" loading="lazy" />}<span className="xp-views"><Icon name="play" size={13} />{formatCount(p.viewCount)}</span></span>
          <span className="xp-author">@{p.author?.username || 'creator'}</span>
        </button>)}</div>
        <div ref={sentinel} className="sentinel" />{loading && <p className="ig-empty">Loading…</p>}{!items.length && !loading && <p className="ig-empty">Nothing to explore yet.</p>}
      </>}
    </div>
  );
}
