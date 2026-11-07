import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { mediaUrl } from '../lib/config.js';
import Icon from '../components/Icon.jsx';
import { toast } from '../toast.js';
import { useAppStore } from '../store.js';
import StoryViewer from '../components/StoryViewer.jsx';

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
  const [openAt, setOpenAt] = useState(null);

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

  // Every story opens in the shared StoryViewer, so photos, videos and controls behave the same everywhere.
  function openStories(group) {
    const i = rail.findIndex((item) => item.user?.id === group.user?.id);
    if (i >= 0) setOpenAt(i);
  }

  const myGroup = rail.find((group) => group.user?.id === me?.id);
  const others = rail.filter((group) => group.user?.id !== me?.id);

  return (
    <main className="page sc-stories">
      <header className="sc-top">
        <button className="sc-round sc-avatar-btn" aria-label="Your profile" onClick={() => me?.username && navigate('/u/' + me.username)}>
          <Avatar user={me || {}} />
        </button>
        <span className="sc-top-spacer" />
        <button className="sc-round" aria-label="Notifications" onClick={() => navigate('/activity')}>
          <Icon name="bell" size={21} />
        </button>
      </header>

      <section className="sc-block" aria-label="My stories">
        <h2 className="sc-h2">My Stories</h2>
        <div className="sc-ring-row">
          <button className="sc-story-item" aria-label={myGroup ? 'View my story' : 'Create a story'} onClick={() => (myGroup ? openStories(myGroup) : navigate('/upload?story=1'))}>
            <span className={`sc-story-ring ${myGroup ? (myGroup.unseen ? 'unseen' : 'seen') : 'none'}`}>
              <span className="sc-avatar sc-own-avatar">
                {myGroup ? <Avatar user={me || {}} /> : me?.avatarUrl ? <img src={mediaUrl(me.avatarUrl)} alt="" /> : <Icon name="camera" size={26} />}
              </span>
              <span className="sc-plus" role="button" aria-label="Add a story" onClick={(event) => { event.stopPropagation(); navigate('/upload?story=1'); }}><Icon name="plus" size={14} /></span>
            </span>
            <span className="sc-story-name">My Story</span>
          </button>
          <span className="sc-divider" aria-hidden="true" />
          {loading && <p className="sc-state">Loading stories…</p>}
          {!loading && others.map((group) => (
            <button className="sc-story-item" key={group.user.id} onClick={() => openStories(group)}>
              <span className={`sc-story-ring ${group.unseen ? 'unseen' : 'seen'}`}><Avatar user={group.user} /></span>
              <span className="sc-story-name">{nameOf(group.user)}</span>
              {group.user.username && <span className="sc-story-sub">@{group.user.username}</span>}
            </button>
          ))}
        </div>
        {!loading && others.length === 0 && !myGroup && (
          <div className="sc-empty">
            <strong>No stories yet</strong>
            <p>Share a photo or video and your friends can see it for 24 hours.</p>
            <button className="sc-pill" onClick={() => navigate('/upload?story=1')}>Create a story</button>
          </div>
        )}
      </section>

      {others.length > 0 && (
        <section className="sc-block" aria-label="Discover">
          <h2 className="sc-h2">Discover <Icon name="chevron-right" size={20} /></h2>
          <div className="sc-card-row">
            {others.map((group) => (
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
            {others.map((group) => (
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

      {openAt !== null && (
        <StoryViewer
          groups={rail.map((group) => ({ user: group.user }))}
          startIndex={openAt}
          onClose={() => { setOpenAt(null); loadRail(); }}
        />
      )}
    </main>
  );
}
