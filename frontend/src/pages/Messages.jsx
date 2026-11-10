import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import { useAppStore } from '../store.js';
import { messageTime } from '../lib/notify.js';
import Activity from './Activity.jsx';
import { usePullRefresh } from '../lib/pullRefresh.jsx';
import '../snap-screens.css';

// Chat inbox laid out to match the reference: profile, search, title, notifications, add friends (with the
// count of people who follow you), more; chips My AI / Games / Stories / Near Me / New; rows with a status line
// and a camera on the right; yellow compose button floating bottom right. The bell opens Notifications.

function StatusLine({ item, mine }) {
  if (item.isOnline) return <span className="sn-txt">Active now</span>;
  if (mine) {
    return (
      <>
        <svg className="sn-sent" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2 21 23 12 2 3v7l15 2-15 2z" /></svg>
        <span className="sn-txt">Delivered · {messageTime(item.lastMessage.createdAt)}</span>
      </>
    );
  }
  const kind = item.lastMessage.mediaKind;
  const attachment = { photo: 'Photo', video: 'Video', audio: 'Audio', file: 'File' }[kind] || '';
  const preview = item.lastMessage.body || attachment;
  return <span className="sn-txt">{preview} · {messageTime(item.lastMessage.createdAt)}</span>;
}

export default function Messages() {
  const navigate = useNavigate();
  const location = useLocation();
  const me = useAppStore((st) => st.user);
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const [newFriends, setNewFriends] = useState(0);
  const [view, setView] = useState(location.state?.view === 'activity' ? 'activity' : 'messages');
  const { indicator } = usePullRefresh(async () => { const data = await api('/v1/messages/conversations'); setItems(data.items || []); });

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

  // Badge on Add friends: people who follow you and you have not followed back yet
  useEffect(() => {
    let alive = true;
    api('/v1/users/suggestions')
      .then((data) => { if (alive) setNewFriends((data.followBack || []).length); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (view === 'activity') {
    return <Activity onBack={() => setView('messages')} />;
  }

  const all = items || [];
  const storyCount = all.filter((item) => item.hasStory).length;
  const shown = all.filter((item) => {
    if (filter === 'all') return true;
    if (filter === 'stories') return item.hasStory;
    return true;
  });

  return (
    <main className="sn-page">
      <header className="sn-head">
        <div className="sn-head-left">
          <button type="button" className="sn-circle sn-avatar-btn" onClick={() => navigate(me?.username ? `/u/${me.username}` : '/')} aria-label="Profile">
            <Avatar user={me} size={40} />
          </button>
          <button type="button" className="sn-circle" onClick={() => navigate('/search')} aria-label="Search">
            <Icon name="search" size={20} strokeWidth={2.2} />
          </button>
        </div>
        <h1 className="sn-title">Chat</h1>
        <div className="sn-head-right">
          <button type="button" className="sn-circle" onClick={() => setView('activity')} aria-label="Notifications">
            <Icon name="bell" size={22} strokeWidth={2} />
          </button>
          <button type="button" className="sn-circle sn-yellow" onClick={() => navigate('/friends')} aria-label={newFriends ? `Add friends, ${newFriends} new` : 'Add friends'}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="4" /><path d="M2 21c0-3.5 3-6 7-6s7 2.5 7 6" /><path d="M19 8v6M16 11h6" /></svg>
            {newFriends > 0 && <span className="sn-badge">{newFriends > 99 ? '99+' : newFriends}</span>}
          </button>
          <button type="button" className="sn-circle" onClick={() => setView('activity')} aria-label="More">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
          </button>
        </div>
      </header>
      {indicator}
      <nav className="sn-filters" aria-label="Filter chats">
        <button type="button" className="sn-chip">My AI</button>
        <button type="button" className="sn-chip">Games</button>
        <button type="button" className="sn-chip" aria-pressed={filter === 'stories'} onClick={() => setFilter(filter === 'stories' ? 'all' : 'stories')}>
          Stories{storyCount > 0 && <span className="sn-count">{storyCount}</span>}
        </button>
        <button type="button" className="sn-chip">Near Me</button>
        <button type="button" className="sn-chip">New<span className="sn-plus"><Icon name="plus" size={12} strokeWidth={2.6} /></span></button>
      </nav>
      {error && <p className="sn-empty" role="alert">{error}</p>}
      {items === null ? null
        : shown.length ? (
          <ul className="sn-list">
            {shown.map((item) => {
              const mine = item.lastMessage.senderId === me?.id;
              const name = item.user.displayName || item.user.username;
              return (
                <li key={item.user.id} className={item.unread ? 'sn-item unread' : 'sn-item'}>
                  <Link to={`/chat/${item.user.id}`} className="sn-row">
                    <span className={item.hasStory ? 'sn-ring has-story' : 'sn-ring'}>
                      <Avatar user={item.user} size={44} />
                      {item.isOnline && <span className="sn-online" aria-label="Online" />}
                    </span>
                    <span className="sn-text">
                      <span className="sn-name">{name}</span>
                      <span className="sn-sub"><StatusLine item={item} mine={mine} /></span>
                    </span>
                  </Link>
                  <Link to={`/chat/${item.user.id}`} className="sn-cam" aria-label={`Message ${name}`}>
                    <Icon name="camera" size={24} strokeWidth={2} />
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : <p className="sn-empty">{filter === 'all' ? 'No messages yet. Tap the yellow button to start one.' : 'Nothing in this view yet.'}</p>}
      <button type="button" className="sn-fab" onClick={() => navigate('/chat/new')} aria-label="New message">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
      </button>
    </main>
  );
}
