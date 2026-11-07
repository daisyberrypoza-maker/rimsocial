import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import { useAppStore } from '../store.js';
import { goBack } from '../lib/goBack.js';

// One conversation. Refreshes every few seconds and marks incoming messages as read.
export default function Conversation() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const me = useAppStore((st) => st.user);
  const [partner, setPartner] = useState(null);
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);

  useEffect(() => {
    let alive = true;
    setPartner(null);
    setMessages(null);
    api(`/v1/messages/with/${userId}/info`).then((data) => { if (alive) setPartner(data.user); }).catch((e) => { if (alive) setError(e.message); });
    const load = () => api(`/v1/messages/with/${userId}`)
      .then((data) => {
        if (!alive) return;
        setMessages(data.items || []);
        if ((data.items || []).some((m) => m.senderId === userId && !m.readAt)) {
          api(`/v1/messages/with/${userId}/read`, { method: 'POST', body: {} }).catch(() => {});
        }
      })
      .catch((e) => { if (alive) setError(e.message || 'Could not load messages'); });
    load();
    const timer = setInterval(load, 3000);
    return () => { alive = false; clearInterval(timer); };
  }, [userId]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages?.length]);

  async function send(event) {
    event.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText('');
    setError('');
    try {
      const data = await api(`/v1/messages/with/${userId}`, { method: 'POST', body: { body } });
      setMessages((current) => {
        const list = current || [];
        return list.some((m) => m.id === data.message.id) ? list : [...list, data.message];
      });
    } catch (e) {
      setError(e.message || 'Could not send');
      setText(body);
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="dm-convo">
      <header className="dm-chead">
        <button type="button" className="dm-icon" onClick={() => goBack(navigate, '/chat')} aria-label="Back">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
        </button>
        {partner && <Avatar user={partner} size={38} />}
        <span className="dm-cname">{partner ? (partner.displayName || partner.username) : ''}</span>
      </header>
      <div className="dm-thread">
        {messages === null ? <p className="dm-empty">Loading…</p>
          : messages.length === 0 ? <p className="dm-empty">Say hello to start the conversation.</p>
          : messages.map((m) => (
            <div key={m.id} className={m.senderId === me?.id ? 'dm-bubble mine' : 'dm-bubble theirs'}>{m.body}</div>
          ))}
        <div ref={endRef} />
      </div>
      {error && <p className="dm-error" role="alert">{error}</p>}
      <form className="dm-input" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder="Send a message" aria-label="Message" />
        <button type="submit" disabled={!text.trim() || sending} aria-label="Send">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 11.5 21 3l-5 18-4-7.5z" /></svg>
        </button>
      </form>
    </main>
  );
}
