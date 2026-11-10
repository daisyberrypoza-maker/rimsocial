import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import { messageTime } from '../lib/notify.js';
import { logError } from '../toast.js';

// Owner only: who watched and who liked this story. Tap a person for their profile, or the chat button to message them.
export default function StoryViewersSheet({ storyId, onClose }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api(`/v1/stories/${storyId}/viewers`)
      .then((result) => { if (alive) setData(result); })
      .catch((e) => { if (alive) setError(e.message || 'Could not load viewers'); logError(e); });
    return () => { alive = false; };
  }, [storyId]);

  const open = (username) => { onClose(); navigate(`/u/${encodeURIComponent(username)}`); };
  const chat = (id) => { onClose(); navigate(`/chat/${id}`); };

  function Row({ user, at, liked }) {
    const name = user.displayName || user.username;
    return (
      <div className="sv-viewers-row">
        <button type="button" className="sv-viewers-person" onClick={() => open(user.username)} aria-label={`Open ${name}'s profile`}>
          <Avatar user={user} size={44} />
          <span className="sv-viewers-text">
            <span className="sv-viewers-name">{name}</span>
            <span className="sv-viewers-sub">@{user.username} · {messageTime(at)}</span>
          </span>
        </button>
        {liked && <span className="sv-viewers-heart" aria-label="Liked"><Icon name="heart" size={18} /></span>}
        <button type="button" className="sv-viewers-chat" onClick={() => chat(user.id)} aria-label={`Message ${name}`}>
          <Icon name="message-circle" size={20} />
        </button>
      </div>
    );
  }

  const viewers = data?.viewers || [];
  const likers = data?.likers || [];

  return (
    <div className="sv-viewers-backdrop" onClick={onClose}>
      <section className="sv-viewers" role="dialog" aria-modal="true" aria-label="Story viewers" onClick={(e) => e.stopPropagation()}>
        <span className="sv-viewers-grip" aria-hidden="true" />
        <header className="sv-viewers-head">
          <span>{viewers.length} {viewers.length === 1 ? 'view' : 'views'} · {likers.length} {likers.length === 1 ? 'like' : 'likes'}</span>
          <button type="button" className="sv-viewers-close" onClick={onClose} aria-label="Close">
            <Icon name="x" size={20} />
          </button>
        </header>
        <div className="sv-viewers-body">
          {error && <p className="sv-viewers-empty" role="alert">{error}</p>}
          {!data && !error && <p className="sv-viewers-empty">Loading…</p>}
          {data && !viewers.length && !likers.length && <p className="sv-viewers-empty">No one has watched or liked this story yet.</p>}
          {likers.length > 0 && <div className="sv-viewers-section">Likes</div>}
          {likers.map((row) => <Row key={`like-${row.user.id}`} user={row.user} at={row.likedAt} liked />)}
          {viewers.length > 0 && <div className="sv-viewers-section">Viewers</div>}
          {viewers.map((row) => <Row key={`view-${row.user.id}`} user={row.user} at={row.viewedAt} liked={row.liked} />)}
        </div>
      </section>
    </div>
  );
}
