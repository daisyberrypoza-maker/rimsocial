import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { mediaUrl } from '../lib/config.js';
import Icon from '../components/Icon.jsx';
import { toast } from '../toast.js';
import { useAppStore } from '../store.js';

function Dots() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5" cy="12" r="2" fill="currentColor" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <circle cx="19" cy="12" r="2" fill="currentColor" />
    </svg>
  );
}

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

export default function Stories() {
  const navigate = useNavigate();
  const me = useAppStore((s) => s.user);
  const [rail, setRail] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeUser, setActiveUser] = useState(null);
  const [items, setItems] = useState([]);
  const [index, setIndex] = useState(0);
  const [storyLoading, setStoryLoading] = useState(false);

  const loadRail = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api('/v1/stories/rail');
      setRail(result.items || []);
    } catch (error) {
      toast(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRail(); }, [loadRail]);

  async function openStories(group) {
    if (!group?.user?.id) return;
    setActiveUser(group.user);
    setItems([]);
    setIndex(0);
    setStoryLoading(true);
    try {
      const result = await api('/v1/stories/users/' + encodeURIComponent(group.user.id));
      const stories = result.items || [];
      if (!stories.length) {
        toast('No active stories from this creator');
        setActiveUser(null);
        await loadRail();
        return;
      }
      setItems(stories);
      const firstUnseen = stories.findIndex((story) => !story.viewed);
      setIndex(firstUnseen < 0 ? 0 : firstUnseen);
      if (stories[firstUnseen < 0 ? 0 : firstUnseen]?.id) {
        api('/v1/stories/' + stories[firstUnseen < 0 ? 0 : firstUnseen].id + '/view', { method: 'POST' }).catch(() => {});
      }
    } catch (error) {
      toast(error.message);
      setActiveUser(null);
    } finally {
      setStoryLoading(false);
    }
  }

  function moveStory(direction) {
    const next = index + direction;
    if (next < 0) {
      setActiveUser(null);
      return;
    }
    if (next >= items.length) {
      setActiveUser(null);
      loadRail();
      return;
    }
    setIndex(next);
    const story = items[next];
    if (story?.id) api('/v1/stories/' + story.id + '/view', { method: 'POST' }).catch(() => {});
  }

  const current = items[index];
  const unseenCount = rail.filter((group) => group.unseen).length;

  return (
    <main className="page sc-stories">
      <header className="sc-top">
        <button className="sc-round sc-avatar-btn" aria-label="Your profile" onClick={() => me?.username && navigate('/u/' + me.username)}>
          <Avatar user={me || {}} />
        </button>
        <button className="sc-round" aria-label="Search" onClick={() => navigate('/explore')}><Icon name="search" size={21} /></button>
        <h1>Stories</h1>
        <button className="sc-round" aria-label="Notifications" onClick={() => navigate('/activity')}><Icon name="bell" size={21} /></button>
        <button className="sc-round" aria-label={unseenCount ? `Find friends, ${unseenCount} new stories` : 'Find friends'} onClick={() => navigate('/explore')}>
          <Icon name="user-plus" size={21} />
          {unseenCount > 0 && <span className="sc-badge">{unseenCount}</span>}
        </button>
        <button className="sc-round" aria-label="More" onClick={() => navigate('/explore')}><Dots /></button>
      </header>

      <section className="sc-block" aria-label="My stories">
        <h2 className="sc-h2">My Stories</h2>
        <div className="sc-ring-row">
          <button className="sc-story-item" onClick={() => navigate('/upload?story=1')}>
            <span className="sc-story-ring none">
              <span className="sc-avatar sc-own-avatar">
                {me?.avatarUrl ? <img src={mediaUrl(me.avatarUrl)} alt="" /> : <Icon name="camera" size={26} />}
              </span>
              <span className="sc-plus"><Icon name="plus" size={14} /></span>
            </span>
            <span className="sc-story-name">My Story</span>
          </button>
          <span className="sc-divider" aria-hidden="true" />
          {loading && <p className="sc-state">Loading stories…</p>}
          {!loading && rail.map((group) => (
            <button className="sc-story-item" key={group.user.id} onClick={() => openStories(group)}>
              <span className={`sc-story-ring ${group.unseen ? 'unseen' : 'seen'}`}><Avatar user={group.user} /></span>
              <span className="sc-story-name">{nameOf(group.user)}</span>
              {group.user.username && <span className="sc-story-sub">@{group.user.username}</span>}
            </button>
          ))}
        </div>
        {!loading && rail.length === 0 && (
          <div className="sc-empty">
            <strong>No stories yet</strong>
            <p>Share a photo or video and your friends can see it for 24 hours.</p>
            <button className="sc-pill" onClick={() => navigate('/upload?story=1')}>Create a story</button>
          </div>
        )}
      </section>

      {rail.length > 0 && (
        <section className="sc-block" aria-label="Discover">
          <h2 className="sc-h2">Discover <Icon name="chevron-right" size={20} /></h2>
          <div className="sc-card-row">
            {rail.map((group) => (
              <button className="sc-card" key={group.user.id} onClick={() => openStories(group)}>
                {group.user.avatarUrl
                  ? <img className="sc-card-img" src={mediaUrl(group.user.avatarUrl)} alt="" />
                  : <span className="sc-card-img sc-card-fallback">{nameOf(group.user).slice(0, 1).toUpperCase()}</span>}
                <span className="sc-card-shade" />
                <span className="sc-card-name">{nameOf(group.user)}</span>
              </button>
            ))}
          </div>
          <div className="sc-big-grid">
            {rail.map((group) => (
              <button className="sc-big" key={`big-${group.user.id}`} onClick={() => openStories(group)}>
                {group.user.avatarUrl
                  ? <img className="sc-card-img" src={mediaUrl(group.user.avatarUrl)} alt="" />
                  : <span className="sc-card-img sc-card-fallback">{nameOf(group.user).slice(0, 1).toUpperCase()}</span>}
                <span className="sc-card-shade" />
                <span className="sc-big-who"><Avatar user={group.user} /><span>{nameOf(group.user)}</span></span>
              </button>
            ))}
          </div>
        </section>
      )}

      {activeUser && (
        <div className="sc-viewer-backdrop" role="presentation" onClick={() => setActiveUser(null)}>
          <section className="sc-viewer" role="dialog" aria-modal="true" aria-label="Story viewer" onClick={(event) => event.stopPropagation()}>
            {storyLoading || !current ? <div className="sc-viewer-loading">Loading story…</div> : <>
              <div className="sc-progress">
                {items.map((story, i) => (
                  <span key={story.id} className={i < index ? 'done' : i === index ? 'active' : ''} />
                ))}
              </div>
              <header className="sc-viewer-head">
                <Avatar user={activeUser} />
                <div className="sc-viewer-who">
                  <strong>{nameOf(activeUser)}</strong>
                  <small>{current.createdAt ? new Date(current.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}</small>
                </div>
                <button className="sc-viewer-icon" aria-label="Notifications" onClick={() => navigate('/activity')}><Icon name="bell" size={20} /></button>
                <button className="sc-viewer-icon" aria-label="Close" onClick={() => setActiveUser(null)}><Icon name="x" size={22} /></button>
              </header>
              <div className="sc-media">
                {current.kind === 'video'
                  ? <video src={mediaUrl(current.mediaUrl)} controls autoPlay playsInline />
                  : <img src={mediaUrl(current.mediaUrl)} alt={current.caption || 'Story'} />}
                {current.caption && <p className="sc-caption">{current.caption}</p>}
                <button className="sc-hit sc-hit-prev" aria-label="Previous story" onClick={() => moveStory(-1)} />
                <button className="sc-hit sc-hit-next" aria-label="Next story" onClick={() => moveStory(1)} />
              </div>
              <footer className="sc-reply">
                <span className="sc-reply-field">Reply to {nameOf(activeUser)}…</span>
                <button className="sc-reply-icon" aria-label="Send a heart">
                  <Icon name="heart" size={22} />
                </button>
                <button className="sc-reply-icon" aria-label="Send">
                  <Icon name="send" size={22} />
                </button>
              </footer>
            </>}
          </section>
        </div>
      )}
    </main>
  );
}
