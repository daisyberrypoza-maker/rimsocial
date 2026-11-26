import AppLink from '../components/AppLink.jsx';
import { newClientId } from '../lib/clientId.js';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import ChatMenu from '../components/ChatMenu.jsx';
import Icon from '../components/Icon.jsx';
import { useAppStore } from '../store.js';
import { mediaUrl } from '../lib/config.js';
import { toast, logError } from '../toast.js';
import { formatMoney } from '../lib/money.js';
import '../snap-screens.css';
import './Conversation.css';
import { confirmDialog } from '../lib/confirm.js';
import { backgroundCss } from '../lib/storyBackgrounds.js';
import { sealFor, openMessages, rememberPlain } from '../lib/e2ee.js';
import { fitImage } from '../lib/imageFit.js';
import { blurhashOfFile, placeholderFor } from '../lib/blurhash.js';
import { boxOf, closeMotion, dragMotion, dragState, isDismissDrag, openMotion, shouldClose, snapMotion, visualBox } from '../lib/viewerMotion.js';

// One conversation, WhatsApp-style: delivered and seen ticks, times, typing, reply (swipe right or the menu),
// edit (own text within 15 minutes), forward, delete for me or for everyone (own messages within 48 hours),
// copy and block. Links are clickable and RimSocial post links show a preview card. Photos, videos, audio and
// files can be sent. Refreshes every few seconds.
const URL_PATTERN = /(https?:\/\/[^\s]+)/g;
const POST_PATTERN = /\/p\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
const EDIT_WINDOW_MS = 15 * 60 * 1000;

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
    return <AppLink key={index} href={part} className={mine ? 'cv-link mine' : 'cv-link'}>{part}</AppLink>;
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

// Photos and videos open in the chat's own preview; a story sent from a story opens that story instead
// `from` is the message on show, so a comment from the viewer can quote it
function openMedia(src, kind, createdAt, from = null, tile = null) {
  window.dispatchEvent(new CustomEvent('cv-open-media', { detail: { src, kind, createdAt, from, origin: tile ? boxOf(tile) : null } }));
}

// Editable photo before sending: the image plus draw, text and sticker layers, flattened on send
function PhotoEditor({ src, tool, texts, emojis, editorRef, onMove }) {
  const wrap = useRef(null);
  const boxEl = useRef(null);
  const img = useRef(null);
  const canvas = useRef(null);
  const stroke = useRef(null);
  const latest = useRef({ texts, emojis });
  latest.current = { texts, emojis };
  const [box, setBox] = useState(null);

  // Where the photo is actually drawn inside the box (object-fit: contain), so overlays line up with the saved image
  function measure() {
    const i = img.current;
    const w = wrap.current;
    if (!i || !w || !i.naturalWidth) return;
    const wr = w.getBoundingClientRect();
    const scale = Math.min(wr.width / i.naturalWidth, wr.height / i.naturalHeight);
    const width = i.naturalWidth * scale;
    const height = i.naturalHeight * scale;
    setBox({ left: (wr.width - width) / 2, top: (wr.height - height) / 2, width, height });
  }

  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useEffect(() => {
    if (box && canvas.current) {
      canvas.current.width = Math.round(box.width * 2);
      canvas.current.height = Math.round(box.height * 2);
    }
  }, [box]);

  useEffect(() => {
    editorRef.current = {
      compose: () => new Promise((resolve, reject) => {
        const i = img.current;
        if (!i || !i.naturalWidth) { reject(new Error('Photo not ready')); return; }
        const W = i.naturalWidth;
        const H = i.naturalHeight;
        const out = document.createElement('canvas');
        out.width = W;
        out.height = H;
        const ctx = out.getContext('2d');
        ctx.drawImage(i, 0, 0, W, H);
        if (canvas.current) ctx.drawImage(canvas.current, 0, 0, W, H);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,.45)';
        ctx.shadowBlur = Math.round(W * 0.01);
        latest.current.texts.forEach((t) => { ctx.font = `700 ${Math.round(W * 0.06)}px sans-serif`; ctx.fillStyle = '#fff'; ctx.fillText(t.text, W * (t.x ?? 0.5), H * t.y); });
        latest.current.emojis.forEach((e) => { ctx.font = `${Math.round(W * 0.14)}px sans-serif`; ctx.fillText(e.emoji, W * (e.x ?? 0.5), H * e.y); });
        out.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not prepare the photo'))), 'image/jpeg', 0.92);
      }),
    };
  });

  // Drag a text or sticker anywhere on the photo; the position is kept as a fraction of the photo
  function startDrag(kind, index, event) {
    if (!onMove || tool === 'draw') return;
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const clamp = (v) => Math.min(0.95, Math.max(0.05, v));
    const move = (ev) => {
      const r = boxEl.current?.getBoundingClientRect();
      if (!r || !r.width || !r.height) return;
      onMove(kind, index, clamp((ev.clientX - r.left) / r.width), clamp((ev.clientY - r.top) / r.height));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  function pointAt(event) {
    const c = canvas.current;
    const r = c.getBoundingClientRect();
    return { x: (event.clientX - r.left) * (c.width / r.width), y: (event.clientY - r.top) * (c.height / r.height) };
  }

  return (
    <div className="cv-edit-wrap" ref={wrap}>
      <img
        ref={img}
        src={src}
        alt="Photo to edit"
        onLoad={measure}
        className="cv-edit-img"
        style={box ? { left: box.left, top: box.top, width: box.width, height: box.height } : { visibility: 'hidden' }}
      />
      {box && (
        <div ref={boxEl} className="cv-edit-box" style={{ left: box.left, top: box.top, width: box.width, height: box.height }}>
          <canvas
            ref={canvas}
            className="cv-draw"
            style={{ pointerEvents: tool === 'draw' ? 'auto' : 'none' }}
            onPointerDown={(e) => {
              if (tool !== 'draw') return;
              e.currentTarget.setPointerCapture?.(e.pointerId);
              stroke.current = pointAt(e);
            }}
            onPointerMove={(e) => {
              if (!stroke.current || tool !== 'draw') return;
              const from = stroke.current;
              const to = pointAt(e);
              const ctx = canvas.current.getContext('2d');
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              ctx.strokeStyle = '#fff';
              ctx.lineWidth = canvas.current.width * 0.012;
              ctx.beginPath();
              ctx.moveTo(from.x, from.y);
              ctx.lineTo(to.x, to.y);
              ctx.stroke();
              stroke.current = to;
            }}
            onPointerUp={() => { stroke.current = null; }}
            onPointerCancel={() => { stroke.current = null; }}
          />
          {texts.map((t, index) => (
            <span key={`t${index}`} className="cv-edit-text-item" style={{ left: `${(t.x ?? 0.5) * 100}%`, top: `${t.y * 100}%`, pointerEvents: tool === 'draw' ? 'none' : 'auto', touchAction: 'none' }} onPointerDown={(e) => startDrag('text', index, e)}>{t.text}</span>
          ))}
          {emojis.map((item, index) => (
            <span key={`e${index}`} className="cv-edit-emoji" style={{ left: `${(item.x ?? 0.5) * 100}%`, top: `${item.y * 100}%`, pointerEvents: tool === 'draw' ? 'none' : 'auto', touchAction: 'none' }} onPointerDown={(e) => startDrag('emoji', index, e)}>{item.emoji}</span>
          ))}
        </div>
      )}
    </div>
  );
}

const VIEW_OPTIONS = [
  { value: 0, label: 'Unlimited views' },
  { value: 1, label: 'View once' },
  { value: 2, label: 'View twice' },
];

// Full-screen media: before sending (pending) it shows the editing tools and Send; after sending it shows the chat viewer
export function MediaViewer({ media, partner, pending, text, onText, onSend, onQuick, onClose, sending, name, edit, setEdit, editorRef, viewLimits = true }) {
  const isVideo = media.kind === 'video';
  // Tile transition: grows out of the tapped photo or video, drag to dismiss
  const rootRef = useRef(null);
  const backdropRef = useRef(null);
  const dragRef = useRef(null);
  const closingRef = useRef(false);
  const origin = media.origin || null;
  useLayoutEffect(() => openMotion(rootRef.current, backdropRef.current, origin), []); // eslint-disable-line react-hooks/exhaustive-deps
  function requestClose(liveBox = null, velocity = {}) {
    if (closingRef.current) return;
    closingRef.current = true;
    if (!rootRef.current || !origin) { onClose(); return; }
    closeMotion(rootRef.current, backdropRef.current, origin, liveBox, velocity, () => onClose());
  }
  function onViewerPointerDown(event) {
    if (pending || event.target.closest?.('form, button, input, textarea')) { dragRef.current = null; return; }
    dragRef.current = { x: event.clientX, y: event.clientY, t: performance.now(), active: false };
  }
  function onViewerPointerMove(event) {
    const start = dragRef.current;
    if (!start || closingRef.current) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!start.active) {
      if (!isDismissDrag(dx, dy)) return;
      start.active = true;
    }
    if (rootRef.current) dragMotion(rootRef.current, backdropRef.current, dx, dy);
  }
  function onViewerPointerUp(event) {
    const start = dragRef.current;
    dragRef.current = null;
    if (!start?.active || !rootRef.current) return;
    const ds = dragState(event.clientX - start.x, event.clientY - start.y);
    const seconds = Math.max((performance.now() - start.t) / 1000, 0.016);
    if (shouldClose(ds, seconds)) requestClose(visualBox(ds), { left: (event.clientX - start.x) / seconds, top: (event.clientY - start.y) / seconds });
    else snapMotion(rootRef.current, backdropRef.current);
  }
  function onViewerPointerCancel() {
    const start = dragRef.current;
    dragRef.current = null;
    if (start?.active && rootRef.current) snapMotion(rootRef.current, backdropRef.current);
  }
  // Keeps a dragged text or sticker where it was dropped
  function moveItem(kind, index, x, y) {
    setEdit((current) => {
      const key = kind === 'text' ? 'texts' : 'emojis';
      return { ...current, [key]: current[key].map((item, i) => (i === index ? { ...item, x, y } : item)) };
    });
  }
  const [draft, setDraft] = useState('');
  const [viewSheet, setViewSheet] = useState(false);
  const count = edit ? edit.texts.length + edit.emojis.length : 0;

  function toggleTool(tool) {
    setEdit((current) => ({ ...current, tool: current.tool === tool ? null : tool }));
  }
  function addText(event) {
    event.preventDefault();
    const value = draft.trim();
    setDraft('');
    if (!value) { setEdit((current) => ({ ...current, tool: null })); return; }
    setEdit((current) => ({ ...current, tool: null, texts: [...current.texts, { text: value, y: Math.min(0.85, 0.5 + 0.09 * count) }] }));
  }
  function addEmoji(emoji) {
    setEdit((current) => ({ ...current, emojis: [...current.emojis, { emoji, y: Math.min(0.85, 0.5 + 0.09 * count) }] }));
  }

  return (
    <>
    <div ref={backdropRef} className="cv-viewer-backdrop" aria-hidden="true" />
    <div ref={rootRef} className="cv-viewer cv-viewer-full" role="dialog" aria-label="Media preview" onPointerDown={onViewerPointerDown} onPointerMove={onViewerPointerMove} onPointerUp={onViewerPointerUp} onPointerCancel={onViewerPointerCancel}>
      <div className="cv-viewer-stage">
        {pending && !isVideo && edit
          ? <PhotoEditor src={media.src} tool={edit.tool} texts={edit.texts} emojis={edit.emojis} editorRef={editorRef} onMove={moveItem} />
          : isVideo
            ? <video src={media.src} controls={!pending} muted={pending} autoPlay playsInline />
            : <img src={media.src} alt="" />}
      </div>
      <div className="cv-viewer-top">
        <button type="button" className="cv-viewer-close" onClick={() => requestClose()} aria-label="Close preview">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        {!pending && (
          <div className="cv-viewer-who">
            {partner && <Avatar user={partner} size={34} />}
            <div><strong>{name}</strong><small>{media.createdAt ? timeOf(media.createdAt) : 'now'}</small></div>
          </div>
        )}
      </div>
      {pending && edit && !isVideo && (
        <div className="cv-edit-tools" role="toolbar" aria-label="Edit photo">
          <button type="button" className={edit.tool === 'text' ? 'on' : ''} onClick={() => toggleTool('text')} aria-label="Add text">Aa</button>
          <button type="button" className={edit.tool === 'sticker' ? 'on' : ''} onClick={() => toggleTool('sticker')} aria-label="Add sticker">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9c0 3 2 5 5 5 1.3 0 3 .6 4 4z" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" /></svg>
          </button>
          <button type="button" className={edit.tool === 'draw' ? 'on' : ''} onClick={() => toggleTool('draw')} aria-label="Draw">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 19l7-7 3 3-7 7-3-3zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /></svg>
          </button>
          {viewLimits && <button type="button" onClick={() => setViewSheet(true)} aria-label="Who can view" className={edit.viewLimit ? 'on' : ''}>
            <span className="cv-view-badge">{edit.viewLimit === 1 ? '1' : edit.viewLimit === 2 ? '2' : '∞'}</span>
          </button>}
        </div>
      )}
      {pending && edit && edit.tool === 'text' && (
        <form className="cv-edit-text-form" onSubmit={addText}>
          <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={80} placeholder="Type something" aria-label="Text on photo" />
          <button type="submit">Done</button>
        </form>
      )}
      {pending && edit && edit.tool === 'sticker' && (
        <div className="cv-emoji-panel cv-sticker-panel" aria-label="Stickers">
          {EMOJIS.map((emoji) => (
            <button key={emoji} type="button" onClick={() => addEmoji(emoji)} aria-label={`Add ${emoji}`}>{emoji}</button>
          ))}
        </div>
      )}
      {!pending && <div className="cv-viewer-progress" aria-hidden="true"><span key={media.src} /></div>}
      <form className="cv-viewer-bottom" onSubmit={(e) => { e.preventDefault(); onSend(text); }}>
        <input value={text} onChange={(e) => onText(e.target.value)} maxLength={2000} placeholder={pending ? 'Add a message...' : 'Message...'} aria-label="Message" />
        {pending ? (
          <button type="submit" className="cv-viewer-send" disabled={sending} aria-label="Send">
            {partner && <Avatar user={partner} size={30} />}
            <span>Send</span>
          </button>
        ) : text.trim() ? (
          <button type="submit" className="cv-viewer-send-text" aria-label="Send">Send</button>
        ) : (
          <span className="cv-viewer-quick">
            {['❤️', '😂', '😮'].map((emoji) => (
              <button key={emoji} type="button" onClick={() => onQuick(emoji)} aria-label={`Send ${emoji}`}>{emoji}</button>
            ))}
            <button type="button" onClick={onClose} aria-label="Close">+</button>
          </span>
        )}
      </form>
      {pending && viewSheet && edit && (
        <div className="cv-view-sheet-backdrop" onClick={() => setViewSheet(false)}>
          <div className="cv-view-sheet" role="dialog" aria-label="Who can view this photo" onClick={(e) => e.stopPropagation()}>
            <p>Set how many times this photo can be viewed.</p>
            {VIEW_OPTIONS.map((option) => (
              <button key={option.value} type="button" onClick={() => { setEdit((current) => ({ ...current, viewLimit: option.value })); setViewSheet(false); }}>
                <span>{option.label}</span>
                {edit.viewLimit === option.value && <span className="cv-view-check" aria-hidden="true">✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
    </>
  );
}

// Recipient opens a view-limited photo: the server counts the view, then the photo opens
async function openViewOnce(message, tile = null) {
  try {
    const data = await api(`/v1/messages/message/${message.id}/view`, { method: 'POST', body: {} });
    window.dispatchEvent(new CustomEvent('cv-viewed', { detail: { id: message.id, viewCount: data.viewCount } }));
    openMedia(mediaUrl(message.mediaUrl), 'photo', message.createdAt, { id: message.id, senderId: message.senderId, mediaUrl: message.viewLimit ? null : message.mediaUrl }, tile);
  } catch (e) {
    logError(e);
    toast(e.message || 'This photo can no longer be viewed');
  }
}

// The story a reply or reaction was sent on, shown above it so the person can see what they reacted to
function StoryCard({ story, authorId }) {
  const thumb = story.kind === 'photo' ? (story.mediaUrl || story.thumbUrl) : story.kind === 'video' ? story.thumbUrl : null;
  const textStory = story.kind === 'text';
  return (
    <Link to="/stories" state={{ openUserId: authorId }} className="cv-story-card" aria-label="Open story">
      {thumb && <img src={mediaUrl(thumb)} alt="" loading="lazy" />}
      {textStory && <span className="cv-story-card-text" style={{ background: backgroundCss(story.storyBackground) }}>{story.storyText || story.caption || ''}</span>}
      {!thumb && !textStory && <span className="cv-story-card-text">{story.caption || 'Story'}</span>}
      <span className="cv-story-card-label">Story</span>
    </Link>
  );
}

function Attachment({ message, storyAuthorId, mine }) {
  const src = mediaUrl(message.mediaUrl);
  if (message.mediaKind === 'photo' && message.viewLimit > 0 && !mine) {
    if (message.viewCount >= message.viewLimit) return <span className="cv-once opened">Opened</span>;
    return <button type="button" className="cv-once" onClick={(e) => openViewOnce(message, e.currentTarget)}>Tap to view</button>;
  }
  if (message.mediaKind === 'video' || message.mediaKind === 'photo') {
    const media = message.mediaKind === 'video'
      ? <span className="cv-media-frame"><video className="cv-media" src={src} muted playsInline preload="metadata" /><span className="cv-play" aria-hidden="true">▶</span></span>
      : <img className="cv-media" src={src} alt="Photo" loading="lazy" style={placeholderFor(message.blurhash) ? { backgroundImage: `url(${placeholderFor(message.blurhash)})`, backgroundSize: 'cover' } : undefined} />;
    if (storyAuthorId) return <Link to="/stories" state={{ openUserId: storyAuthorId }} className="cv-media-link" aria-label="Open story">{media}</Link>;
    return <button type="button" className="cv-media-link" onClick={(e) => openMedia(src, message.mediaKind, message.createdAt, { id: message.id, senderId: message.senderId, mediaUrl: message.mediaKind === 'photo' ? message.mediaUrl : null }, e.currentTarget)} aria-label={message.mediaKind === 'video' ? 'Play video' : 'Open photo'}>{media}</button>;
  }
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
export function MessageRow({ message, mine, onReply, onOpenMenu, children }) {
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
        const rect = e.currentTarget.getBoundingClientRect();
        timer.current = setTimeout(() => { start.current = null; onOpenMenu(message, rect); }, 450);
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
      onContextMenu={(e) => { e.preventDefault(); onOpenMenu(message, e.currentTarget.getBoundingClientRect()); }}
    >
      {children}
    </div>
  );
}

const EMOJIS = ['😀', '😂', '😍', '🥰', '😊', '😎', '🙏', '👍', '🔥', '🎉', '❤️', '😢', '😮', '😡', '🤔', '👏', '😋', '🥳', '💯', '✨', '😘', '🤣', '😅', '🙌', '👀', '💕', '😇', '🤗', '😴', '🤩'];
function formatClock(total) {
  const m = Math.floor(total / 60);
  const sec = String(total % 60).padStart(2, '0');
  return `${m}:${sec}`;
}
const ICON = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
function stampOf(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
// A centred time shows before the first message and after any gap of more than 30 minutes
function needsStamp(list, i) {
  if (i === 0) return true;
  const gap = new Date(list[i].createdAt) - new Date(list[i - 1].createdAt);
  return gap > 30 * 60 * 1000;
}

function OrderCard({ order, mine }) {
  const title = order.status === 'paid' ? 'Order paid' : order.status === 'cancelled' ? 'Order cancelled' : 'Order created';
  return (
    <Link to={`/orders/${order.id}`} className={mine ? 'cv-order mine' : 'cv-order theirs'}>
      <span className="cv-order-icon" aria-hidden="true">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2h12v20l-3-2-3 2-3-2-3 2z" /><path d="M9 7h6M9 11h6M9 15h4" /></svg>
      </span>
      <span className="cv-order-body">
        <strong>{title}</strong>
        <small>Order number {String(order.id).slice(0, 8).toUpperCase()}</small>
        <span className="cv-order-amount">{formatMoney(order.amountCents, order.currency)}</span>
      </span>
      <span className="cv-order-view">View order</span>
    </Link>
  );
}

// Photos and videos that arrive together from one person form a gallery
function isGalleryItem(m) {
  return !m.order && !m.deletedForEveryone && !m.body && !m.replyToId && !m.post && !m.viewLimit
    && !!m.mediaUrl && (m.mediaKind === 'photo' || m.mediaKind === 'video');
}

// Consecutive gallery items from the same person within two minutes share one row
export function groupRows(list) {
  const rows = [];
  list.forEach((m, idx) => {
    const prev = rows[rows.length - 1];
    const last = prev && prev.items[prev.items.length - 1].m;
    const sameRun = prev && prev.gallery && isGalleryItem(m) && last
      && String(prev.senderId) === String(m.senderId)
      && new Date(m.createdAt) - new Date(last.createdAt) <= 2 * 60 * 1000;
    if (sameRun) { prev.items.push({ m, idx }); return; }
    rows.push({ gallery: isGalleryItem(m), senderId: m.senderId, items: [{ m, idx }] });
  });
  return rows;
}

// The time is shown once, under the last message of a run from the same person
export function isLastOfRun(list, i) {
  const next = list[i + 1];
  if (!next) return true;
  if (String(next.senderId) !== String(list[i].senderId)) return true;
  return new Date(next.createdAt) - new Date(list[i].createdAt) > 2 * 60 * 1000;
}

function TimeLine({ message, mine }) {
  return (
    <div className={mine ? 'cv-time mine' : 'cv-time'}>
      {message.forwarded && !message.deletedForEveryone && <em>Forwarded ·</em>}
      {message.editedAt && !message.deletedForEveryone && <em>Edited ·</em>}
      <span>{timeOf(message.createdAt)}</span>
      {mine && !message.deletedForEveryone && <Ticks message={message} />}
    </div>
  );
}

const FIRST_LINK_PATTERN = /https?:\/\/[^\s<>"']+/i;
const previewCache = new Map();

// The first link in a message shows a small card; tapping it opens the page in an in-app browser
export function LinkPreview({ text }) {
  const match = FIRST_LINK_PATTERN.exec(text || '');
  const url = match ? match[0].replace(/[.,;:!?)]+$/, '') : '';
  const [preview, setPreview] = useState(() => (url && previewCache.has(url) ? previewCache.get(url) : null));
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!url || previewCache.has(url)) { setPreview(url ? previewCache.get(url) || null : null); return undefined; }
    let alive = true;
    api(`/v1/messages/link-preview?url=${encodeURIComponent(url)}`)
      .then((data) => { previewCache.set(url, data.preview || null); if (alive) setPreview(data.preview || null); })
      .catch(() => { previewCache.set(url, null); });
    return () => { alive = false; };
  }, [url]);
  if (!url || !preview) return null;
  return (
    <>
      <button type="button" className="cv-link-card" onClick={() => setOpen(true)}>
        {preview.image && <img src={preview.image} alt="" loading="lazy" />}
        <span className="cv-link-text">
          <strong>{preview.title || preview.domain}</strong>
          {preview.description && <small>{preview.description}</small>}
          <em>{preview.domain}</em>
        </span>
      </button>
      {open && (
        <div className="cv-browser" role="dialog" aria-label="Link preview">
          <div className="cv-browser-top">
            <button type="button" className="cv-viewer-close" onClick={() => setOpen(false)} aria-label="Close">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
            <strong>{preview.title || preview.domain}</strong>
            <a href={url} target="_blank" rel="noopener noreferrer">Open</a>
          </div>
          <iframe src={url} title={preview.title || preview.domain} referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" />
          <p className="cv-browser-note">If the page does not load here, tap Open to view it in your browser.</p>
        </div>
      )}
    </>
  );
}

function Bubble({ message, mine }) {
  if (message.order) return <OrderCard order={message.order} mine={mine} />;
  const deleted = Boolean(message.deletedForEveryone);
  const hasText = Boolean(message.body) && !deleted;
  // A post or profile shared from RimSocial is shown as a plain card, without the link text or a bubble
  const sharedLink = hasText && /^https?:\/\/\S+\/(p\/[0-9a-f-]{20,}|u\/[A-Za-z0-9_.-]+)\/?$/i.test(message.body.trim());
  const reply = message.replyTo;
  // A photo, video or story sent on its own shows without a bubble, like the reference
  if (!deleted && message.mediaUrl && !hasText && !reply && !message.replyToId && !message.post) {
    return <div className={mine ? 'cv-media-only mine' : 'cv-media-only theirs'}><Attachment message={message} storyAuthorId={message.storyAuthorId || null} mine={mine} /></div>;
  }
  return (
    <div className={`${mine ? 'dm-bubble mine cv-bubble' : 'dm-bubble theirs cv-bubble'}${sharedLink ? ' cv-bubble-plain' : ''}`}>
      {reply && (
        <div className={reply.mediaKind === 'photo' && reply.mediaUrl && !reply.deletedForEveryone ? 'cv-quote with-thumb' : 'cv-quote'}>
          <div className="cv-quote-text">
            <strong>{reply.deletedForEveryone ? 'Deleted message' : reply.senderId === message.senderId ? 'You' : 'Reply'}</strong>
            <span>{reply.deletedForEveryone ? 'This message was deleted' : reply.body || attachmentLabel(reply.mediaKind)}</span>
          </div>
          {!reply.deletedForEveryone && reply.mediaKind === 'photo' && reply.mediaUrl && <img className="cv-quote-thumb" src={mediaUrl(reply.mediaUrl)} alt="" />}
        </div>
      )}
      {message.replyToId && !reply && <div className="cv-quote"><span>Original message is no longer available</span></div>}
      {deleted && <span className="cv-deleted">This message was deleted</span>}
      {!deleted && message.mediaUrl && <Attachment message={message} storyAuthorId={message.storyAuthorId || null} mine={mine} />}
      {hasText && !sharedLink && <span className="cv-text"><MessageText text={message.body} mine={mine} /></span>}
      {hasText && <LinkPreview text={message.body} />}
      {!deleted && message.post && message.storyAuthorId && <StoryCard story={message.post} authorId={message.storyAuthorId} />}
      {!deleted && message.post && !message.storyAuthorId && <PostCard post={message.post} />}
      {!deleted && message.post === null && <span className="cv-unavailable">This post is no longer available.</span>}
    </div>
  );
}

export default function Conversation({ userId }) {
  const navigate = useNavigate();
  const location = useLocation();
  const me = useAppStore((st) => st.user);
  const [partner, setPartner] = useState(null);
  const [online, setOnline] = useState(false);
  const [messages, setMessages] = useState(null);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  // Disappearing message for the next send: null, 'AFTER_VIEWING' or '24_HOURS'
  const [ephemeral, setEphemeral] = useState(null);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const [forwarding, setForwarding] = useState(null);
  const [chatMenu, setChatMenu] = useState(false);
  const [chatAnchor, setChatAnchor] = useState(null);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [muted, setMuted] = useState(false);
  const [sharedOpen, setSharedOpen] = useState(false);
  const [sharedItems, setSharedItems] = useState([]);
  const [sharedLoading, setSharedLoading] = useState(false);
  const [chats, setChats] = useState([]);
  const [sending, setSending] = useState(false);
  // Leaving the chat removes "after viewing" messages that were read
  useEffect(() => () => { api(`/v1/messages/with/${userId}/exit`, { method: 'POST', body: {} }).catch(() => {}); }, [userId]);
  const [error, setError] = useState('');
  const endRef = useRef(null);
  const composerRef = useRef(null);
  const threadRef = useRef(null);
  const fileRef = useRef(null);
  const [orderOpen, setOrderOpen] = useState(false);
  const [viewerMedia, setViewerMedia] = useState(null);
  const [viewerText, setViewerText] = useState('');
  const [edit, setEdit] = useState({ tool: null, texts: [], emojis: [], viewLimit: 0 });
  const editorRef = useRef(null);
  useEffect(() => { setEdit({ tool: null, texts: [], emojis: [], viewLimit: 0 }); }, [file]);
  useEffect(() => {
    const onViewed = (event) => setMessages((current) => (current || []).map((m) => (m.id === event.detail.id ? { ...m, viewCount: event.detail.viewCount } : m)));
    window.addEventListener('cv-viewed', onViewed);
    return () => window.removeEventListener('cv-viewed', onViewed);
  }, []);
  useEffect(() => {
    const onOpen = (event) => setViewerMedia(event.detail);
    window.addEventListener('cv-open-media', onOpen);
    return () => window.removeEventListener('cv-open-media', onOpen);
  }, []);
  const [orderAmount, setOrderAmount] = useState('');
  const [orderDescription, setOrderDescription] = useState('');
  const [orderSaving, setOrderSaving] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const holdRef = useRef({ active: false, startX: 0 });
  const cancelRecordRef = useRef(false);
  const recordTimerRef = useRef(null);
  const lastTypingSent = useRef(0);

  useEffect(() => {
    let alive = true;
    setPartner(null);
    setMessages(null);
    api(`/v1/messages/with/${userId}/info`).then((data) => { if (alive) { setPartner(data.user); setOnline(Boolean(data.online)); } }).catch((e) => { if (alive) setError(e.message); });
    api(`/v1/messages/direct/${userId}/preferences`).then((data) => { if (alive) setMuted(Boolean(data.muted)); }).catch(() => {});
    const load = () => api(`/v1/messages/with/${userId}`)
      .then(async (data) => {
        const items = await openMessages(data.items || [], me?.id);
        if (!alive) return;
        setMessages(items);
        setTyping(Boolean(data.typing));
        if ((data.items || []).some((m) => m.senderId === userId && !m.readAt)) {
          api(`/v1/messages/with/${userId}/read`, { method: 'POST', body: {} }).catch(() => {});
        }
      })
      .catch((e) => { if (alive) setError(e.message || 'Could not load messages'); });
    load();
    const timer = setInterval(load, 3000);
    const onChat = (e) => { if (e.detail && e.detail.kind === 'direct' && String(e.detail.with) === String(userId)) load(); };
    window.addEventListener('rs-chat', onChat);
    return () => { alive = false; clearInterval(timer); window.removeEventListener('rs-chat', onChat); };
  }, [userId]);

  // Stay on the latest message whenever the thread changes size (keyboard opening, the box growing or shrinking)
  // unless the person has scrolled up to read older messages
  useEffect(() => {
    const thread = threadRef.current;
    if (!thread || typeof ResizeObserver === 'undefined') return undefined;
    let atEnd = true;
    const onScroll = () => { atEnd = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 80; };
    const observer = new ResizeObserver(() => { if (atEnd) thread.scrollTop = thread.scrollHeight; });
    thread.addEventListener('scroll', onScroll, { passive: true });
    observer.observe(thread);
    return () => { thread.removeEventListener('scroll', onScroll); observer.disconnect(); };
  }, [userId, Boolean(messages)]);

  // While the message box has focus, keep the latest message in view as the keyboard opens or resizes
  useEffect(() => {
    const keepAtEnd = () => endRef.current?.scrollIntoView({ block: 'end' });
    const onResize = () => { if (document.activeElement === composerRef.current) keepAtEnd(); };
    window.visualViewport?.addEventListener('resize', onResize);
    return () => window.visualViewport?.removeEventListener('resize', onResize);
  }, [userId]);

  // Always land on the latest message: after the list renders, and again as photos finish loading when the chat opens
  useEffect(() => {
    const toEnd = () => endRef.current?.scrollIntoView({ block: 'end' });
    toEnd();
    const soon = setTimeout(toEnd, 120);
    const openedAt = Date.now();
    const onImageLoad = (event) => { if (event.target?.tagName === 'IMG' && Date.now() - openedAt < 4000) toEnd(); };
    window.addEventListener('load', onImageLoad, true);
    return () => { clearTimeout(soon); window.removeEventListener('load', onImageLoad, true); };
  }, [messages?.length, typing, userId]);

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

  // Several photos or videos picked at once are sent as they are, and show together as a gallery
  async function sendFiles(files) {
    for (const item of files) {
      try {
        const form = new FormData();
        form.append('media', item);
        form.append('clientId', newClientId());
        if (String(item.type).startsWith('image/')) {
          const hash = await blurhashOfFile(item);
          if (hash) form.append('blurhash', hash);
        }
        const data = await api(`/v1/messages/with/${userId}/media`, { method: 'POST', body: form });
        setMessages((current) => {
          const list = current || [];
          return list.some((m) => m.id === data.message.id) ? list : [...list, data.message];
        });
      } catch (e) {
        logError(e);
        setError(e.message || 'Could not send');
      }
    }
  }

  function pickFile(event) {
    const picked = Array.from(event.target.files || []);
    event.target.value = '';
    if (!picked.length) return;
    setError('');
    if (picked.length > 1) { sendFiles(picked); return; }
    setFile(picked[0]);
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

  // Send a short text (or emoji) to this person straight from the media viewer
  async function sendQuick(body) {
    const clean = String(body || '').trim();
    if (!clean) return;
    setViewerText('');
    try {
      // A comment or reaction on a photo or video is a reply to that message
      const from = viewerMedia?.from || null;
      const sealed = await sealFor(userId, clean);
      const data = await api(`/v1/messages/with/${userId}`, { method: 'POST', body: { body: sealed, replyToId: from?.id || undefined } });
      const quoted = from ? { id: from.id, senderId: from.senderId, body: '', mediaKind: viewerMedia.kind || 'photo', mediaUrl: from.mediaUrl || null, deletedForEveryone: false } : null;
      rememberPlain(data.message.id, clean);
      const sent = { ...data.message, body: clean, replyTo: quoted };
      setMessages((current) => {
        const list = current || [];
        return list.some((m) => m.id === sent.id) ? list : [...list, sent];
      });
      setViewerMedia(null);
    } catch (e) {
      logError(e);
      toast(e.message || 'Message not sent');
    }
  }

  async function createOrder(event) {
    event.preventDefault();
    const amount = Number(orderAmount);
    if (orderSaving) return;
    if (!Number.isFinite(amount) || amount <= 0) { setOrderError('Enter an amount greater than zero.'); return; }
    setOrderError('');
    setOrderSaving(true);
    try {
      const data = await api(`/v1/messages/with/${userId}/order`, { method: 'POST', body: { amount, description: orderDescription.trim() } });
      setMessages((current) => {
        const list = current || [];
        const sent = { ...data.message, order: data.order };
        return list.some((m) => m.id === sent.id) ? list : [...list, sent];
      });
      setOrderOpen(false);
      setOrderAmount('');
      setOrderDescription('');
    } catch (e) {
      logError(e);
      setOrderError(e.message || 'Could not create the order. Please try again.');
    } finally {
      setOrderSaving(false);
    }
  }

  // Voice notes: hold the mic to record, release to send, slide left to cancel
  async function sendVoice(blob) {
    const ext = blob.type.includes('mp4') ? 'm4a' : 'webm';
    const voice = new File([blob], `voice-note-${Date.now()}.${ext}`, { type: blob.type || 'audio/webm' });
    setSending(true);
    setError('');
    try {
      const form = new FormData();
      form.append('media', voice);
      if (replyTo) form.append('replyToId', replyTo.id);
      form.append('clientId', newClientId());
      const data = await api(`/v1/messages/with/${userId}/media`, { method: 'POST', body: form });
      const sent = { ...data.message, replyTo: replyTo ? { id: replyTo.id, senderId: replyTo.senderId, body: replyTo.body, mediaKind: replyTo.mediaKind || null, deletedForEveryone: false } : null };
      setMessages((current) => {
        const list = current || [];
        return list.some((m) => m.id === sent.id) ? list : [...list, sent];
      });
      setReplyTo(null);
    } catch (e) {
      logError(e);
      toast(e?.message || 'Voice note not sent. Please try again.');
    } finally {
      setSending(false);
    }
  }

  async function startVoice() {
    if (recorderRef.current || sending || editing) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast('Voice notes are not supported in this browser');
      return;
    }
    // Listen on the window: the composer hides while recording, so the release must not depend on the button
    const onMove = (ev) => { if (ev.clientX - holdRef.current.startX < -80) cancelRecordRef.current = true; };
    const onRelease = (ev) => {
      holdRef.current.active = false;
      window.removeEventListener('pointerup', onRelease);
      window.removeEventListener('pointercancel', onRelease);
      window.removeEventListener('pointermove', onMove);
      if (ev.type === 'pointercancel') cancelRecordRef.current = true;
      stopVoice(false);
    };
    window.addEventListener('pointerup', onRelease);
    window.addEventListener('pointercancel', onRelease);
    window.addEventListener('pointermove', onMove);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
      const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      chunksRef.current = [];
      cancelRecordRef.current = false;
      recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        window.removeEventListener('pointerup', onRelease);
        window.removeEventListener('pointercancel', onRelease);
        window.removeEventListener('pointermove', onMove);
        stream.getTracks().forEach((track) => track.stop());
        clearInterval(recordTimerRef.current);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const cancelled = cancelRecordRef.current;
        chunksRef.current = [];
        recorderRef.current = null;
        setRecording(false);
        if (!cancelled && blob.size > 0) sendVoice(blob);
      };
      recorderRef.current = recorder;
      setRecordSeconds(0);
      setRecording(true);
      recorder.start();
      recordTimerRef.current = setInterval(() => setRecordSeconds((n) => n + 1), 1000);
      // The finger may have lifted while the microphone was starting
      if (!holdRef.current.active) recorder.stop();
    } catch (e) {
      window.removeEventListener('pointerup', onRelease);
      window.removeEventListener('pointercancel', onRelease);
      window.removeEventListener('pointermove', onMove);
      logError(e);
      const denied = e?.name === 'NotAllowedError' || e?.name === 'SecurityError';
      toast(denied ? 'Microphone access is blocked. Allow it for this site to record a voice note.'
        : e?.name === 'NotFoundError' ? 'No microphone was found on this device.'
          : 'Could not start the voice note. Please try again.');
    }
  }

  function stopVoice(cancel) {
    if (cancel) cancelRecordRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }

  async function send(event) {
    event.preventDefault();
    const body = text.trim();
    if ((!body && !file) || sending) return;
    setSending(true);
    setError('');
    try {
      if (editing) {
        const sealed = await sealFor(userId, body);
        const data = await api(`/v1/messages/message/${editing.id}`, { method: 'PATCH', body: { body: sealed } });
        setMessages((current) => (current || []).map((m) => (m.id === editing.id ? { ...m, ...data.message, body } : m)));
        setEditing(null);
        setText('');
        return;
      }
      let data;
      if (file) {
        const form = new FormData();
        let toSend = file;
        const photo = kindOfFile(file) === 'photo';
        if (photo && editorRef.current) {
          const blob = await editorRef.current.compose();
          toSend = await fitImage(new File([blob], `photo-${Date.now()}.jpg`, { type: 'image/jpeg' }), 0.82);
        }
        form.append('media', toSend);
        if (photo && edit.viewLimit) form.append('viewLimit', String(edit.viewLimit));
        if (body) form.append('body', body);
        if (replyTo) form.append('replyToId', replyTo.id);
        if (ephemeral) form.append('ephemeral', ephemeral);
        form.append('clientId', newClientId());
        data = await api(`/v1/messages/with/${userId}/media`, { method: 'POST', body: form });
      } else {
        const sealed = await sealFor(userId, body);
        const clientId = (globalThis.crypto?.randomUUID?.() || `c${Date.now()}${Math.random().toString(36).slice(2)}`).replace(/-/g, '').slice(0, 64);
        data = await api(`/v1/messages/with/${userId}`, { method: 'POST', body: { body: sealed, replyToId: replyTo?.id, clientId, ephemeral } });
      }
      if (!file) rememberPlain(data.message.id, body);
      const sent = { ...data.message, ...(file ? {} : { body }), replyTo: replyTo ? { id: replyTo.id, senderId: replyTo.senderId, body: replyTo.body, mediaKind: replyTo.mediaKind || null, deletedForEveryone: false } : null };
      setMessages((current) => {
        const list = current || [];
        return list.some((m) => m.id === sent.id) ? list : [...list, sent];
      });
      setText('');
      setFile(null);
      setReplyTo(null);
    } catch (e) {
      setError(e.message || 'Could not send');
      logError(e);
      toast(`Message not sent${e.status ? ` (error ${e.status})` : ' (no connection)'}. Tap Send to try again.`);
    } finally {
      setSending(false);
    }
  }

  function openMessageMenu(message, rect) { setMenuAnchor(rect || null); setMenuFor(message); }

  // Actions for a message: menu sheet
  function canEdit(m) {
    return m && String(m.senderId) === String(me?.id) && !m.deletedForEveryone && !m.mediaUrl && Date.now() - new Date(m.createdAt).getTime() <= EDIT_WINDOW_MS;
  }
  function canDeleteEveryone(m) {
    return m && String(m.senderId) === String(me?.id) && !m.deletedForEveryone;
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

  async function reportMessage(m) {
    setMenuFor(null);
    const reason = window.prompt('Report reason: Harassment, Hate speech, Threats or violence, Sexual content, Spam or scam, Other');
    if (!reason) return;
    try {
      await api(`/v1/messages/message/${m.id}/report`, { method: 'POST', body: { reason: reason.trim() } });
      toast('Report submitted');
    } catch (e) { toast(e.message || 'Could not submit report'); }
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

  useEffect(() => {
    if (location.state?.openSharedActivity) openSharedActivity();
  }, [location.key]);

  async function deleteConversation() {
    setChatMenu(false);
    if (!(await confirmDialog('Delete this conversation from your inbox? The other person will still have their messages.'))) return;
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
  const subtitle = typing ? 'typing…' : online ? 'Active now' : (partner?.username || '');

  return (
    <main className="dm-convo cv-convo">
      <header className="dm-chead">
        <button type="button" className="dm-icon" onClick={() => navigate('/chat', { replace: true })} aria-label="Back">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
        </button>
        {partner && <Avatar user={partner} size={36} />}
        <span className="cv-head-text">
          <span className="dm-cname">{name}</span>
          {subtitle && <small className={typing ? 'cv-subtitle typing' : 'cv-subtitle'}>{subtitle}</small>}
        </span>
        <button type="button" className="dm-icon cv-head-action" onClick={() => toast('Calls are not available yet')} aria-label="Voice call">
          <svg {...ICON}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" /></svg>
        </button>
        <button type="button" className="dm-icon cv-head-action" onClick={() => toast('Video calls are not available yet')} aria-label="Video call">
          <svg {...ICON}><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>
        </button>
        <button type="button" className="dm-icon cv-head-action" onClick={(e) => { setChatAnchor(e.currentTarget.getBoundingClientRect()); setChatMenu(true); }} aria-label="Chat options">
          <svg {...ICON}><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.5" /></svg>
        </button>
      </header>

      <div className="dm-thread" ref={threadRef}>
        {messages === null ? <p className="dm-empty"></p>
          : messages.length === 0 ? <p className="dm-empty">Say hello to start the conversation.</p>
          : groupRows(messages).map((row) => {
            const mine = String(row.senderId) === String(me?.id);
            if (row.items.length > 1) {
              const lastItem = row.items[row.items.length - 1];
              return (
                <div key={'gallery-' + row.items[0].m.id} className="cv-line">
                  {needsStamp(messages, row.items[0].idx) && <div className="cv-stamp">{stampOf(row.items[0].m.createdAt)}</div>}
                  <div className={mine ? 'cv-gallery mine' : 'cv-gallery'} style={{ gridTemplateColumns: row.items.length === 2 ? '1fr 1fr' : 'repeat(3, 1fr)' }}>
                    {row.items.map(({ m }) => (
                      <div key={m.id} className="cv-gallery-cell"><Attachment message={m} storyAuthorId={null} mine={mine} /></div>
                    ))}
                  </div>
                  {isLastOfRun(messages, lastItem.idx) && <TimeLine message={lastItem.m} mine={mine} />}
                </div>
              );
            }
            const m = row.items[0].m;
            const i = row.items[0].idx;
            return (
              <div key={m.id} className="cv-line">
                {needsStamp(messages, i) && <div className="cv-stamp">{stampOf(m.createdAt)}</div>}
                <MessageRow message={m} mine={mine} onReply={startReply} onOpenMenu={openMessageMenu}>
                  <Bubble message={m} mine={mine} />
                </MessageRow>
                {isLastOfRun(messages, i) && <TimeLine message={m} mine={mine} />}
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

      {recording && (
        <div className="cv-recording" role="status" aria-live="polite">
          <span className="cv-rec-dot" aria-hidden="true" />
          <span className="cv-rec-time">{formatClock(recordSeconds)}</span>
          <span className="cv-rec-hint">Slide left to cancel</span>
        </div>
      )}
      {emojiOpen && !recording && (
        <div className="cv-emoji-panel" aria-label="Emoji">
          {EMOJIS.map((emoji) => (
            <button key={emoji} type="button" onClick={() => onTextChange(text + emoji)} aria-label={`Insert ${emoji}`}>{emoji}</button>
          ))}
        </div>
      )}
      {!recording && (
      <form className="dm-input cv-form cv-ig-form" onSubmit={send}>
        {!editing && (
          <button type="button" className={ephemeral ? 'cv-ephemeral on' : 'cv-ephemeral'} onClick={() => setEphemeral((mode) => (mode === null ? 'AFTER_VIEWING' : mode === 'AFTER_VIEWING' ? '24_HOURS' : null))}
            aria-label={ephemeral ? `Disappearing messages: ${ephemeral === '24_HOURS' ? '24 hours' : 'after viewing'}` : 'Disappearing messages: off'}>
            {ephemeral === '24_HOURS' ? '24h' : ephemeral === 'AFTER_VIEWING' ? 'Viewed' : 'Timer'}
          </button>
        )}
        {!editing && (
          <button type="button" className="cv-camera" onClick={() => fileRef.current?.click()} aria-label="Attach photo or video" disabled={sending}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
          </button>
        )}
        <input ref={fileRef} type="file" multiple hidden onChange={pickFile} />
        <input ref={composerRef} enterKeyHint="send" autoComplete="off" value={text} onChange={(e) => onTextChange(e.target.value)} onFocus={() => { [0, 150, 350, 600].forEach((ms) => setTimeout(() => endRef.current?.scrollIntoView({ block: 'end' }), ms)); }} maxLength={2000} placeholder={editing ? 'Edit message' : 'Message...'} aria-label="Message" />
        {(text.trim() || file || editing) ? (
          <button type="submit" className="cv-send-text" onPointerDown={(e) => e.preventDefault()} disabled={(!text.trim() && !file) || sending} aria-label={editing ? 'Save edit' : 'Send'}>{editing ? 'Save' : 'Send'}</button>
        ) : (
          <span className="cv-tools">
            <button
              type="button"
              className="cv-tool"
              aria-label="Hold to record a voice note"
              disabled={sending}
              onContextMenu={(e) => e.preventDefault()}
              onPointerDown={(e) => { holdRef.current = { active: true, startX: e.clientX }; startVoice(); }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4" /></svg>
            </button>
            <button type="button" className="cv-tool" onClick={() => fileRef.current?.click()} aria-label="Photos and videos" disabled={sending}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" /></svg>
            </button>
            <button type="button" className="cv-tool" onClick={() => setEmojiOpen((open) => !open)} aria-label="Emoji" aria-expanded={emojiOpen}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" /></svg>
            </button>
            <button type="button" className="cv-tool" onClick={() => setOrderOpen(true)} aria-label="Create order">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" /></svg>
            </button>
          </span>
        )}
      </form>
      )}

      {menuFor && (
        <ChatMenu
          label="Message options"
          anchor={menuAnchor}
          onClose={() => setMenuFor(null)}
          items={[
            { key: 'reply', label: 'Reply', icon: 'reply', onSelect: () => startReply(menuFor) },
            ...(menuFor.body && !menuFor.deletedForEveryone ? [{ key: 'copy', label: 'Copy', icon: 'copy', onSelect: () => navigator.clipboard?.writeText(menuFor.body).catch(() => {}) }] : []),
            ...(!menuFor.deletedForEveryone ? [{ key: 'forward', label: 'Forward', icon: 'share-2', onSelect: () => openForward(menuFor) }] : []),
            ...(canEdit(menuFor) ? [{ key: 'edit', label: 'Edit', icon: 'pencil', onSelect: () => startEdit(menuFor) }] : []),
            ...(!menuFor.deletedForEveryone ? [{ key: 'delete-me', label: 'Delete for me', icon: 'trash-2', onSelect: () => deleteMessage(menuFor, 'me') }] : []),
            ...(canDeleteEveryone(menuFor) ? [{ key: 'delete-all', label: 'Delete for everyone', icon: 'trash-2', danger: true, onSelect: () => deleteMessage(menuFor, 'everyone') }] : []),
            ...(String(menuFor.senderId) !== String(me?.id) && !menuFor.deletedForEveryone ? [{ key: 'report', label: 'Report message', icon: 'flag', danger: true, onSelect: () => reportMessage(menuFor) }] : []),
          ]}
        />
      )}

      {viewerMedia && !file && (
        <MediaViewer
          media={viewerMedia}
          partner={partner}
          name={name}
          pending={false}
          text={viewerText}
          onText={setViewerText}
          onSend={sendQuick}
          onQuick={sendQuick}
          onClose={() => setViewerMedia(null)}
        />
      )}
      {file && (kindOfFile(file) === 'photo' || kindOfFile(file) === 'video') && previewUrl && (
        <MediaViewer
          media={{ src: previewUrl, kind: kindOfFile(file) }}
          partner={partner}
          name={name}
          pending
          text={text}
          onText={onTextChange}
          onSend={() => send({ preventDefault() {} })}
          onQuick={() => {}}
          sending={sending}
          edit={edit}
          setEdit={setEdit}
          editorRef={editorRef}
          onClose={() => setFile(null)}
        />
      )}
      {orderOpen && (
        <div className="cv-order-backdrop" onClick={() => !orderSaving && setOrderOpen(false)}>
          <form className="cv-order-sheet" role="dialog" aria-modal="true" aria-label="Create order" onClick={(e) => e.stopPropagation()} onSubmit={createOrder}>
            <div className="cv-order-top">
              <button type="button" className="cv-order-close" onClick={() => setOrderOpen(false)} aria-label="Close" disabled={orderSaving}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
              <div className="cv-order-title"><strong>Create order</strong><small>@{partner?.username || name}</small></div>
              <span className="cv-order-spacer" aria-hidden="true" />
            </div>
            <p className="cv-order-lead"><strong>Create an order in chat</strong><span>This helps you track orders easily and share updates with customers directly in chat.</span></p>
            <div className="cv-order-amount-box">
              <label htmlFor="cv-order-amount">
                <span className="cv-order-currency">$</span>
                <input id="cv-order-amount" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0" value={orderAmount} onChange={(e) => { setOrderAmount(e.target.value); setOrderError(''); }} aria-label="Total price in USD" />
              </label>
              <small>Total Price (USD)</small>
            </div>
            {orderError && <div className="cv-order-error" role="alert">{orderError}</div>}
            <input className="cv-order-desc" value={orderDescription} onChange={(e) => setOrderDescription(e.target.value)} maxLength={500} placeholder="Write a description..." aria-label="Description" />
            <button type="submit" className="cv-order-submit" disabled={!(Number(orderAmount) > 0) || orderSaving}>{orderSaving ? 'Creating…' : 'Create order'}</button>
          </form>
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
        <ChatMenu
          label="Chat options"
          title={name}
          anchor={chatAnchor}
          onClose={() => setChatMenu(false)}
          items={[
            { key: 'mute', label: muted ? 'Unmute messages' : 'Mute messages', icon: muted ? 'bell' : 'bell-off', onSelect: toggleMute },
            { key: 'shared', label: 'See shared activity', icon: 'images', onSelect: openSharedActivity },
            { key: 'delete', label: 'Delete conversation', icon: 'trash-2', danger: true, onSelect: deleteConversation },
            { key: 'block', label: `Block ${name}`, icon: 'shield-ban', danger: true, onSelect: blockPerson },
          ]}
        />
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
