import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import ChatMenu from '../components/ChatMenu.jsx';
import { useAppStore } from '../store.js';
import { goBack } from '../lib/goBack.js';
import { toast } from '../toast.js';
import '../snap-screens.css';
import './Conversation.css';

function clock(value) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function GroupConversationPage() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const me = useAppStore((state) => state.user);
  const [group, setGroup] = useState(null);
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [messageMenu, setMessageMenu] = useState(null);
  const [optionsAnchor, setOptionsAnchor] = useState(null);
  const [messageAnchor, setMessageAnchor] = useState(null);
  const endRef = useRef(null);

  useEffect(() => {
    let alive = true;
    api('/v1/messages/groups').then((data) => { const item = (data.items || []).find((row) => String(row.id) === String(groupId)); if (alive) setMuted(Boolean(item?.muted)); }).catch(() => {});
    const load = () => api('/v1/messages/groups/' + groupId)
      .then((data) => {
        if (!alive) return;
        setGroup(data.group);
        setMessages(data.items || []);
        setError('');
      })
      .catch((e) => { if (alive) setError(e.message || 'Could not load group'); });
    load();
    const timer = setInterval(load, 3000);
    return () => { alive = false; clearInterval(timer); };
  }, [groupId]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages?.length]);

  async function toggleMute() {
    const next = !muted;
    setOptionsOpen(false);
    try {
      const data = await api('/v1/messages/groups/' + groupId + '/mute', { method: 'PUT', body: { enabled: next } });
      setMuted(Boolean(data.muted));
      toast(data.muted ? 'Group notifications muted' : 'Group notifications unmuted');
    } catch (e) { toast(e.message || 'Could not update mute setting'); }
  }

  async function deleteGroupForEveryone() {
    setOptionsOpen(false);
    if (!window.confirm('Delete this group and its messages for every member? This cannot be undone.')) return;
    try {
      await api('/v1/messages/groups/' + groupId + '?scope=everyone', { method: 'DELETE' });
      navigate('/chat', { replace: true });
    } catch (e) { toast(e.message || 'Could not delete group'); }
  }

  async function leaveGroup() {
    setOptionsOpen(false);
    if (!window.confirm('Leave this group? You will stop receiving its messages.')) return;
    try {
      await api('/v1/messages/groups/' + groupId, { method: 'DELETE' });
      navigate('/chat', { replace: true });
    } catch (e) { toast(e.message || 'Could not leave group'); }
  }

  async function send(event) {
    event.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError('');
    try {
      const data = await api('/v1/messages/groups/' + groupId + '/messages', { method: 'POST', body: { body } });
      setMessages((current) => [...(current || []), data.message]);
      setText('');
    } catch (e) {
      setError(e.message || 'Could not send message');
      toast(e.message || 'Could not send message');
    } finally {
      setSending(false);
    }
  }

  async function deleteGroupMessage(message) {
    setMessageMenu(null);
    if (!window.confirm('Delete this message for everyone in the group?')) return;
    try {
      await api('/v1/messages/groups/' + groupId + '/messages/' + message.id, { method: 'DELETE' });
      setMessages((current) => (current || []).filter((row) => row.id !== message.id));
    } catch (e) { toast(e.message || 'Could not delete message'); }
  }

  const members = group?.members || [];
  const senderName = (id) => {
    const user = members.find((person) => String(person.id) === String(id));
    return String(id) === String(me?.id) ? 'You' : (user?.displayName || user?.username || 'Member');
  };

  return (
    <main className="dm-convo cv-convo">
      <header className="dm-chead">
        <button type="button" className="dm-icon" onClick={() => goBack(navigate, '/chat')} aria-label="Back">
          <Icon name="arrow-left" size={24} />
        </button>
        <span className="sn-group-avatar cv-group-head"><Icon name="users" size={22} /></span>
        <span className="cv-head-text">
          <span className="dm-cname">{group?.name || 'Group chat'}</span>
          <small className="cv-subtitle">{members.length ? members.length + ' members' : 'Group conversation'}</small>
        </span>
        <button type="button" className="dm-icon cv-head-menu" onClick={(e) => { setOptionsAnchor(e.currentTarget.getBoundingClientRect()); setOptionsOpen(true); }} aria-label="Group options"><Icon name="more-vertical" size={22} /></button>
      </header>

      <div className="dm-thread">
        {messages === null ? <p className="dm-empty">Loading group…</p>
          : messages.length === 0 ? <p className="dm-empty">This group is ready. Send the first message.</p>
          : messages.map((message) => {
            const mine = String(message.senderId) === String(me?.id);
            return (
              <div key={message.id} className="cv-line">
                {!mine && <span className="cv-group-sender">{senderName(message.senderId)}</span>}
                <div className={mine ? 'dm-bubble mine cv-bubble' : 'dm-bubble theirs cv-bubble'} onContextMenu={(event) => { if (mine) { event.preventDefault(); setMessageAnchor(event.currentTarget.getBoundingClientRect()); setMessageMenu(message); } }}>
                  <span className="cv-text">{message.body}</span>
                  <span className="cv-meta"><span>{clock(message.createdAt)}</span></span>
                  {mine && <button type="button" className="cv-group-message-options" onClick={(event) => { setMessageAnchor(event.currentTarget.getBoundingClientRect()); setMessageMenu(message); }} aria-label="Message options"><Icon name="more-vertical" size={15} /></button>}
                </div>
              </div>
            );
          })}
        <div ref={endRef} />
      </div>

      {error && <p className="dm-error" role="alert">{error}</p>}
      <form className="dm-input cv-form" onSubmit={send}>
        <input enterKeyHint="send" autoComplete="off" value={text} onChange={(event) => setText(event.target.value)} maxLength={2000} placeholder="Message the group" aria-label="Message the group" />
        <button type="submit" onPointerDown={(e) => e.preventDefault()} disabled={!text.trim() || sending} aria-label="Send message">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 11.5 21 3l-5 18-4-7.5z" /></svg>
        </button>
      </form>
      {messageMenu && (
        <ChatMenu
          label="Group message options"
          anchor={messageAnchor}
          onClose={() => setMessageMenu(null)}
          items={[
            { key: 'delete', label: 'Delete for everyone', icon: 'trash-2', danger: true, onSelect: () => deleteGroupMessage(messageMenu) },
          ]}
        />
      )}
      {optionsOpen && (
        <ChatMenu
          label="Group options"
          title={group?.name}
          anchor={optionsAnchor}
          onClose={() => setOptionsOpen(false)}
          items={[
            { key: 'mute', label: muted ? 'Unmute messages' : 'Mute messages', icon: muted ? 'bell' : 'bell-off', onSelect: toggleMute },
            ...(String(group?.createdById) === String(me?.id) ? [{ key: 'delete-group', label: 'Delete group for everyone', icon: 'trash-2', danger: true, onSelect: deleteGroupForEveryone }] : []),
            { key: 'leave', label: 'Leave group', icon: 'log-out', danger: true, onSelect: leaveGroup },
          ]}
        />
      )}
    </main>
  );
}
