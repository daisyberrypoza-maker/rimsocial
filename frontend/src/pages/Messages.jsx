import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import { useAppStore } from '../store.js';
import Activity from './Activity.jsx';
import { toast, logError } from '../toast.js';
import '../snap-screens.css';

// Instagram-style inbox with API-backed Primary, General and Requests categories, unread counts, and direct/group conversations.

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
  const [groups, setGroups] = useState([]);
  const [filter, setFilter] = useState('primary');
  const [error, setError] = useState('');
  const [newFriends, setNewFriends] = useState(0);
  const [view, setView] = useState(location.state?.view === 'activity' ? 'activity' : 'messages');
  const [rowMenu, setRowMenu] = useState(null);
  const snapInput = useRef(null);
  const snapTo = useRef(null);
  const longPressTimer = useRef(null);

  useEffect(() => {
    if (location.state?.view === 'activity') setView('activity');
  }, [location.state]);

  useEffect(() => {
    let alive = true;
    const load = () => Promise.all([api('/v1/messages/conversations'), api('/v1/messages/groups')])
      .then(([data, groupData]) => { if (alive) { setItems(data.items || []); setGroups(groupData.items || []); setError(''); useAppStore.getState().setStoryRings(Object.fromEntries((data.items || []).map((i) => [i.user.id, i.storyRing || null]))); } })
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

  async function runRowAction(item, isGroup, action) {
    setRowMenu(null);
    try {
      if (action === 'reminder' || action === 'organizer') { toast(action === 'reminder' ? 'Reminder setup is not available yet.' : 'Chat organizer is not available yet.'); return; }
      if (!isGroup && action === 'read') { await api(`/v1/messages/with/${item.user.id}/read`, { method: 'POST' }); setItems((current) => (current || []).map((row) => row.user.id === item.user.id ? { ...row, unread: 0 } : row)); toast('Marked as read');
      } else if (!isGroup && action === 'unread') { await api(`/v1/messages/with/${item.user.id}/unread`, { method: 'POST' }); setItems((current) => (current || []).map((row) => row.user.id === item.user.id ? { ...row, unread: Math.max(1, row.unread || 0) } : row)); toast('Marked as unread');
      } else if (!isGroup && action === 'block') { if (!window.confirm(`Block ${item.user.displayName || item.user.username}?`)) return; await api(`/v1/users/${item.user.id}/block`, { method: 'POST' }); setItems((current) => (current || []).filter((row) => row.user.id !== item.user.id)); toast('Account blocked');
      } else if (action === 'mute') {
        const endpoint = isGroup ? `/v1/messages/groups/${item.id}/mute` : `/v1/messages/direct/${item.user.id}/mute`;
        const data = await api(endpoint, { method: 'PUT', body: { enabled: !item.muted } });
        if (isGroup) setGroups((current) => current.map((row) => row.id === item.id ? { ...row, muted: Boolean(data.muted) } : row));
        else setItems((current) => (current || []).map((row) => row.user.id === item.user.id ? { ...row, muted: Boolean(data.muted) } : row));
        toast(data.muted ? 'Notifications muted' : 'Notifications unmuted');
      } else if (isGroup) {
        const deleteAll = action === 'deleteAll';
        if (!window.confirm(deleteAll ? `Delete “${item.name}” for every member?` : `Leave “${item.name}”?`)) return;
        await api(`/v1/messages/groups/${item.id}${deleteAll ? '?scope=everyone' : ''}`, { method: 'DELETE' });
        setGroups((current) => current.filter((row) => row.id !== item.id));
        toast(deleteAll ? 'Group deleted' : 'You left the group');
      } else {
        const name = item.user.displayName || item.user.username;
        if (!window.confirm(`Delete your conversation with ${name}? This only removes it from your inbox.`)) return;
        await api(`/v1/messages/direct/${item.user.id}`, { method: 'DELETE' });
        setItems((current) => (current || []).filter((row) => row.user.id !== item.user.id));
        toast('Conversation deleted');
      }
    } catch (e) { toast(e.message || 'Could not complete this action'); logError(e); }
  }

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
  const shown = all.filter((item) => item.group === filter);
  const unreadByGroup = ['primary', 'general', 'requests'].reduce((counts, group) => {
    counts[group] = all.reduce((sum, item) => sum + (item.group === group ? Number(item.unread || 0) : 0), 0);
    return counts;
  }, {});

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
        <h1 className="sn-title">Messages</h1>
        <div className="sn-head-right">
          <button type="button" className="sn-circle" onClick={() => setView('activity')} aria-label="Notifications">
            <Icon name="bell" size={22} strokeWidth={2} />
          </button>
          <button type="button" className="sn-circle sn-yellow" onClick={() => navigate('/friends')} aria-label={newFriends ? `Add friends, ${newFriends} new` : 'Add friends'}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="4" /><path d="M2 21c0-3.5 3-6 7-6s7 2.5 7 6" /><path d="M19 8v6M16 11h6" /></svg>
            {newFriends > 0 && <span className="sn-badge">{newFriends > 99 ? '99+' : newFriends}</span>}
          </button>
          <button type="button" className="sn-circle" onClick={() => navigate('/chat/new')} aria-label="New message">
            <Icon name="plus" size={22} strokeWidth={2.2} />
          </button>
        </div>
      </header>
      <nav className="sn-filters" aria-label="Message inbox categories">
        {['primary', 'general', 'requests'].map((category) => (
          <button key={category} type="button" role="tab" aria-selected={filter === category} className={filter === category ? 'sn-chip active' : 'sn-chip'} onClick={() => setFilter(category)}>
            {category === 'primary' ? 'Primary' : category === 'general' ? 'General' : 'Requests'}
            {unreadByGroup[category] > 0 && <span className="sn-count">{unreadByGroup[category] > 99 ? '99+' : unreadByGroup[category]}</span>}
          </button>
        ))}
      </nav>
      {error && <p className="sn-empty" role="alert">{error}</p>}
      <input ref={snapInput} type="file" accept="image/*,video/*" capture="environment" hidden onChange={onSnapPicked} />
      {items === null ? null
        : shown.length ? (
          <ul className="sn-list">
            {shown.map((item) => {
              const last = item.lastMessage || {};
              const mine = String(last.senderId) === String(me?.id);
              const name = item.user.displayName || item.user.username;
              return (
                <li key={item.user.id} className={item.unread ? 'sn-item unread' : 'sn-item'}>
                  <Link to={`/chat/${item.user.id}`} className="sn-row">
                    <span className="sn-ring">
                      <Avatar user={item.user} size={44} />
                      {item.isOnline && <span className="sn-online" aria-label="Online" />}
                    </span>
                    <span className="sn-text">
                      <span className="sn-name-row">
                        <span className="sn-name">{name}</span>
                        
                      </span>
                      <span className="sn-sub">
                        {mine && <Ticks last={last} />}
                        <span className="sn-txt">{previewOf(last)}</span><span className="sn-time">{timeAgo(last.createdAt)}</span>
                      </span>
                    </span>
                  </Link>
                  <button type="button" className="sn-cam" onClick={() => openCamera(item.user.id)} aria-label={`Send ${name} a snap`}>
                    <Icon name="camera" size={24} strokeWidth={2} />
                  </button>
                  <button type="button" className="sn-row-options" onClick={() => setRowMenu({ item, isGroup: false })} aria-label={`Options for ${name}`}>
                    <Icon name="ellipsis" size={20} />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      {filter === 'primary' && groups.length > 0 && (
        <ul className="sn-list sn-group-list">
          {groups.map((group) => {
            const last = group.lastMessage;
            const preview = last ? (String(last.senderId) === String(me?.id) ? 'You: ' : '') + last.body : 'Group conversation';
            return (
              <li key={group.id} className="sn-item">
                <Link to={`/chat/group/${group.id}`} className="sn-row">
                  <span className="sn-ring sn-group-avatar"><Icon name="users" size={23} /></span>
                  <span className="sn-text">
                    <span className="sn-name-row"><span className="sn-name">{group.name}</span></span>
                    <span className="sn-sub"><span className="sn-txt">{preview}</span>{last && <span className="sn-time">{timeAgo(last.createdAt)}</span>}</span>
                  </span>
                </Link>
                <button type="button" className="sn-row-options" onClick={() => setRowMenu({ item: group, isGroup: true })} aria-label={`Options for ${group.name}`}>
                  <Icon name="ellipsis" size={20} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {items !== null && shown.length === 0 && (filter !== 'primary' || groups.length === 0) && <p className="sn-empty">{filter === 'primary' ? 'No primary conversations yet.' : filter === 'general' ? 'No general conversations yet.' : 'No message requests yet.'}</p>}
      {rowMenu && (
        <div className="sn-menu-dismiss" onClick={() => setRowMenu(null)}>
          <section className="sn-action-menu" role="menu" aria-label="Conversation options" onClick={(event) => event.stopPropagation()}>
            {!rowMenu.isGroup && <>
              <button type="button" role="menuitem" onClick={() => runRowAction(rowMenu.item, false, 'reminder')}><Icon name="bell" size={17} />Set reminder</button>
              <button type="button" role="menuitem" onClick={() => runRowAction(rowMenu.item, false, 'organizer')}><Icon name="calendar" size={17} />Organizer</button>
              <button type="button" role="menuitem" onClick={() => runRowAction(rowMenu.item, false, rowMenu.item.unread ? 'read' : 'unread')}><Icon name={rowMenu.item.unread ? 'check' : 'mail'} size={17} />Mark as {rowMenu.item.unread ? 'read' : 'unread'}</button>
              <button type="button" role="menuitem" onClick={() => runRowAction(rowMenu.item, false, 'block')}><Icon name="shield" size={17} />Block</button>
            </>}
            <button type="button" role="menuitem" onClick={() => runRowAction(rowMenu.item, rowMenu.isGroup, 'mute')}><Icon name={rowMenu.item.muted ? 'volume-2' : 'volume-x'} size={17} />{rowMenu.item.muted ? 'Unmute' : 'Mute'}</button>
            {rowMenu.isGroup && String(rowMenu.item.createdById) === String(me?.id) && <button type="button" role="menuitem" className="danger" onClick={() => runRowAction(rowMenu.item, true, 'deleteAll')}><Icon name="trash" size={17} />Delete group for everyone</button>}
            <button type="button" role="menuitem" className="danger" onClick={() => runRowAction(rowMenu.item, rowMenu.isGroup, 'delete')}><Icon name="trash" size={17} />{rowMenu.isGroup ? 'Leave group' : 'Delete'}</button>
          </section>
        </div>
      )}
      <button type="button" className="sn-fab" onClick={() => navigate('/chat/new')} aria-label="New message">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
      </button>
    </main>
  );
}
