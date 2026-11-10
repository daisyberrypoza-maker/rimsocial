import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import { useAppStore } from '../store.js';
import Activity from './Activity.jsx';
import { usePullRefresh } from '../lib/pullRefresh.jsx';
import { toast, logError } from '../toast.js';
import '../snap-screens.css';

// Chat inbox laid out to match the reference: profile, search, title, notifications, add friends (with the
// count of people who follow you), more; chips My AI / Games / Stories / Near Me / New; rows with the last
// message, time ago and ticks; the camera opens the phone camera to send a snap; yellow compose button bottom right.

const MEDIA_LABEL = { photo: 'Photo', video: 'Video', audio: 'Audio', file: 'File' };

// Compact time since a message: now, 5m, 3h, 2d
function timeAgo(iso) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(minutes) || minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function previewOf(last) {
  if (last.deleted) return 'This message was deleted';
  return last.body || MEDIA_LABEL[last.mediaKind] || '';
}

// One grey tick when sent, two blue ticks once the other person has seen it
function Ticks({ last }) {
  const seen = Boolean(last.readAt);
  return <span className={seen ? 'sn-ticks seen' : 'sn-ticks'} aria-label={seen ? 'Seen' : 'Sent'}>{seen ? '✓✓' : '✓'}</span>;
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
  const snapInput = useRef(null);
  const snapTo = useRef(null);
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

  // The camera opens the phone camera; the photo or video is sent straight to that person
  function openCamera(userId) {
    snapTo.current = userId;
    snapInput.current?.click();
  }

  async function onSnapPicked(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    const userId = snapTo.current;
    if (!file || !userId) return;
    try {
      const form = new FormData();
      form.append('media', file);
      await api(`/v1/messages/with/${userId}/media`, { method: 'POST', body: form });
      toast('Sent');
    } catch (e) {
      toast(e.message || 'Could not send');
      logError(e);
    }
  }

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
        <button type="button" className="sn-chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Messages</button>
        <button type="button" className="sn-chip" aria-pressed={filter === 'stories'} onClick={() => setFilter(filter === 'stories' ? 'all' : 'stories')}>
          Stories{storyCount > 0 && <span className="sn-count">{storyCount}</span>}
        </button>
        <button type="button" className="sn-chip" onClick={() => navigate('/chat/new')} aria-label="New message">New<span className="sn-plus"><Icon name="plus" size={12} strokeWidth={2.6} /></span></button>
      </nav>
      {error && <p className="sn-empty" role="alert">{error}</p>}
      <input ref={snapInput} type="file" accept="image/*,video/*" capture="environment" hidden onChange={onSnapPicked} />
      {items === null ? null
        : shown.length ? (
          <ul className="sn-list">
            {shown.map((item) => {
              const last = item.lastMessage;
              const mine = last.senderId === me?.id;
              const name = item.user.displayName || item.user.username;
              return (
                <li key={item.user.id} className={item.unread ? 'sn-item unread' : 'sn-item'}>
                  <Link to={`/chat/${item.user.id}`} className="sn-row">
                    <span className={item.hasStory ? 'sn-ring has-story' : 'sn-ring'}>
                      <Avatar user={item.user} size={44} />
                      {item.isOnline && <span className="sn-online" aria-label="Online" />}
                    </span>
                    <span className="sn-text">
                      <span className="sn-name-row">
                        <span className="sn-name">{name}</span>
                        <span className="sn-time">{timeAgo(last.createdAt)}</span>
                      </span>
                      <span className="sn-sub">
                        {mine && <Ticks last={last} />}
                        <span className="sn-txt">{previewOf(last)}</span>
                      </span>
                    </span>
                  </Link>
                  <button type="button" className="sn-cam" onClick={() => openCamera(item.user.id)} aria-label={`Send ${name} a snap`}>
                    <Icon name="camera" size={24} strokeWidth={2} />
                  </button>
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
