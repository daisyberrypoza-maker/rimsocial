import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import { useAppStore } from '../store.js';
import { messageTime } from '../lib/notify.js';
import Activity from './Activity.jsx';

// Chat inbox laid out like the reference: header with account name, filters, rows with story rings.
// Activity lives on this same page: the bell (or More) switches to it.
const FILTERS = [['all', 'All'], ['primary', 'Primary'], ['general', 'General'], ['requests', 'Requests']];

export default function Messages() {
  const navigate = useNavigate();
  const location = useLocation();
  const me = useAppStore((st) => st.user);
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const [view, setView] = useState(location.state?.view === 'activity' ? 'activity' : 'messages');

  useEffect(() => {
    if (location.state?.view === 'activity') setView('activity');
  }, [location.state]);

  useEffect(() => {
    let alive = true;
    const load = () => api('/v1/messages/conversations')
      .then((data) => { if (alive) { setItems(data.items || []); setError(''); } })
      .catch((e) => { if (alive) setError(e.message || 'Could not load messages'); });
    load();
    const timer = setInterval(load, 4000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  if (view === 'activity') {
    return <main className="page activity-page-wrap"><Activity onBack={() => setView('messages')} /></main>;
  }

  const all = items || [];
  const shown = all.filter((item) => filter === 'all' || item.group === filter);
  const totalUnread = all.reduce((sum, item) => sum + (item.unread || 0), 0);

  return (
    <main className="dm-page">
      <header className="dm-head">
        <div className="dm-head-actions">
          <button type="button" className="dm-icon" onClick={() => navigate('/algorithm')} aria-label="Your algorithm">
            <Icon name="compass" size={24} />
          </button>
        </div>
        <button type="button" className="dm-account" onClick={() => navigate(me?.username ? `/u/${me.username}` : '/me')} aria-label="Your profile">
          <span>{me?.username || 'Chat'}</span>
          <Icon name="chevron-down" size={16} />
          {totalUnread > 0 && <span className="dm-account-dot" aria-label="Unread" />}
        </button>
        <div className="dm-head-actions">
          <button type="button" className="dm-icon" onClick={() => setView('activity')} aria-label="Activity">
            <Icon name="bell" size={24} />
          </button>
          <button type="button" className="dm-icon" onClick={() => navigate('/chat/new')} aria-label="New message">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
          </button>
        </div>
      </header>
      <div className="dm-filters" role="tablist" aria-label="Filter messages">
        {FILTERS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={filter === key} className={filter === key ? 'dm-chip on' : 'dm-chip'} onClick={() => setFilter(key)}>
            {label}{key === 'requests' && <Icon name="chevron-right" size={14} />}
          </button>
        ))}
      </div>
      {error && <p className="dm-error" role="alert">{error}</p>}
      {items === null ? <p className="dm-empty"></p>
        : shown.length ? (
          <ul className="dm-list">
            {shown.map((item) => {
              const mine = item.lastMessage.senderId === me?.id;
              const subtitle = item.isOnline ? 'Active now' : mine ? `Sent · ${messageTime(item.lastMessage.createdAt)}` : `${item.lastMessage.body} · ${messageTime(item.lastMessage.createdAt)}`;
              return (
                <li key={item.user.id}>
                  <Link to={`/chat/${item.user.id}`} className={item.unread ? 'dm-row unread' : 'dm-row'}>
                    <span className={item.hasStory ? 'dm-ring story' : 'dm-ring'}>
                      <span className="dm-ring-face"><Avatar user={item.user} size={56} /></span>
                      {item.isOnline && <span className="dm-online" aria-label="Online" />}
                    </span>
                    <span className="dm-text">
                      <strong>{item.user.displayName || item.user.username}</strong>
                      <small>{subtitle}</small>
                      {item.group === 'requests' && <em className="dm-tag">Request</em>}
                    </span>
                    {item.unread > 0 && <span className="dm-unread" aria-label="Unread" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : <p className="dm-empty">{filter === 'all' ? 'No messages yet. Tap the compose icon to start one.' : `No ${FILTERS.find(([k]) => k === filter)[1].toLowerCase()} messages.`}</p>}
    </main>
  );
}
