import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import { mediaUrl } from '../lib/config.js';
import { logError } from '../toast.js';
import { useSwipeTabs } from '../lib/useSwipeTabs.js';

// Search, Instagram-style: the grid of posts first; typing shows For you / Accounts / Tags.
// A tag opens its own page (/search/tag/:tag) with the posts that use it.
const TABS = [['foryou', 'For you'], ['accounts', 'Accounts'], ['audio', 'Audio'], ['tags', 'Tags']];

function tagsFrom(posts, term) {
  const needle = term.replace(/^#/, '').toLowerCase();
  const counts = new Map();
  for (const post of posts) {
    for (const tag of new Set(String(post.caption || '').match(/#[\p{L}\p{N}_]+/gu) || [])) {
      const name = tag.slice(1).toLowerCase();
      if (!needle || name.includes(needle)) counts.set(name, (counts.get(name) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count }));
}

export default function Search() {
  const navigate = useNavigate();
  const { tag: routeTag } = useParams();
  const tagPage = routeTag ? decodeURIComponent(routeTag).replace(/^#/, '') : '';
  const [query, setQuery] = useState(tagPage ? `#${tagPage}` : '');
  const [tab, setTab] = useState('foryou');
  const [search, setSearch] = useState(null);
  const [explore, setExplore] = useState([]);
  const [busy, setBusy] = useState({});
  const [tracks, setTracks] = useState([]);
  const [playingTrackId, setPlayingTrackId] = useState(null);
  const audioRef = useRef(null);
  const showTabs = !tagPage && Boolean(term);
  const swipeSurfaceRef = useSwipeTabs(tab, TABS.map(([key]) => key), setTab, showTabs);
  const term = query.trim();

  useEffect(() => {
    if (tagPage) return;
    api('/v1/feed/explore').then((data) => setExplore(data.items || [])).catch(logError);
  }, [tagPage]);

  useEffect(() => {
    if (!term) { setSearch(null); return undefined; }
    let alive = true;
    const timer = setTimeout(() => {
      api(`/v1/search?q=${encodeURIComponent(term)}&type=${tagPage ? 'hashtags' : 'all'}`)
        .then((r) => { if (alive) setSearch(r); })
        .catch(logError);
    }, 300);
    return () => { alive = false; clearTimeout(timer); };
  }, [term, tagPage]);

  // Music library: newest tracks, or the ones matching the search
  useEffect(() => {
    if (tagPage) return undefined;
    let alive = true;
    const timer = setTimeout(() => {
      api(`/v1/audio/search?q=${encodeURIComponent(term)}`)
        .then((data) => { if (alive) setTracks(data.items || []); })
        .catch(logError);
    }, term ? 300 : 0);
    return () => { alive = false; clearTimeout(timer); };
  }, [term, tagPage]);

  const posts = term ? (search?.posts || []) : explore;
  const people = search?.people || [];
  const tags = useMemo(() => tagsFrom(search?.posts || [], term), [search, term]);
  const activeTab = tagPage ? 'foryou' : tab;

  async function toggleFollow(person) {
    if (busy[person.id]) return;
    setBusy((b) => ({ ...b, [person.id]: true }));
    try {
      const r = await api(`/v1/users/${person.id}/follow`, { method: person.isFollowing ? 'DELETE' : 'POST' });
      setSearch((s) => s && ({ ...s, people: s.people.map((p) => (p.id === person.id ? { ...p, isFollowing: r.isFollowing, followerCount: r.followerCount } : p)) }));
    } catch (e) { logError(e); }
    finally { setBusy((b) => ({ ...b, [person.id]: false })); }
  }

  return (
    <main ref={swipeSurfaceRef} data-local-tab-swipe className="sr-page">
      <div className="sr-bar">
        {tagPage && <button type="button" className="sr-back" onClick={() => navigate(-1)} aria-label="Back"><Icon name="arrow-left" size={24} /></button>}
        <label className="sr-field">
          <Icon name="search" size={20} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" readOnly={Boolean(tagPage)} autoCapitalize="none" autoComplete="off" />
          {!!query && !tagPage && <button type="button" className="sr-clear" onClick={() => { setQuery(''); setTab('foryou'); }} aria-label="Clear search"><Icon name="x" size={18} /></button>}
        </label>
      </div>

      {showTabs && (
        <div className="sr-tabs" role="tablist" aria-label="Search results">
          {TABS.map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={activeTab === key} className={activeTab === key ? 'sr-tab on' : 'sr-tab'} onClick={() => setTab(key)}>{label}</button>
          ))}
        </div>
      )}

      {activeTab === 'accounts' && (
        people.length ? (
          <ul className="sr-list">
            {people.map((person) => (
              <li key={person.id} className="sr-person">
                <button type="button" className="sr-person-main" onClick={() => navigate(`/u/${encodeURIComponent(person.username)}`)}>
                  <Avatar user={person} size={52} />
                  <span className="sr-person-text">
                    <strong>{person.username}</strong>
                    <small>{person.displayName}</small>
                  </span>
                </button>
                <button type="button" className={person.isFollowing ? 'sr-follow on' : 'sr-follow'} onClick={() => toggleFollow(person)} disabled={!!busy[person.id]}>
                  {person.isFollowing ? 'Following' : 'Follow'}
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="sr-empty">{term ? 'No accounts found.' : 'Search to find accounts.'}</p>
      )}

      {activeTab === 'audio' && (
        <section className="sr-audio">
          {tracks.length ? (
            <ul className="sr-list">
              {tracks.map((track) => (
                <li key={track.id} className="sr-track">
                  <span className="sr-music" aria-hidden="true">♪</span>
                  <span className="sr-person-text"><strong>{track.title}</strong><small>{track.artist}</small></span>
                  <button type="button" className={playingTrackId === track.id ? 'sr-play playing' : 'sr-play'} aria-label={playingTrackId === track.id ? 'Pause track' : 'Play track'} onClick={() => {
                    const player = audioRef.current;
                    if (!player) return;
                    if (playingTrackId === track.id && !player.paused) { player.pause(); setPlayingTrackId(null); return; }
                    player.src = mediaUrl(track.mediaUrl);
                    player.play().then(() => setPlayingTrackId(track.id)).catch(logError);
                  }}>{playingTrackId === track.id ? 'Ⅱ' : '▶'}</button>
                </li>
              ))}
            </ul>
          ) : <p className="sr-empty">{term ? 'No audio found.' : 'No audio available yet.'}</p>}
          <audio ref={audioRef} preload="none" onEnded={() => setPlayingTrackId(null)} onPause={() => setPlayingTrackId(null)} hidden />
        </section>
      )}

      {activeTab === 'tags' && (
        tags.length ? (
          <ul className="sr-list">
            {tags.map((item) => (
              <li key={item.tag}>
                <button type="button" className="sr-person-main sr-tag" onClick={() => navigate(`/search/tag/${encodeURIComponent(item.tag)}`)}>
                  <span className="sr-hash">#</span>
                  <span className="sr-person-text">
                    <strong>#{item.tag}</strong>
                    <small>{item.count} {item.count === 1 ? 'post' : 'posts'}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="sr-empty">{term ? 'No tags found.' : 'Search to find tags.'}</p>
      )}

      {activeTab === 'foryou' && (
        posts.length ? (
          <div className="sr-grid">
            {posts.map((post) => (
              <button key={post.id} type="button" className="sr-cell" onClick={() => navigate(`/p/${post.id}`)} aria-label="Open post">
                {post.kind === 'video'
                  ? <video src={mediaUrl(post.mediaUrl)} poster={post.thumbUrl ? mediaUrl(post.thumbUrl) : undefined} muted playsInline preload="metadata" />
                  : <img src={mediaUrl(post.thumbUrl || post.mediaUrl)} alt="" loading="lazy" />}
              </button>
            ))}
          </div>
        ) : <p className="sr-empty">{term ? 'No posts found.' : 'Nothing to explore yet.'}</p>
      )}
    </main>
  );
}
