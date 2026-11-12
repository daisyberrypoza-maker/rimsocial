import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import Icon from '../components/Icon.jsx';
import { useAppStore } from '../store.js';
import { goBack } from '../lib/goBack.js';
import { mediaUrl } from '../lib/config.js';
import { toast, logError } from '../toast.js';
import '../snap-screens.css';

// One conversation, WhatsApp-style: delivered and seen ticks, times, typing, reply (swipe right or the menu),
// edit (own text within 15 minutes), forward, delete for me or for everyone (own messages within 48 hours),
// copy and block. Links are clickable and RimSocial post links show a preview card. Photos, videos, audio and
// files can be sent. Refreshes every few seconds.
const URL_PATTERN = /(https?:\/\/[^\s]+)/g;
const POST_PATTERN = /\/p\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
const EDIT_WINDOW_MS = 15 * 60 * 1000;
const DELETE_EVERYONE_WINDOW_MS = 48 * 60 * 60 * 1000;

export function attachmentLabel(kind) {
  if (kind === 'photo') return 'Photo';
  if (kind === 'video') return 'Video';
  if (kind === 'audio') return 'Audio';
  return 'File';
}

function kindOfFile(file) {
  if (/^image\//.test(file.type)) return 'photo';
  if (/^video\//.test(file.type)) return 'video';
  if (/^audio\//.test(file.type)) return 'audio';
  return 'file';
}

function timeOf(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// "just now", "5m ago", "2h ago", "3d ago"
function ago(iso) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

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

function Attachment({ message }) {
  const src = mediaUrl(message.mediaUrl);
  if (message.mediaKind === 'video') return <video className="cv-media" src={src} controls playsInline preload="metadata" />;
  if (message.mediaKind === 'photo') return <img className="cv-media" src={src} alt="Photo" loading="lazy" />;
  if (message.mediaKind === 'audio') return <audio className="cv-audio" src={src} controls preload="metadata" />;
  const name = message.mediaName || 'File';
  return <a className="cv-file" href={src} target="_blank" rel="noopener noreferrer" download={name}>
    <span className="cv-file-icon" aria-hidden="true"><Icon name="file" size={20} /></span>
    <span className="cv-file-name">{name}</span>
  </a>;
}

// Sent (one grey tick), delivered (two grey), seen (two blue)
function Ticks({ message }) {
  const seen = Boolean(message.readAt);
  const delivered = Boolean(message.deliveredAt) || seen;
  return <span className={seen ? 'cv-ticks seen' : 'cv-ticks'} aria-label={seen ? 'Seen' : delivered ? 'Delivered' : 'Sent'}>{delivered ? '✓✓' : '✓'}</span>;
}

// One message row. Swipe right to reply; long press or right-click opens the actions.
function MessageRow({ message, mine, onReply, onOpenMenu, children }) {
  const start = useRef(null);
  const timer = useRef(null);
  const [offset, setOffset] = useState(0);

  function clearTimer() { clearTimeout(timer.current); timer.current = null; }

  return (
    <div
      className={mine ? 'cv-row mine' : 'cv-row theirs'}
      style={{ transform: `translateX(${offset}px)`, transition: offset ? 'none' : 'transform .18s ease' }}
      onTouchStart={(e) => {
        const t = e.touches[0];
        start.current = { x: t.clientX, y: t.clientY, swiped: false };
        clearTimer();
        timer.current = setTimeout(() => { start.current = null; onOpenMenu(message); }, 450);
      }}
      onTouchMove={(e) => {
        if (!start.current) return;
        const t = e.touches[0];
        const dx = t.clientX - start.current.x;
        const dy = t.clientY - start.current.y;
        if (Math.abs(dy) > 12 || Math.abs(dx) > 12) clearTimer();
        if (dx > 0 && Math.abs(dy) < 20) {
          setOffset(Math.min(dx, 80));
          if (dx > 60) start.current.swiped = true;
        }
      }}
      onTouchEnd={() => {
        clearTimer();
        const swiped = start.current?.swiped;
        start.current = null;
        setOffset(0);
        if (swiped) onReply(message);
      }}
      onContextMenu={(e) => { e.preventDefault(); onOpenMenu(message); }}
    >
      {children}
    </div>
  );
}

function Bubble({ message, mine }) {
  const deleted = Boolean(message.deletedForEveryone);
  const hasText = Boolean(message.body) && !deleted;
  const reply = message.replyTo;
  return (
    <div className={mine ? 'dm-bubble mine cv-bubble' : 'dm-bubble theirs cv-bubble'}>
      {reply && (
        <div className="cv-quote">
          <strong>{reply.deletedForEveryone ? 'Deleted message' : reply.senderId === message.senderId ? 'You' : 'Reply'}</strong>
          <span>{reply.deletedForEveryone ? 'This message was deleted' : reply.body || attachmentLabel(reply.mediaKind)}</span>
        </div>
      )}
      {message.replyToId && !reply && <div className="cv-quote"><span>Original message is no longer available</span></div>}
      {deleted && <span className="cv-deleted">This message was deleted</span>}
      {!deleted && message.mediaUrl && <Attachment message={message} />}
      {hasText && <span className="cv-text"><MessageText text={message.body} mine={mine} /></span>}
      {!deleted && message.post && <PostCard post={message.post} />}
      {!deleted && message.post === null && <span className="cv-unavailable">This post is no longer available.</span>}
      <span className="cv-meta">
        {message.forwarded && !deleted && <em>Forwarded · </em>}
        {message.editedAt && !deleted && <em>Edited · </em>}
        <span>{timeOf(message.createdAt)}</span>
        {mine && !deleted && <Ticks message={message} />}
      </span>
    </div>
  );
}

export default function Conversation() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const me = useAppStore((st) => st.user);
  const [partner, setPartner] = useState(null);
  const [online, setOnline] = useState(false);
  const [messages, setMessages] = useState(null);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const [forwarding, setForwarding] = useState(null);
  const [chatMenu, setChatMenu] = useState(false);
  const [muted, setMuted] = useState(false);
  const [sharedOpen, setSharedOpen] = useState(false);
  const [sharedItems, setSharedItems] = useState([]);
  const [sharedLoading, setSharedLoading] = useState(false);
  const [chats, setChats] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);
  const fileRef = useRef(null);
  const lastTypingSent = useRef(0);

  useEffect(() => {
    let alive = true;
    setPartner(null);
    setMessages(null);
    api(`/v1/messages/with/${userId}/info`).then((data) => { if (alive) { setPartner(data.user); setOnline(Boolean(data.online)); } }).catch((e) => { if (alive) setError(e.message); });
    api(`/v1/messages/direct/${userId}/preferences`).then((data) => { if (alive) setMuted(Boolean(data.muted)); }).catch(() => {});
    const load = () => api(`/v1/messages/with/${userId}`)
      .then((data) => {
        if (!alive) return;
        setMessages(data.items || []);
        setTyping(Boolean(data.typing));
        if ((data.items || []).some((m) => m.senderId === userId && !m.readAt)) {
          api(`/v1/messages/with/${userId}/read`, { method: 'POST', body: {} }).catch(() => {});
        }
      })
      .catch((e) => { if (alive) setError(e.message || 'Could not load messages'); });
    load();
    const timer = setInterval(load, 3000);
    return () => { alive = false; clearInterval(timer); };
  }, [userId]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages?.length, typing]);

  // Preview of the file waiting to be sent; the object URL is released when it changes
  useEffect(() => {
    if (!file) { setPreviewUrl(''); return undefined; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function onTextChange(value) {
    setText(value);
    // Tell the other person I am typing, at most every 2.5 seconds
    if (value.trim() && Date.now() - lastTypingSent.current > 2500) {
      lastTypingSent.current = Date.now();
      api(`/v1/messages/with/${userId}/typing`, { method: 'POST', body: {} }).catch(() => {});
    }
  }

  function pickFile(event) {
    const picked = event.target.files?.[0];
    event.target.value = '';
    if (!picked) return;
    setError('');
    setFile(picked);
  }

  function startReply(message) {
    setEditing(null);
    setReplyTo(message);
  }

  function startEdit(message) {
    setReplyTo(null);
    setEditing(message);
    setText(message.body || '');
  }

  function cancelComposer() {
    setReplyTo(null);
    setEditing(null);
    setText('');
    setFile(null);
  }

  async function send(event) {
    event.preventDefault();
    const body = text.trim();
    if ((!body && !file) || sending) return;
    setSending(true);
    setError('');
    try {
      if (editing) {
        const data = await api(`/v1/messages/message/${editing.id}`, { method: 'PATCH', body: { body } });
        setMessages((current) => (current || []).map((m) => (m.id === editing.id ? { ...m, ...data.message } : m)));
        setEditing(null);
        setText('');
        return;
      }
      let data;
      if (file) {
        const form = new FormData();
        form.append('media', file);
        if (body) form.append('body', body);
        if (replyTo) form.append('replyToId', replyTo.id);
        data = await api(`/v1/messages/with/${userId}/media`, { method: 'POST', body: form });
      } else {
        data = await api(`/v1/messages/with/${userId}`, { method: 'POST', body: { body, replyToId: replyTo?.id } });
      }
      const sent = { ...data.message, replyTo: replyTo ? { id: replyTo.id, senderId: replyTo.senderId, body: replyTo.body, mediaKind: replyTo.mediaKind || null, deletedForEveryone: false } : null };
      setMessages((current) => {
        const list = current || [];
        return list.some((m) => m.id === sent.id) ? list : [...list, sent];
      });
      setText('');
      setFile(null);
      setReplyTo(null);
    } catch (e) {
      setError(e.message || 'Could not send');
    } finally {
      setSending(false);
    }
  }

  // Actions for a message: menu sheet
  function canEdit(m) {
    return m && String(m.senderId) === String(me?.id) && !m.deletedForEveryone && !m.mediaUrl && Date.now() - new Date(m.createdAt).getTime() <= EDIT_WINDOW_MS;
  }
  function canDeleteEveryone(m) {
    return m && String(m.senderId) === String(me?.id) && !m.deletedForEveryone && Date.now() - new Date(m.createdAt).getTime() <= DELETE_EVERYONE_WINDOW_MS;
  }

  async function deleteMessage(m, scope) {
    setMenuFor(null);
    try {
      await api(`/v1/messages/message/${m.id}?scope=${scope}`, { method: 'DELETE' });
      if (scope === 'everyone') {
        setMessages((current) => (current || []).map((x) => (x.id === m.id ? { ...x, deletedForEveryone: true, body: '', mediaUrl: null, mediaKind: null, mediaName: null, post: undefined } : x)));
      } else {
        setMessages((current) => (current || []).filter((x) => x.id !== m.id));
      }
    } catch (e) { logError(e); toast(e.message || 'Could not delete'); }
  }

  async function openForward(m) {
    setMenuFor(null);
    setForwarding(m);
    try {
      const data = await api('/v1/messages/conversations');
      setChats(data.items || []);
    } catch (e) { logError(e); setChats([]); }
  }

  async function forwardTo(person) {
    const m = forwarding;
    setForwarding(null);
    try {
      await api(`/v1/messages/message/${m.id}/forward`, { method: 'POST', body: { toUserId: person.id } });
      toast(`Forwarded to ${person.displayName || person.username}`);
    } catch (e) { logError(e); toast(e.message || 'Could not forward'); }
  }

  async function toggleMute() {
    const next = !muted;
    setChatMenu(false);
    try {
      const data = await api(`/v1/messages/direct/${userId}/mute`, { method: 'PUT', body: { enabled: next } });
      setMuted(Boolean(data.muted));
      toast(data.muted ? 'Notifications muted' : 'Notifications unmuted');
    } catch (e) { toast(e.message || 'Could not update mute setting'); }
  }

  async function openSharedActivity() {
    setChatMenu(false);
    setSharedOpen(true);
    setSharedLoading(true);
    try {
      const data = await api(`/v1/messages/with/${userId}/shared`);
      setSharedItems(data.items || []);
    } catch (e) { toast(e.message || 'Could not load shared activity'); setSharedItems([]); }
    finally { setSharedLoading(false); }
  }

  async function deleteConversation() {
    setChatMenu(false);
    if (!window.confirm('Delete this conversation from your inbox? The other person will still have their messages.')) return;
    try {
      await api(`/v1/messages/direct/${userId}`, { method: 'DELETE' });
      navigate('/chat', { replace: true });
    } catch (e) { toast(e.message || 'Could not delete conversation'); }
  }

  async function blockPerson() {
    setChatMenu(false);
    try {
      await api(`/v1/users/${userId}/block`, { method: 'POST', body: {} });
      toast('Blocked');
      navigate('/chat', { replace: true });
    } catch (e) { logError(e); toast(e.message || 'Could not block'); }
  }

  const lastMineSeen = (() => {
    if (!messages) return null;
    const mine = messages.filter((m) => String(m.senderId) === String(me?.id) && !m.deletedForEveryone);
    return mine.length ? mine[mine.length - 1] : null;
  })();
  const name = partner ? (partner.displayName || partner.username) : '';
  const subtitle = typing ? 'typing…' : online ? 'Online' : '';

  return (
    <main className="dm-convo cv-convo">
      <header className="dm-chead">
        <button type="button" className="dm-icon" onClick={() => goBack(navigate, '/chat')} aria-label="Back">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
        </button>
        {partner && <Avatar user={partner} size={38} />}
        <span className="cv-head-text">
          <span className="dm-cname">{name}</span>
          {subtitle && <small className={typing ? 'cv-subtitle typing' : 'cv-subtitle'}>{subtitle}</small>}
        </span>
        <button type="button" className="dm-icon cv-head-menu" onClick={() => setChatMenu(true)} aria-label="Chat options">
          <Icon name="ellipsis" size={22} />
        </button>
      </header>

      <div className="dm-thread">
        {messages === null ? <p className="dm-empty"></p>
          : messages.length === 0 ? <p className="dm-empty">Say hello to start the conversation.</p>
          : messages.map((m) => {
            const mine = String(m.senderId) === String(me?.id);
            return (
              <div key={m.id} className="cv-line">
                <MessageRow message={m} mine={mine} onReply={startReply} onOpenMenu={setMenuFor}>
                  <Bubble message={m} mine={mine} />
                </MessageRow>
                {mine && lastMineSeen && lastMineSeen.id === m.id && (
                  <span className={mine ? 'cv-seen mine' : 'cv-seen'}>
                    {m.readAt ? `Seen ${ago(m.readAt)}` : m.deliveredAt ? `Delivered ${ago(m.deliveredAt)}` : 'Sent'}
                  </span>
                )}
              </div>
            );
          })}
        {typing && <div className="cv-typing" aria-live="polite"><span /><span /><span /></div>}
        <div ref={endRef} />
      </div>

      {error && <p className="dm-error" role="alert">{error}</p>}

      {(replyTo || editing) && (
        <div className="cv-composer-bar">
          <div className="cv-composer-text">
            <strong>{editing ? 'Edit message' : `Reply to ${String(replyTo.senderId) === String(me?.id) ? 'yourself' : name}`}</strong>
            <span>{(editing || replyTo).body || attachmentLabel((editing || replyTo).mediaKind)}</span>
          </div>
          <button type="button" className="cv-pending-remove" onClick={cancelComposer} aria-label="Cancel"><Icon name="x" size={18} /></button>
        </div>
      )}

      {file && (
        <div className="cv-pending">
          {kindOfFile(file) === 'video' && <video src={previewUrl} muted playsInline />}
          {kindOfFile(file) === 'photo' && <img src={previewUrl} alt="" />}
          {(kindOfFile(file) === 'audio' || kindOfFile(file) === 'file') && <span className="cv-file-icon" aria-hidden="true"><Icon name="file" size={20} /></span>}
          <span className="cv-pending-name">{file.name} <small>{attachmentLabel(kindOfFile(file))}</small></span>
          <button type="button" className="cv-pending-remove" onClick={() => setFile(null)} aria-label="Remove attachment"><Icon name="x" size={18} /></button>
        </div>
      )}

      <form className="dm-input cv-form" onSubmit={send}>
        {!editing && (
          <button type="button" className="cv-attach" onClick={() => fileRef.current?.click()} aria-label="Attach file" disabled={sending}>
            <Icon name="plus" size={22} strokeWidth={2.2} />
          </button>
        )}
        <input ref={fileRef} type="file" hidden onChange={pickFile} />
        <input value={text} onChange={(e) => onTextChange(e.target.value)} maxLength={2000} placeholder={editing ? 'Edit message' : 'Send a message'} aria-label="Message" />
        <button type="submit" disabled={(!text.trim() && !file) || sending} aria-label={editing ? 'Save edit' : 'Send'}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 11.5 21 3l-5 18-4-7.5z" /></svg>
        </button>
      </form>

      {menuFor && (
        <div className="cv-sheet-backdrop" onClick={() => setMenuFor(null)}>
          <section className="cv-sheet" role="dialog" aria-label="Message options" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => { startReply(menuFor); setMenuFor(null); }}>Reply</button>
            {menuFor.body && !menuFor.deletedForEveryone && <button type="button" onClick={() => { navigator.clipboard?.writeText(menuFor.body).catch(() => {}); setMenuFor(null); }}>Copy</button>}
            {!menuFor.deletedForEveryone && <button type="button" onClick={() => openForward(menuFor)}>Forward</button>}
            {canEdit(menuFor) && <button type="button" onClick={() => { startEdit(menuFor); setMenuFor(null); }}>Edit</button>}
            {!menuFor.deletedForEveryone && <button type="button" onClick={() => deleteMessage(menuFor, 'me')}>Delete for me</button>}
            {canDeleteEveryone(menuFor) && <button type="button" className="danger" onClick={() => deleteMessage(menuFor, 'everyone')}>Delete for everyone</button>}
            <button type="button" className="cancel" onClick={() => setMenuFor(null)}>Cancel</button>
          </section>
        </div>
      )}

      {forwarding && (
        <div className="cv-sheet-backdrop" onClick={() => setForwarding(null)}>
          <section className="cv-sheet cv-forward" role="dialog" aria-label="Forward to" onClick={(e) => e.stopPropagation()}>
            <h3>Forward to</h3>
            {chats.length === 0 && <p className="cv-empty">No chats yet.</p>}
            {chats.map((item) => (
              <button key={item.user.id} type="button" className="cv-forward-row" onClick={() => forwardTo(item.user)}>
                <Avatar user={item.user} size={36} />
                <span>{item.user.displayName || item.user.username}</span>
              </button>
            ))}
            <button type="button" className="cancel" onClick={() => setForwarding(null)}>Cancel</button>
          </section>
        </div>
      )}

      {chatMenu && (
        <div className="cv-sheet-backdrop" onClick={() => setChatMenu(false)}>
          <section className="cv-sheet" role="dialog" aria-label="Chat options" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={toggleMute}>{muted ? 'Unmute messages' : 'Mute messages'}</button>
            <button type="button" onClick={openSharedActivity}>See shared activity</button>
            <button type="button" className="danger" onClick={deleteConversation}>Delete conversation</button>
            <button type="button" className="danger" onClick={blockPerson}>Block {name}</button>
            <button type="button" className="cancel" onClick={() => setChatMenu(false)}>Cancel</button>
          </section>
        </div>
      )}
      {sharedOpen && (
        <div className="cv-sheet-backdrop" onClick={() => setSharedOpen(false)}>
          <section className="cv-sheet cv-shared" role="dialog" aria-label="Shared activity" onClick={(e) => e.stopPropagation()}>
            <h3>Shared activity</h3>
            {sharedLoading ? <p className="cv-empty">Loading shared activity…</p>
              : sharedItems.length === 0 ? <p className="cv-empty">No photos, videos or posts shared yet.</p>
              : sharedItems.map((item) => (
                <div key={item.id} className="cv-shared-row">
                  {item.mediaUrl && <Attachment message={item} />}
                  {item.post && <PostCard post={item.post} />}
                  {item.body && <p>{item.body}</p>}
                  <small>{timeOf(item.createdAt)}</small>
                </div>
              ))}
            <button type="button" className="cancel" onClick={() => setSharedOpen(false)}>Close</button>
          </section>
        </div>
      )}
    </main>
  );
}
