import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAppStore } from '../store.js';
import { toast } from '../toast.js';
import { mediaUrl } from '../lib/config.js';
import { formatCount } from '../lib/format.js';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';

// Posts whose view has been counted during this session
const countedViews = new Set();

function Caption({ text, onHashtag }) {
  return <p>{String(text || '').split(/(#[a-zA-Z0-9_]+)/g).map((part, i) =>
    /^#[a-zA-Z0-9_]+$/.test(part)
      ? <button key={i} type="button" className="hashtag-inline" onClick={() => onHashtag(part.slice(1))}>{part}</button>
      : <span key={i}>{part}</span>
  )}</p>;
}

function GiftSheet({ post, onClose }) {
  const gifts = useAppStore((s) => s.gifts);
  const setCoins = useAppStore((s) => s.setCoins);
  const [busy, setBusy] = useState(null);

  async function send(gift) {
    setBusy(gift.id);
    try {
      await api('/v1/gifts', {
        method: 'POST',
        body: { postId: post.id, giftId: gift.id },
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      });
      toast(`Sent ${gift.name}`);
      const { coinBalance } = await api('/v1/wallet');
      setCoins(coinBalance);
      onClose();
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h3>Send a gift</h3>
        <div className="gift-grid">
          {gifts.map((g) => (
            <button key={g.id} className="gift" disabled={busy !== null} onClick={() => send(g)}>
              <span className="gift-name">{g.name}</span>
              <span className="gift-price">{g.coinPrice} coins</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}


function CommentsSheet({ post, onClose, onCount }) {
  const [items, setItems] = useState([]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api(`/v1/posts/${post.id}/comments`).then((r) => { setItems(r.items || []); onCount((r.items || []).length); }).catch((e) => toast(e.message)); }, [post.id, onCount]);
  async function submit(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    try { const item = await api(`/v1/posts/${post.id}/comments`, { method: 'POST', body: { body: body.trim() } }); setItems((prev) => [...prev, item]); onCount((n) => n + 1); setBody(''); }
    catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  return <div className="sheet-backdrop comments-backdrop" onClick={onClose}><section className="sheet comments-sheet" onClick={(e) => e.stopPropagation()}><div className="comments-heading"><h3>Comments</h3><button className="ghost small" type="button" onClick={onClose}>Done</button></div><div className="comments-list">{items.map((item) => <article className="comment-item" key={item.id}><Avatar user={item.author} size={34} /><div><strong>@{item.author?.username || 'user'}</strong><p>{item.body}</p></div></article>)}{!items.length && <p className="muted center">Be the first to comment.</p>}</div><form className="comment-form" onSubmit={submit}><input value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} placeholder="Add a comment…" aria-label="Comment" /><button type="submit" disabled={busy || !body.trim()}>{busy ? '…' : 'Send'}</button></form></section></div>;
}

// active: true only for the post on screen. Only that post loads its video.
export default function PostCard({ post, active }) {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const [likes, setLikes] = useState(post.likeCount);
  const [liked, setLiked] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const [showGifts, setShowGifts] = useState(false);

  useEffect(() => {
    let alive = true;
    api(`/v1/posts/${post.id}/engagement`).then((r) => {
      if (alive) { setLiked(Boolean(r.liked)); setLikes(r.likeCount); setCommentCount(r.commentCount || 0); }
    }).catch(() => {});
    return () => { alive = false; };
  }, [post.id]);

  const username = post.author?.username || 'unknown';
  const src = mediaUrl(post.mediaUrl);
  const poster = mediaUrl(post.thumbUrl) || undefined;

  useEffect(() => {
    if (active && !countedViews.has(post.id)) {
      countedViews.add(post.id);
      api(`/v1/posts/${post.id}/view`, { method: 'POST' }).catch(() => {});
    }
    const video = videoRef.current;
    if (!video) return;
    if (active) video.play().catch(() => {});
    else video.pause();
  }, [active, post.id]);

  async function like() {
    try {
      const r = await api(`/v1/posts/${post.id}/like`, { method: 'POST' });
      setLikes(r.likeCount);
      setLiked(Boolean(r.liked));
    } catch (err) {
      toast(err.message);
    }
  }

  async function share() {
    try {
      const result = await api(`/v1/posts/${post.id}/reshare`, { method: 'POST', body: {} });
      toast(result.created ? 'Post reshared to your profile' : 'You already reshared this post');
    } catch (err) { toast(err.message); }
  }

  async function openComments() { setShowComments(true); }

  return (
    <article className="post" data-id={post.id}>
      {post.kind === 'video' ? (
        <video
          ref={videoRef}
          src={active ? src : undefined}
          poster={poster}
          loop
          muted
          playsInline
          preload={active ? 'auto' : 'none'}
        />
      ) : (
        <img src={src} alt="" loading="lazy" />
      )}
      <div className="shade" />

      <aside className="rail">
        <button className="rail-avatar" onClick={() => navigate(`/u/${username}`)} aria-label={`Open @${username}`}>
          <Avatar user={post.author} size={48} ring />
        </button>
        <button className={`rail-btn ${liked ? 'on' : ''}`} onClick={like} aria-label={liked ? 'Unlike post' : 'Like post'}>
          <Icon name="heart" />
          <span>{formatCount(likes)}</span>
        </button>
        <button className="rail-btn" onClick={openComments} aria-label="View comments"><Icon name="message-circle" /><span>{formatCount(commentCount)}</span></button>
        <button className="rail-btn" onClick={() => setShowGifts(true)}>
          <Icon name="gift" />
          <span>Gift</span>
        </button>
        <button className="rail-btn" onClick={share}>
          <Icon name="share" />
          <span>Share</span>
        </button>
      </aside>

      <div className="info">
        <div className="author">@{username}</div>
        {post.caption && <Caption text={post.caption} onHashtag={(tag) => { navigate(`/explore?q=${encodeURIComponent(`#${tag}`)}`); }} />}
        <div className="meta-row">{formatCount(post.viewCount)} views</div>
        <button className="view-profile" onClick={() => navigate(`/u/${username}`)}>View Profile</button>
      </div>

      {showGifts && <GiftSheet post={post} onClose={() => setShowGifts(false)} />}
      {showComments && <CommentsSheet post={post} onClose={() => setShowComments(false)} onCount={setCommentCount} />}
    </article>
  );
}
