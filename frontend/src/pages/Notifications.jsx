import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { toast } from '../toast.js';
import Avatar from '../components/Avatar.jsx';

export default function Notifications() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const data = await api('/v1/notifications');
      setItems(data.items || []);
    } catch (e) {
      toast(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  return (
    <main className="page notifications-page">
      <header className="notifications-heading">
        <h1>Notifications</h1>
        <button className="ghost small" onClick={refresh} disabled={loading} aria-label="Refresh notifications">↻</button>
      </header>
      <p className="muted notifications-subtitle">Updates from creators you follow and have turned notifications on for.</p>
      {loading ? <p className="muted center">Loading notifications…</p> : items.length ? (
        <div className="notification-list">
          {items.map((item) => (
            <button className="notification-item" key={item.id} onClick={() => item.kind === 'post' ? navigate(`/p/${item.postId}`) : navigate(`/u/${item.username}`)}>
              <Avatar user={{ id: item.creatorId, username: item.username, displayName: item.displayName, avatarUrl: item.avatarUrl }} size={48} />
              <span className="notification-copy">
                <span><strong>{item.displayName || item.username}</strong> {item.kind === 'story' ? 'added a new story' : 'published a new post'}</span>
                <small>{new Date(item.createdAt).toLocaleString()}</small>
              </span>
              <span className="notification-chevron" aria-hidden="true">›</span>
            </button>
          ))}
        </div>
      ) : <div className="notifications-empty"><span aria-hidden="true">♧</span><h2>You're all caught up</h2><p>When creators you follow publish posts or stories, their updates will appear here if you enable notifications on their profile.</p></div>}
    </main>
  );
}
