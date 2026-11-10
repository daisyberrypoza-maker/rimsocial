import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAppStore } from '../store.js';
import { loadPage } from '../lib/paged.js';
import { toast } from '../toast.js';
import { mediaUrl } from '../lib/config.js';
import { formatCount } from '../lib/format.js';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import { goBack } from '../lib/goBack.js';
import { logError } from '../toast.js';
import '../snap-screens.css';
import { useSwipeTabs } from '../lib/useSwipeTabs.js';

const KEY = 'explore';
const PATH = '/v1/feed/explore';
const STALE_AFTER_MS = 60 * 1000;
const SEARCH_TABS = ['all', 'people', 'posts', 'hashtags'];

export default function Explore() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const peopleMode = location.pathname === '/friends' || searchParams.get('people') === '1';
  const searchMode = searchParams.get('search') === '1';
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
  const [dismissed, setDismissed] = useState({});
  const swipeSurfaceRef = useSwipeTabs(searchType, SEARCH_TABS, setSearchType, searchMode && Boolean(query.trim() || results));
  const items = cached?.items || [];
  const hasMore = Boolean(cached?.nextCursor);
  // One place per person: anyone who follows you or you follow is never under Suggested
  const followBackIds = new Set(recommendations.followBack.map((person) => person.id));
  const suggestedOnly = recommendations.suggested.filter((person) => !person.isFollowing && !followBackIds.has(person.id));

  function more(reset = false) {
    setLoading(true);
    return loadPage(KEY, PATH, reset)
      .catch((e) => logError(e))
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
    } catch (e) { logError(e); }
    finally { setRefreshing(false); }
  }

  async function search(e) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) { setResults(null); return; }
    setSearching(true);
    try { setResults(await api(`/v1/search?q=${encodeURIComponent(q)}&type=${searchType}`)); }
    catch (err) { logError(err); }
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
    } catch (err) { logError(err); }
    finally { setFollowBusy((current) => ({ ...current, [person.id]: false })); }
  }

  function searchHashtag(tag) {
    setQuery(`#${tag}`);
    setSearchType('hashtags');
    setTimeout(() => api(`/v1/search?q=${encodeURIComponent(`#${tag}`)}&type=hashtags`).then(setResults).catch((e) => logError(e)), 0);
  }

  useEffect(() => {
    const initial = searchParams.get('q');
    if (!initial) return;
    const type = initial.startsWith('#') ? 'hashtags' : 'all';
    setQuery(initial); setSearchType(type);
    api(`/v1/search?q=${encodeURIComponent(initial)}&type=${type}`).then(setResults).catch((e) => logError(e));
  }, [searchParams]);

  return (
    <div ref={swipeSurfaceRef} data-local-tab-swipe className={`ig-explore${peopleMode ? ' friends-page' : ''}`} onTouchStart={(e) => { touchStartY.current = e.touches[0].clientY; }} onTouchEnd={(e) => { if (e.changedTouches[0].clientY - touchStartY.current > 90 && e.currentTarget.scrollTop <= 0) refreshExplore(); }}>
      {peopleMode && !searchMode && <header className="sn-af-head"><button type="button" className="sn-af-iconbtn" onClick={() => goBack(navigate)} aria-label="Close"><Icon name="chevron-down" size={26} /></button><h1>Add Friends</h1><button type="button" className="sn-af-iconbtn" aria-label="More"><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg></button></header>}
      {searchMode ? <div className="rim-search-head">
        <button type="button" className="rim-search-back" aria-label="Back" onClick={() => goBack(navigate, peopleMode ? '/friends' : '/explore')}><Icon name="arrow-left" size={23} /></button>
        <form className="ig-search" onSubmit={search} role="search">
          <Icon name="search" size={19} />
          <input autoFocus aria-label="Search people, posts and hashtags" value={query} onFocus={() => {}} onChange={(e) => setQuery(e.target.value)} placeholder="Search" />
          {query && <button type="button" className="ig-search-clear" onClick={() => { setQuery(''); setResults(null); }} aria-label="Clear search">×</button>}
        </form>
      </div> : peopleMode ? <button type="button" className="sn-search" onClick={() => navigate('/friends?search=1')}><Icon name="search" size={19} /><span>{query || 'Search...'}</span><svg className="sn-ghost" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><rect x="2.5" y="2.5" width="19" height="19" rx="5" /><path d="M12 6.5c-2.4 0-4 1.8-4 4.2v5.3l1.4-1 1.3 1.1 1.3-1.1 1.3 1.1 1.3-1.1 1.4 1v-5.3c0-2.4-1.6-4.2-4-4.2z" /></svg></button>
        : <button type="button" className="rim-search-launch" onClick={() => navigate(peopleMode ? '/friends?search=1' : '/explore?search=1')}><Icon name="search" size={19} /><span>{query || 'Search'}</span></button>}
      {peopleMode && !searchMode && !results && <>
        <button type="button" className="sn-invite"><Icon name="users" size={20} /><span>Invite your friends!</span></button>
        <div className="sn-af-section"><h3>Find Friends{recommendations.followBack.length > 0 && <span className="sn-new-pill">{recommendations.followBack.length} New</span>}</h3><button type="button" className="sn-all-contacts" onClick={() => navigate('/my-friends')}>All Contacts <Icon name="chevron-right" size={16} /></button></div>
      </>}
      {searchMode && (query.trim() || results) && <div className="ig-filters" role="tablist" aria-label="Search filters">
        {[['all', 'Top'], ['people', 'Accounts'], ['posts', 'Posts'], ['hashtags', 'Hashtags']].map(([t, label]) => <button type="button" role="tab" aria-selected={searchType === t} key={t} className={searchType === t ? 'on' : ''} onClick={() => { setSearchType(t); if (query.trim()) api(`/v1/search?q=${encodeURIComponent(query)}&type=${t}`).then(setResults).catch((e) => logError(e)); }}>{label}</button>)}
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
        {results.posts?.length > 0 && <section className="ig-section"><h3 className="ig-section-title">Posts</h3>{results.posts.map((p) => <button key={p.id} className="rim-search-post" onClick={() => navigate(`/p/${p.id}`)}><span className="rim-search-post-thumb">{p.kind === 'video' ? <video src={mediaUrl(p.mediaUrl)} poster={mediaUrl(p.thumbUrl) || undefined} muted playsInline preload="metadata" /> : <img src={mediaUrl(p.mediaUrl)} alt="" loading="lazy" />}</span><span className="rim-search-post-copy"><strong>@{p.author?.username || 'creator'}</strong><small>{p.caption || 'Post'} · {formatCount(p.viewCount)} views</small></span></button>)}</section>}
        {!results.people?.length && !results.posts?.length && <p className="ig-empty">No results. Try another name or hashtag.</p>}
      </> : <>
        {peopleMode && !results && (() => {
          const people = [...recommendations.followBack, ...suggestedOnly].filter((person) => !dismissed[person.id]);
          return people.length > 0 && <ul className="sn-af-list">{people.map((person) => {
            const isNew = followBackIds.has(person.id);
            return <li className={isNew ? 'sn-af-row new' : 'sn-af-row'} key={person.id}>
              <button type="button" className="sn-af-main" onClick={() => navigate(`/u/${person.username}`)}>
                <span className="sn-af-avatar"><Avatar user={person} size={52} />{person.isOnline && <span className="sn-online" aria-label="Online" />}</span>
                <span className="sn-af-text"><strong>{person.displayName || person.username}</strong><small>{isNew ? 'Follows you' : person.username}</small></span>
              </button>
              <button type="button" className={person.isFollowing ? 'sn-af-add added' : 'sn-af-add'} onClick={() => toggleFollow(person)} disabled={Boolean(followBusy[person.id])}>{followBusy[person.id] ? '…' : person.isFollowing ? 'Added' : <><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="4" /><path d="M2 21c0-3.5 3-6 7-6s7 2.5 7 6" /><path d="M19 8v6M16 11h6" /></svg>Add</>}</button>
              <button type="button" className="sn-af-dismiss" aria-label={`Remove ${person.username}`} onClick={() => setDismissed((current) => ({ ...current, [person.id]: true }))}>×</button>
            </li>;
          })}</ul>;
        })()}
        {!peopleMode && recommendations.followBack.length > 0 && <section className="ig-section">
          <div className="ig-section-head"><h3 className="ig-section-title">Follows you</h3>{!peopleMode && <button type="button" className="ig-link" onClick={() => navigate('/friends')}>See all</button>}</div>
          {recommendations.followBack.map((person) => <div className="ig-person" key={person.id}>
            <button className="ig-person-main" onClick={() => navigate(`/u/${person.username}`)}><Avatar user={person} size={44} /><span><strong>{person.username}</strong><small>{person.displayName || 'Follows you'}</small></span></button>
            <button className={person.isFollowing ? 'ig-follow following' : 'ig-follow'} onClick={() => toggleFollow(person)} disabled={Boolean(followBusy[person.id])}>{followBusy[person.id] ? '…' : person.isFollowing ? 'Following' : 'Follow back'}</button>
          </div>)}
        </section>}
        {!peopleMode && suggestedOnly.length > 0 && <section className="ig-section">
          <div className="ig-section-head"><h3 className="ig-section-title">Suggested for you</h3></div>
          {suggestedOnly.map((person) => <div className="ig-person" key={person.id}>
            <button className="ig-person-main" onClick={() => navigate(`/u/${person.username}`)}><Avatar user={person} size={48} /><span><strong>{person.username}</strong><small>{person.mutualCount ? `${person.mutualCount} mutual connection${person.mutualCount === 1 ? '' : 's'} · ` : ''}${person.displayName || 'Suggested creator'}</small></span></button>
            <button className={person.isFollowing ? 'ig-follow following' : 'ig-follow'} onClick={() => toggleFollow(person)} disabled={Boolean(followBusy[person.id])}>{followBusy[person.id] ? '…' : person.isFollowing ? 'Following' : 'Follow'}</button>
          </div>)}
        </section>}
        {peopleMode && !suggestedOnly.length && !recommendations.followBack.length && <p className="ig-empty">Search for people by name or username.</p>}
        {!peopleMode && <>
          {!searchMode && <div className="xp-title">Explore</div>}
          {!searchMode && <div className="xp-grid">{items.map((p) => <button key={p.id} className="xp-card" onClick={() => navigate(`/explore/watch/${p.id}`)}>
            <span className="xp-media">{p.kind === 'video' ? <video src={mediaUrl(p.mediaUrl)} poster={mediaUrl(p.thumbUrl) || undefined} muted playsInline preload="metadata" /> : <img src={mediaUrl(p.mediaUrl)} alt="" loading="lazy" />}<span className="xp-views"><Icon name="play" size={13} />{formatCount(p.viewCount)}</span></span>
            <span className="xp-author">@{p.author?.username || 'creator'}</span>
          </button>)}</div>}
          {!searchMode && <><div ref={sentinel} className="sentinel" />{!items.length && !loading && <p className="ig-empty">Nothing to explore yet.</p>}</>}
          {searchMode && !query.trim() && <p className="rim-search-hint">Search for people, posts or hashtags</p>}
        </>}
      </>}
    </div>
  );
}
