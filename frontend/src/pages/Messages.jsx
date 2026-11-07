import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import { useAppStore } from '../store.js';
import { messageTime } from '../lib/notify.js';

// Chat list: people you have messages with, newest first. Refreshes every few seconds.
export default function Messages() {
  const navigate = useNavigate();
  const me = useAppStore((st) => st.user);
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    const load = () => api('/v1/messages/conversations')
      .then((data) => { if (alive) { setItems(data.items || []); setError(''); } })
      .catch((e) => { if (alive) setError(e.message || 'Could not load messages'); });
    load();
    const timer = setInterval(load, 4000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  const shown = (items || []).filter((item) => filter === 'all' || item.unread > 0);

  return (
    <main className="dm-page">
      <header className="dm-head">
        <h1>Chat</h1>
        <div className="dm-head-actions">
          <button type="button" className="dm-icon" onClick={() => navigate('/activity')} aria-label="Activity">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></svg>
          </button>
          <button type="button" className="dm-icon" onClick={() => navigate('/chat/new')} aria-label="New message">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
          </button>
        </div>
      </header>
      <div className="dm-filters">
        <button type="button" className={filter === 'all' ? 'dm-chip on' : 'dm-chip'} onClick={() => setFilter('all')}>All</button>
        <button type="button" className={filter === 'unread' ? 'dm-chip on' : 'dm-chip'} onClick={() => setFilter('unread')}>Unread</button>
      </div>
      {error && <p className="dm-error" role="alert">{error}</p>}
      {items === null ? <p className="dm-empty">Loading…</p>
        : shown.length ? (
          <ul className="dm-list">
            {shown.map((item) => {
              const mine = item.lastMessage.senderId === me?.id;
              return (
                <li key={item.user.id}>
                  <Link to={`/chat/${item.user.id}`} className={item.unread ? 'dm-row unread' : 'dm-row'}>
                    <Avatar user={item.user} size={56} />
                    <span className="dm-text">
                      <strong>{item.user.displayName || item.user.username}</strong>
                      <small>{mine ? 'Sent: ' : ''}{item.lastMessage.body} · {messageTime(item.lastMessage.createdAt)}</small>
                    </span>
                    {item.unread > 0 && <span className="dm-unread" aria-label={`${item.unread} unread`}>{item.unread}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : <p className="dm-empty">{filter === 'unread' ? 'No unread messages.' : 'No messages yet. Tap the compose icon to start one.'}</p>}
    </main>
  );
}
