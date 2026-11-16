import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { boxOf } from '../lib/viewerMotion.js';
import './UploadStatus.css';
import { usePullRefresh } from '../lib/pullRefresh.jsx';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { mediaUrl } from '../lib/config.js';
import Icon from '../components/Icon.jsx';
import { toast } from '../toast.js';
import { useAppStore } from '../store.js';
import StoryViewer from '../components/StoryViewer.jsx';
import { backgroundCss } from '../lib/storyBackgrounds.js';
import Avatar from '../components/Avatar.jsx';
import { logError } from '../toast.js';

function nameOf(user) {
  return user?.displayName || user?.username || 'Creator';
}

// Keeps a viewer crash from turning the whole screen white: shows a message and a close button instead.
class ViewerBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error('Story viewer failed', error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="sv-root sv-fallback" role="dialog" aria-label="Stories unavailable">
        <p>This story could not be opened.</p>
        <button type="button" className="sc-pill" onClick={this.props.onClose}>Close</button>
      </div>
    );
  }
}

const RAIL_FRESH_MS = 30 * 1000;
const DISCOVER_FRESH_MS = 10 * 60 * 1000;

// The newest story of a creator, shown as the thumbnail on their tile (video thumbnail when there is one)
function previewSrc(group) {
  const p = group?.preview;
  if (!p) return null;
  if (p.kind === 'video') return p.thumbUrl ? mediaUrl(p.thumbUrl) : null;
  return mediaUrl(p.mediaUrl);
}

// Tile thumbnail: the newest story (photo, video thumbnail, or a text story on its background). Falls back to the avatar.
function StoryFace({ group, user }) {
  const p = group?.preview;
  if (p?.kind === 'text') return <span className="st-text-face" style={{ background: backgroundCss(p.storyBackground, group?.preview?.id || user?.id) }}><span>{p.storyText || ''}</span></span>;
  const src = previewSrc(group);
  if (src) return <img src={src} alt="" />;
  return <Avatar user={user} noRing />;
}

// Discover tile spec: creator or brand names are capped at 25 characters
const capName = (text) => (text.length > 25 ? text.slice(0, 24).trimEnd() + '…' : text);
// Discover tile spec: the headline is the story caption, up to 55 characters
// Discover tile subtitle: when the story was posted ("Today", "Yesterday", or the date)
const postedLabel = (value) => {
  if (!value) return '';
  const date = new Date(value);
  const now = new Date();
  const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((dayStart(now) - dayStart(date)) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};
const capHeadline = (text) => (text.length > 55 ? text.slice(0, 54).trimEnd() + '…' : text);
const discoverStorySrc = (story) => story?.kind === 'video' ? (story.thumbUrl ? mediaUrl(story.thumbUrl) : null) : mediaUrl(story?.thumbUrl || story?.mediaUrl);

export default function Stories() {
  const navigate = useNavigate();
  const location = useLocation();
  const openUserId = location.state?.openUserId ? String(location.state.openUserId) : null;
  const openedFromChatRef = useRef(null);
  const me = useAppStore((s) => s.user);
  // Everything shows from saved data at once; the server is asked again only when that data is old
  const storedRail = useAppStore((s) => s.storyRail);
  const storedRailAt = useAppStore((s) => s.storyRailAt);
  const pending = useAppStore((s) => s.pendingUpload);
  const uploading = pending?.kind === 'story';
  const storedDiscover = useAppStore((s) => s.storyDiscover);
  const [rail, setRail] = useState(() => (Array.isArray(storedRail) ? storedRail : []));
  const [loaded, setLoaded] = useState(() => storedRailAt > 0);
  const loading = !loaded;
  const [railError, setRailError] = useState(false);
  // Reads "My Stories" until the row is scrolled to the friends, then "Friends"
  const [friendsActive, setFriendsActive] = useState(false);
  // Badge on the add-friend icon: people who followed you since you last opened it
  const [newFollows, setNewFollows] = useState(0);
  const feedItems = useAppStore((s) => s.feeds.discover?.items || []);
  // Sponsored posts for the Discover merge (ads come from the discover feed)
  const [adPool, setAdPool] = useState(() => feedItems.filter((p) => p.isSponsored));
  useEffect(() => {
    if (adPool.length) return undefined;
    let current = true;
    api('/v1/feed/discover')
      .then((d) => { if (current) setAdPool((d.items || []).filter((p) => p.isSponsored)); })
      .catch(() => {});
    return () => { current = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let seen = 0;
    try { seen = Number(localStorage.getItem('rimsocial-follow-seen-at') || 0); } catch { /* storage unavailable */ }
    api('/v1/activity')
      .then((d) => setNewFollows((d.items || []).filter((i) => i.type === 'follow' && new Date(i.createdAt).getTime() > seen).length))
      .catch(() => {});
  }, []);
  function openFriends() {
    try { localStorage.setItem('rimsocial-follow-seen-at', String(Date.now())); } catch { /* storage unavailable */ }
    setNewFollows(0);
    navigate('/friends');
  }
  const [openAt, setOpenAt] = useState(null);
  const [openOrigin, setOpenOrigin] = useState(null);   // tapped tile box: the viewer grows out of it
  const [popOrigin, setPopOrigin] = useState(null);
  const [suggested, setSuggested] = useState(() => storedDiscover?.suggested || []);
  const [ranking, setRanking] = useState(() => storedDiscover?.ranking || { friends: {}, discoverOrder: [] });

  // The saved rail changes when a story finishes uploading
  useEffect(() => { if (Array.isArray(storedRail)) setRail(storedRail); }, [storedRail]);

  // Discover: stories ranked for this viewer (unseen, followed and creators first)
  const [popular, setPopular] = useState([]);
  const [carousel, setCarousel] = useState([]);
  const [popOpen, setPopOpen] = useState(null);
  // Master feed merge: first ad after 3 organic stories, then every 6 (no bid data: ads rotate in order)
  const AD_START_OFFSET = 3;
  const AD_FREQUENCY_INTERVAL = 6;
  const discoverItems = useMemo(() => {
    const out = [];
    let adIndex = 0;
    popular.forEach((story, i) => {
      if (adPool.length && i >= AD_START_OFFSET && (i - AD_START_OFFSET) % AD_FREQUENCY_INTERVAL === 0) {
        out.push({ type: 'ad', ad: adPool[adIndex % adPool.length], key: `ad-${i}` });
        adIndex += 1;
      }
      out.push({ type: 'story', story, key: story.id });
    });
    return out;
  }, [popular, adPool]);
  useEffect(() => {
    let current = true;
    api('/v1/stories/popular?discover=1')
      .then((data) => {
        if (!current) return;
        setCarousel(data.carousel || []);   // followed creators with unseen stories (high affinity)
        setPopular(data.items || []);   // already ranked and diversified by the server for this viewer
      })
      .catch(logError);
    return () => { current = false; };
  }, []);

  // Discover and ordering: people you don't follow yet, ranked Snapchat-style by the server
  useEffect(() => {
    const saved = useAppStore.getState().storyDiscover;
    if (Date.now() - (saved?.updatedAt || 0) < DISCOVER_FRESH_MS) return undefined;
    let current = true;
    (async () => {
      try {
        const items = (await api('/v1/users/suggestions')).items || [];
        let ranked = saved?.ranking || { friends: {}, discoverOrder: [] };
        const ids = items.map((u) => u.id).slice(0, 60).join(',');
        if (ids) {
          try {
            const r = await api(`/v1/stories/ranking?discover=${encodeURIComponent(ids)}`);
            ranked = { friends: r.friends || {}, discoverOrder: r.discoverOrder || [] };
          } catch (error) { logError(error); }
        }
        if (!current) return;
        setSuggested(items);
        setRanking(ranked);
        useAppStore.getState().setStoryDiscover({ suggested: items, ranking: ranked, updatedAt: Date.now() });
      } catch (error) {
        logError(error);
      }
    })();
    return () => { current = false; };
  }, []);

  const loadRail = useCallback(async () => {
    setRailError(false);
    try {
      const result = await api('/v1/stories/rail');
      const items = Array.isArray(result.items) ? result.items : [];
      setRail(items);
      useAppStore.getState().setStoryRail(items);
    } catch (error) {
      setRailError(true);
      logError(error);
    } finally {
      setLoaded(true);
    }
  }, []);

  // Reopening the page reuses the saved rail; it is requested again only when it is old
  const { indicator } = usePullRefresh(() => loadRail());
  useEffect(() => {
    if (Date.now() - (useAppStore.getState().storyRailAt || 0) < RAIL_FRESH_MS) { setLoaded(true); return; }
    loadRail();
  }, [loadRail]);

  // Every story opens in the shared StoryViewer, so photos, videos and controls behave the same everywhere.
  function openStories(group, tile = null) {
    const i = rail.findIndex((item) => item.user?.id === group.user?.id);
    if (i >= 0) { setOpenOrigin(tile ? boxOf(tile) : null); setOpenAt(i); }
  }

  // Opened from a story message in a chat: open that person's story directly (once per visit)
  useEffect(() => {
    if (!openUserId || !loaded || openedFromChatRef.current === openUserId) return;
    const i = rail.findIndex((item) => String(item.user?.id) === openUserId);
    openedFromChatRef.current = openUserId;
    if (i >= 0) { setOpenOrigin(null); setOpenAt(i); }
  }, [openUserId, loaded, rail]);

  const myGroup = rail.find((group) => group.user?.id === me?.id);

  // A suggested person with stories opens the viewer; otherwise their profile opens
  function openSuggested(person) {
    const i = rail.findIndex((item) => item.user?.id === person.id);
    if (i >= 0) { setOpenOrigin(null); setOpenAt(i); }
    else navigate('/u/' + person.username);
  }
  const others = rail.filter((group) => group.user?.id !== me?.id);
  const orderedOthers = [...others].sort((a, b) => (ranking.friends[b.user.id] || 0) - (ranking.friends[a.user.id] || 0));
  const byId = new Map(suggested.map((u) => [u.id, u]));
  const discoverList = (ranking.discoverOrder.length
    ? ranking.discoverOrder.map((id) => byId.get(id)).filter(Boolean)
    : suggested).filter((u) => u.id !== me?.id);

  return (
    <main className="page st-page">
      <header className="st-top">
        <div className="st-left">
          <button className="st-round st-avatar" aria-label="Your profile" onClick={() => me?.username && navigate('/u/' + me.username)}>
            <Avatar user={me || {}} size={42} storyRing={myGroup ? 'mine' : null} />
          </button>
          <button className="st-round" aria-label="Search" onClick={() => navigate('/search')}><Icon name="search" size={21} /></button>
        </div>
        <h1 className="st-title">Stories</h1>
        <div className="st-right">
          <button className="st-round" aria-label="Notifications" onClick={() => navigate('/chat', { state: { view: 'activity' } })}><Icon name="bell" size={21} /></button>
          <button className="st-round st-badged" aria-label={newFollows ? `Find friends, ${newFollows} new` : 'Find friends'} onClick={openFriends}>
            <Icon name="user-plus" size={21} />
            {newFollows > 0 && <span className="st-count">{newFollows > 99 ? '99+' : newFollows}</span>}
          </button>
          <button className="st-round" aria-label="Following" onClick={() => navigate('/following-list')}><Icon name="users" size={21} /></button>
        </div>
      </header>
      {indicator}

      <section className="st-section" aria-label="Friends">
        <h2 className="st-h2 st-friends-heading">{friendsActive ? 'Friends' : 'My Stories'} <Icon name="chevron-right" size={22} /></h2>
        <div className="st-row" onScroll={(event) => setFriendsActive(event.currentTarget.scrollLeft > 60)}>
          <button className="st-friend" aria-label={uploading ? 'Posting your story' : myGroup ? 'View my story' : 'Create a story'} onClick={(event) => (myGroup ? openStories(myGroup, event.currentTarget) : navigate('/upload?story=1'))}>
            <span className={`st-ring ${myGroup ? 'mine' : 'none'}`}>
              <span className="st-face">
                <StoryFace group={myGroup} user={me || {}} />
                {uploading && <span className="up-status-spin" role="status" aria-label="Posting your story" />}
              </span>
              <span className="st-plus" role="button" aria-label="Add a story" onClick={(event) => { event.stopPropagation(); navigate('/upload?story=1'); }}><Icon name="plus" size={13} /></span>
            </span>
            <span className="st-name">{uploading ? 'Posting…' : 'My Story'}</span>
          </button>
          
          {!loading && orderedOthers.map((group) => (
            <button className="st-friend" key={group.user.id} aria-label={`View ${nameOf(group.user)}'s story`} onClick={(event) => openStories(group, event.currentTarget)}>
              <span className={`st-ring ${group.unseen ? 'unseen' : 'seen'}`}>
                <span className="st-face"><StoryFace group={group} user={group.user} /></span>
              </span>
              <span className="st-name">{nameOf(group.user)}</span>
              {group.user.username && <span className="st-handle">{group.user.username}</span>}
            </button>
          ))}
        </div>
        {!loading && loaded && railError && rail.length === 0 && (
          <div className="st-empty" role="alert">
            <strong>Stories couldn't load</strong>
            <p>Check your connection and try again.</p>
            <button type="button" className="sc-pill" onClick={loadRail}>Retry</button>
          </div>
        )}
        {!loading && loaded && !railError && others.length === 0 && !myGroup && (
          <div className="st-empty">
            <span className="st-empty-icon" aria-hidden="true"><Icon name="users" size={28} /></span>
            <strong>No stories yet</strong>
            <p>Share a photo or video and your friends can see it for 24 hours.</p>
          </div>
        )}
      </section>

      {discoverItems.length > 0 && (
        <section className="st-section st-discover" aria-label="Discover">
          <h2 className="st-h2">Discover <Icon name="chevron-right" size={18} /></h2>
          {carousel.length > 0 && (
            <div className="st-discover-carousel" role="list">
              {carousel.map((story) => (
                <button key={'c' + story.id} role="listitem" className="st-discover-card-h" style={{ '--dom': story.dominantColor || undefined }} onClick={(event) => { setPopOrigin(boxOf(event.currentTarget)); setPopOpen(story.author); }} aria-label={`Open ${story.author?.displayName || story.author?.username || 'story'}`}>
                  {story.kind === 'text' || !discoverStorySrc(story)
                    ? <span className="post-text-tile" style={{ background: backgroundCss(story.storyBackground, story.id) }}>{story.storyText}</span>
                    : <>
                      <img className="st-card-ambient" src={discoverStorySrc(story)} alt="" aria-hidden="true" />
                      <img className="st-card-img st-card-foreground" src={discoverStorySrc(story)} alt="" />
                    </>}
                  <span className="st-card-shade" />
                  <span className="st-card-foot">
                    <span className="st-card-avatar">{story.author?.avatarUrl ? <img src={mediaUrl(story.author.avatarUrl)} alt="" /> : nameOf(story.author || {}).slice(0, 1).toUpperCase()}</span>
                    <span className="st-card-name">{capName(nameOf(story.author || {}))}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="st-cards st-discover-grid">
            {discoverItems.map((item) => item.type === 'ad' ? (
              <a className="st-card st-card-ad st-discover-tile" key={item.key} href={item.ad.sponsorUrl} target="_blank" rel="noopener noreferrer sponsored" aria-label={`Sponsored: ${item.ad.sponsorName || 'advertisement'}`}>
                {item.ad.thumbUrl || item.ad.mediaUrl
                  ? <img className="st-card-img" src={mediaUrl(item.ad.thumbUrl || item.ad.mediaUrl)} alt="" />
                  : <span className="post-text-tile" style={{ background: backgroundCss(item.ad.storyBackground, item.ad.id || item.key) }}>{item.ad.caption || item.ad.storyText || item.ad.sponsorName}</span>}
                <span className="st-card-shade" />
                <span className="st-card-foot">
                  <span className="st-card-name">{capName(item.ad.sponsorName || 'Sponsored')}</span>
                  <span className="st-ad-label">Sponsored</span>
                </span>
              </a>
            ) : (() => { const story = item.story; return (
              <button className="st-card st-discover-tile" key={item.key} style={{ '--dom': story.dominantColor || undefined }} onClick={(event) => { setPopOrigin(boxOf(event.currentTarget)); setPopOpen(story.author); }} aria-label={`Open ${story.author?.displayName || story.author?.username || 'story'}`}>
                {story.kind === 'text' || !discoverStorySrc(story)
                  ? <span className="post-text-tile" style={{ background: backgroundCss(story.storyBackground) }}>{story.storyText}</span>
                  : <>
                    <img className="st-card-ambient" src={discoverStorySrc(story)} alt="" aria-hidden="true" />
                    <img className="st-card-img st-card-foreground" src={discoverStorySrc(story)} alt="" />
                  </>}
                <span className="st-card-shade" />
                {story.caption && <span className="st-discover-headline">{capHeadline(story.caption)}</span>}
                <span className="st-card-foot">
                  <span className="st-card-avatar">{story.author?.avatarUrl ? <img src={mediaUrl(story.author.avatarUrl)} alt="" /> : nameOf(story.author || {}).slice(0, 1).toUpperCase()}</span>
                  <span className="st-card-name">{capName(nameOf(story.author || {}))}{story.author?.isCreator && <span className="st-star" aria-label="Verified">★</span>}</span>
                  <span className="st-discover-sub">{postedLabel(story.createdAt)}</span>
                </span>
              </button>
            ); })())}
          </div>
        </section>
      )}

      {popOpen && (
        <ViewerBoundary onClose={() => setPopOpen(null)}>
          <StoryViewer groups={[{ user: popOpen }]} startIndex={0} origin={popOrigin} onClose={() => setPopOpen(null)} />
        </ViewerBoundary>
      )}

      {openAt !== null && (
        <ViewerBoundary onClose={() => { setOpenAt(null); loadRail(); }}>
          <StoryViewer
            groups={rail.filter((group) => group.user).map((group) => ({ user: group.user }))}
            startIndex={openAt}
            origin={openOrigin}
            onClose={() => { setOpenAt(null); loadRail(); }}
          />
        </ViewerBoundary>
      )}
    </main>
  );
}
