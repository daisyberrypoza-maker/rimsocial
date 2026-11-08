import { Component, useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { mediaUrl } from '../lib/config.js';
import Icon from '../components/Icon.jsx';
import { toast } from '../toast.js';
import { useAppStore } from '../store.js';
import StoryViewer from '../components/StoryViewer.jsx';
import { logError } from '../toast.js';

function nameOf(user) {
  return user?.displayName || user?.username || 'Creator';
}

function Avatar({ user, className = '' }) {
  return (
    <span className={`sc-avatar ${className}`}>
      {user?.avatarUrl
        ? <img src={mediaUrl(user.avatarUrl)} alt="" />
        : <span>{(nameOf(user)).slice(0, 1).toUpperCase()}</span>}
    </span>
  );
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

// The ring shows the latest story's picture; the profile picture only when there is no story
function StoryFace({ group, fallback }) {
  const preview = group?.preview;
  if (!preview?.mediaUrl) return fallback;
  if (preview.kind === 'video') {
    return preview.thumbUrl
      ? <img src={mediaUrl(preview.thumbUrl)} alt="" />
      : <video src={`${mediaUrl(preview.mediaUrl)}#t=0.1`} muted playsInline preload="metadata" />;
  }
  return <img src={mediaUrl(preview.mediaUrl)} alt="" />;
}

// While a story uploads, the picture being sent shows inside the ring, which spins
function PendingFace({ pending }) {
  return pending.mediaKind === 'video'
    ? <video src={pending.thumb} muted playsInline preload="metadata" />
    : <img src={pending.thumb} alt="" />;
}

const RAIL_FRESH_MS = 30 * 1000;
const DISCOVER_FRESH_MS = 10 * 60 * 1000;

export default function Stories() {
  const navigate = useNavigate();
  const me = useAppStore((s) => s.user);
  // Everything shows from saved data at once; the server is asked again only when that data is old
  const storedRail = useAppStore((s) => s.storyRail);
  const storedRailAt = useAppStore((s) => s.storyRailAt);
  const pending = useAppStore((s) => s.pendingUpload);
  const uploading = pending?.kind === 'story';
  const storedDiscover = useAppStore((s) => s.storyDiscover);
  const [rail, setRail] = useState(() => (Array.isArray(storedRail) ? storedRail : []));
  const [loaded, setLoaded] = useState(() => storedRailAt > 0);
  const loading = false;
  const [openAt, setOpenAt] = useState(null);
  const [suggested, setSuggested] = useState(() => storedDiscover?.suggested || []);
  const [ranking, setRanking] = useState(() => storedDiscover?.ranking || { friends: {}, discoverOrder: [] });

  // The saved rail changes when a story finishes uploading
  useEffect(() => { if (Array.isArray(storedRail)) setRail(storedRail); }, [storedRail]);

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
    try {
      const result = await api('/v1/stories/rail');
      const items = result.items || [];
      setRail(items);
      useAppStore.getState().setStoryRail(items);
    } catch (error) {
      logError(error);
    } finally {
      setLoaded(true);
    }
  }, []);

  // Reopening the page reuses the saved rail; it is requested again only when it is old
  useEffect(() => {
    if (Date.now() - (useAppStore.getState().storyRailAt || 0) < RAIL_FRESH_MS) { setLoaded(true); return; }
    loadRail();
  }, [loadRail]);

  // Every story opens in the shared StoryViewer, so photos, videos and controls behave the same everywhere.
  function openStories(group) {
    const i = rail.findIndex((item) => item.user?.id === group.user?.id);
    if (i >= 0) setOpenAt(i);
  }

  const myGroup = rail.find((group) => group.user?.id === me?.id);

  // A suggested person with stories opens the viewer; otherwise their profile opens
  function openSuggested(person) {
    const i = rail.findIndex((item) => item.user?.id === person.id);
    if (i >= 0) setOpenAt(i);
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
            <Avatar user={me || {}} />
          </button>
          <button className="st-round" aria-label="Search" onClick={() => navigate('/explore?search=1')}><Icon name="search" size={21} /></button>
        </div>
        <h1 className="st-title">Stories</h1>
        <div className="st-right">
          <button className="st-round" aria-label="Notifications" onClick={() => navigate('/activity')}><Icon name="bell" size={21} /></button>
          <button className="st-round" aria-label="Find friends" onClick={() => navigate('/friends')}><Icon name="user-plus" size={21} /></button>
          <button className="st-round" aria-label="More" onClick={() => navigate('/activity')}><Icon name="more-vertical" size={21} /></button>
        </div>
      </header>

      <section className="st-section" aria-label="Friends">
        <h2 className="st-h2 st-friends-heading">Friends <Icon name="chevron-right" size={22} /></h2>
        <div className="st-row">
          <button className="st-friend" aria-label={myGroup ? 'View my story' : 'Create a story'} onClick={() => (myGroup ? openStories(myGroup) : navigate('/upload?story=1'))}>
            <span className={`st-ring ${uploading ? 'uploading' : myGroup ? (myGroup.unseen ? 'unseen' : 'seen') : 'none'}`}>
              <span className="st-face">
                {uploading ? <PendingFace pending={pending} /> : myGroup ? <StoryFace group={myGroup} fallback={<Avatar user={me || {}} />} /> : me?.avatarUrl ? <img src={mediaUrl(me.avatarUrl)} alt="" /> : <Icon name="camera" size={26} />}
              </span>
              <span className="st-plus" role="button" aria-label="Add a story" onClick={(event) => { event.stopPropagation(); navigate('/upload?story=1'); }}><Icon name="plus" size={13} /></span>
            </span>
            <span className="st-name">My Story</span>
          </button>
          
          {!loading && orderedOthers.map((group) => (
            <button className="st-friend" key={group.user.id} aria-label={`View ${nameOf(group.user)}'s story`} onClick={() => openStories(group)}>
              <span className={`st-ring ${group.unseen ? 'unseen' : 'seen'}`}>
                <span className="st-face"><StoryFace group={group} fallback={<Avatar user={group.user} />} /></span>
                <span className="st-friend-badge" aria-hidden="true"><Icon name="user-plus" size={18} /></span>
              </span>
              <span className="st-name">{nameOf(group.user)}</span>
              {group.user.username && <span className="st-handle">{group.user.username}</span>}
            </button>
          ))}
        </div>
        {!loading && loaded && others.length === 0 && !myGroup && (
          <div className="st-empty">
            <strong>No stories yet</strong>
            <p>Share a photo or video and your friends can see it for 24 hours.</p>
            <button className="st-pill" onClick={() => navigate('/upload?story=1')}>Create a story</button>
          </div>
        )}
      </section>

      {discoverList.length > 0 && (
        <section className="st-section" aria-label="Discover">
          <h2 className="st-h2">Discover <Icon name="chevron-right" size={18} /></h2>
          <div className="st-cards">
            {discoverList.map((person) => (
              <button className="st-card" key={person.id} onClick={() => openSuggested(person)} aria-label={`Open ${nameOf(person)}`}>
                {person.avatarUrl
                  ? <img className="st-card-img" src={mediaUrl(person.avatarUrl)} alt="" />
                  : <span className="st-card-img st-card-fallback">{nameOf(person).slice(0, 1).toUpperCase()}</span>}
                <span className="st-card-shade" />
                <span className="st-card-name">{nameOf(person)}{person.isCreator && <span className="st-star" aria-label="Verified">★</span>}</span>
              </button>
            ))}
          </div>
          <div className="st-big-grid">
            {discoverList.map((person) => (
              <button className="st-big" key={`big-${person.id}`} onClick={() => openSuggested(person)} aria-label={`Open ${nameOf(person)}`}>
                {person.avatarUrl
                  ? <img className="st-card-img" src={mediaUrl(person.avatarUrl)} alt="" />
                  : <span className="st-card-img st-card-fallback">{nameOf(person).slice(0, 1).toUpperCase()}</span>}
                <span className="st-card-shade" />
                <span className="st-card-name">{nameOf(person)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {openAt !== null && (
        <ViewerBoundary onClose={() => { setOpenAt(null); loadRail(); }}>
          <StoryViewer
            groups={rail.filter((group) => group.user).map((group) => ({ user: group.user }))}
            startIndex={openAt}
            onClose={() => { setOpenAt(null); loadRail(); }}
          />
        </ViewerBoundary>
      )}
    </main>
  );
}
