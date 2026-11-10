import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import Icon from '../components/Icon.jsx';
import { useAppStore } from '../store.js';
import { goBack } from '../lib/goBack.js';
import { toast } from '../toast.js';
import '../snap-screens.css';

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
  const endRef = useRef(null);

  useEffect(() => {
    let alive = true;
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
      </header>

      <div className="dm-thread">
        {messages === null ? <p className="dm-empty">Loading group…</p>
          : messages.length === 0 ? <p className="dm-empty">This group is ready. Send the first message.</p>
          : messages.map((message) => {
            const mine = String(message.senderId) === String(me?.id);
            return (
              <div key={message.id} className="cv-line">
                {!mine && <span className="cv-group-sender">{senderName(message.senderId)}</span>}
                <div className={mine ? 'dm-bubble mine cv-bubble' : 'dm-bubble theirs cv-bubble'}>
                  <span className="cv-text">{message.body}</span>
                  <span className="cv-meta"><span>{clock(message.createdAt)}</span></span>
                </div>
              </div>
            );
          })}
        <div ref={endRef} />
      </div>

      {error && <p className="dm-error" role="alert">{error}</p>}
      <form className="dm-input cv-form" onSubmit={send}>
        <input value={text} onChange={(event) => setText(event.target.value)} maxLength={2000} placeholder="Message the group" aria-label="Message the group" />
        <button type="submit" disabled={!text.trim() || sending} aria-label="Send message">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 11.5 21 3l-5 18-4-7.5z" /></svg>
        </button>
      </form>
    </main>
  );
}
