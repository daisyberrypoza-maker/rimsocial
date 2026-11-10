import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import { useAppStore } from '../store.js';
import { goBack } from '../lib/goBack.js';
import { mediaUrl } from '../lib/config.js';
import '../snap-screens.css';

// One conversation. Refreshes every few seconds and marks incoming messages as read.
// Links are clickable (RimSocial post links open in the app). Photos and videos can be sent and show inline.
// A RimSocial post link shows a preview card with the post's media.
const URL_PATTERN = /(https?:\/\/[^\s]+)/g;
const POST_PATTERN = /\/p\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

function MessageText({ text, mine }) {
  return text.split(URL_PATTERN).map((part, index) => {
    // split with a capture group puts the links at odd positions
    if (index % 2 === 0) return part;
    const post = part.match(POST_PATTERN);
    if (post) return <Link key={index} to={`/p/${post[1]}`} className={mine ? 'cv-link mine' : 'cv-link'}>{part}</Link>;
    return <a key={index} href={part} target="_blank" rel="noopener noreferrer" className={mine ? 'cv-link mine' : 'cv-link'}>{part}</a>;
  });
}

function PostCard({ post }) {
  const isVideo = post.kind === 'video';
  return (
    <Link to={`/p/${post.id}`} className="cv-post">
      <span className="cv-post-media">
        {isVideo
          ? <video src={mediaUrl(post.mediaUrl)} poster={mediaUrl(post.thumbUrl) || undefined} muted playsInline preload="metadata" />
          : <img src={mediaUrl(post.mediaUrl)} alt="" loading="lazy" />}
      </span>
      <span className="cv-post-text">
        <strong>@{post.author?.username || 'creator'}</strong>
        <small>{post.caption || (isVideo ? 'Video' : 'Photo')}</small>
      </span>
    </Link>
  );
}

function Bubble({ message, mine }) {
  const hasText = Boolean(message.body);
  return (
    <div className={mine ? 'dm-bubble mine cv-bubble' : 'dm-bubble theirs cv-bubble'}>
      {message.mediaUrl && (message.mediaKind === 'video'
        ? <video className="cv-media" src={mediaUrl(message.mediaUrl)} controls playsInline preload="metadata" />
        : <img className="cv-media" src={mediaUrl(message.mediaUrl)} alt="Photo" loading="lazy" />)}
      {hasText && <span className="cv-text"><MessageText text={message.body} mine={mine} /></span>}
      {message.post && <PostCard post={message.post} />}
      {message.post === null && <span className="cv-unavailable">This post is no longer available.</span>}
    </div>
  );
}

export default function Conversation() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const me = useAppStore((st) => st.user);
  const [partner, setPartner] = useState(null);
  const [messages, setMessages] = useState(null);
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);
  const fileRef = useRef(null);

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

  // Preview of the photo or video waiting to be sent; the object URL is released when it changes
  useEffect(() => {
    if (!file) { setPreviewUrl(''); return undefined; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pickFile(event) {
    const picked = event.target.files?.[0];
    event.target.value = '';
    if (!picked) return;
    if (!/^(image|video)\//.test(picked.type)) { setError('Choose a photo or a video'); return; }
    setError('');
    setFile(picked);
  }

  async function send(event) {
    event.preventDefault();
    const body = text.trim();
    if ((!body && !file) || sending) return;
    setSending(true);
    setError('');
    try {
      let data;
      if (file) {
        const form = new FormData();
        form.append('media', file);
        if (body) form.append('body', body);
        data = await api(`/v1/messages/with/${userId}/media`, { method: 'POST', body: form });
      } else {
        data = await api(`/v1/messages/with/${userId}`, { method: 'POST', body: { body } });
      }
      setMessages((current) => {
        const list = current || [];
        return list.some((m) => m.id === data.message.id) ? list : [...list, data.message];
      });
      setText('');
      setFile(null);
    } catch (e) {
      setError(e.message || 'Could not send');
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
        {messages === null ? <p className="dm-empty"></p>
          : messages.length === 0 ? <p className="dm-empty">Say hello to start the conversation.</p>
          : messages.map((m) => <Bubble key={m.id} message={m} mine={m.senderId === me?.id} />)}
        <div ref={endRef} />
      </div>
      {error && <p className="dm-error" role="alert">{error}</p>}
      {file && (
        <div className="cv-pending">
          {file.type.startsWith('video/')
            ? <video src={previewUrl} muted playsInline />
            : <img src={previewUrl} alt="" />}
          <span>{file.type.startsWith('video/') ? 'Video' : 'Photo'} ready to send</span>
          <button type="button" className="cv-pending-remove" onClick={() => setFile(null)} aria-label="Remove attachment"><Icon name="x" size={18} /></button>
        </div>
      )}
      <form className="dm-input cv-form" onSubmit={send}>
        <button type="button" className="cv-attach" onClick={() => fileRef.current?.click()} aria-label="Attach photo or video" disabled={sending}>
          <Icon name="plus" size={22} strokeWidth={2.2} />
        </button>
        <input ref={fileRef} type="file" accept="image/*,video/*" hidden onChange={pickFile} />
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder="Send a message" aria-label="Message" />
        <button type="submit" disabled={(!text.trim() && !file) || sending} aria-label="Send">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 11.5 21 3l-5 18-4-7.5z" /></svg>
        </button>
      </form>
    </main>
  );
}
