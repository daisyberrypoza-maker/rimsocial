import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { mediaUrl } from '../lib/config.js';
import Icon from '../components/Icon.jsx';
import { toast } from '../toast.js';

export default function Stories() {
  const navigate = useNavigate();
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

  return (
    <main className="page stories-page">
      <header className="stories-heading">
        <div><h1>Stories</h1><p>Little moments from your community, gone in 24 hours.</p></div>
        <button className="stories-add" onClick={() => navigate('/upload?story=1')}><Icon name="plus" size={19} /> Add story</button>
      </header>

      <section className="stories-rail-section" aria-label="People's stories">
        <button className="story-bubble add-story-bubble" onClick={() => navigate('/upload?story=1')}>
          <span className="story-avatar own-story-avatar"><Icon name="camera" size={26} /></span>
          <span>Your story</span>
        </button>
        {loading && <p className="muted stories-state">Loading stories…</p>}
        {!loading && rail.length === 0 && <div className="stories-empty"><span className="stories-empty-icon"><Icon name="camera" size={28} /></span><strong>No stories yet</strong><p>Share a photo or video and let your friends see it for 24 hours.</p><button className="primary" onClick={() => navigate('/upload?story=1')}>Create your first story</button></div>}
        {rail.map((group) => (
          <button className="story-bubble" key={group.user.id} onClick={() => openStories(group)}>
            <span className={`story-avatar ${group.unseen ? 'unseen' : 'seen'}`}>
              {group.user.avatarUrl ? <img src={mediaUrl(group.user.avatarUrl)} alt="" /> : <span>{(group.user.displayName || group.user.username || '?').slice(0, 1).toUpperCase()}</span>}
            </span>
            <span className="story-bubble-name">{group.user.displayName || group.user.username || 'Creator'}</span>
          </button>
        ))}
      </section>

      {activeUser && (
        <div className="story-viewer-backdrop" role="presentation" onClick={() => setActiveUser(null)}>
          <section className="story-viewer" role="dialog" aria-modal="true" aria-label="Story viewer" onClick={(event) => event.stopPropagation()}>
            <button className="story-viewer-close" aria-label="Close stories" onClick={() => setActiveUser(null)}><Icon name="x" size={24} /></button>
            {storyLoading || !current ? <div className="story-viewer-loading">Loading story…</div> : <>
              <div className="story-progress">{items.map((story, i) => <span key={story.id} className={i <= index ? 'done' : ''} />)}</div>
              <div className="story-viewer-author">
                {activeUser.avatarUrl ? <img src={mediaUrl(activeUser.avatarUrl)} alt="" /> : <span className="story-author-initial">{(activeUser.displayName || activeUser.username || '?').slice(0, 1).toUpperCase()}</span>}
                <strong>{activeUser.displayName || activeUser.username}</strong>
                <small>{current.createdAt ? new Date(current.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}</small>
              </div>
              <div className="story-media">
                {current.kind === 'video' ? <video src={mediaUrl(current.mediaUrl)} controls autoPlay playsInline /> : <img src={mediaUrl(current.mediaUrl)} alt={current.caption || 'Story'} />}
                {current.caption && <p className="story-caption">{current.caption}</p>}
                <button className="story-hit story-hit-prev" aria-label="Previous story" onClick={() => moveStory(-1)} />
                <button className="story-hit story-hit-next" aria-label="Next story" onClick={() => moveStory(1)} />
              </div>
              <div className="story-viewer-footer"><span>{index + 1} of {items.length}</span><button onClick={() => moveStory(1)}>Next <Icon name="arrow-right" size={17} /></button></div>
            </>}
          </section>
        </div>
      )}
    </main>
  );
}
