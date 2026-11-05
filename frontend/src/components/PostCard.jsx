import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAppStore } from '../store.js';
import { toast } from '../toast.js';
import { mediaUrl } from '../lib/config.js';
import { formatCount } from '../lib/format.js';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';

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
      await api('/v1/gifts', { method: 'POST', body: { postId: post.id, giftId: gift.id }, headers: { 'Idempotency-Key': crypto.randomUUID() } });
      toast(`Sent ${gift.name}`);
      const { coinBalance } = await api('/v1/wallet');
      setCoins(coinBalance);
      onClose();
    } catch (err) { toast(err.message); }
    finally { setBusy(null); }
  }
  return <div className="sheet-backdrop" onClick={onClose}><div className="sheet" onClick={(e) => e.stopPropagation()}>
    <h3>Send a gift</h3><div className="gift-grid">{gifts.map((g) => <button key={g.id} className="gift" disabled={busy !== null} onClick={() => send(g)}><span className="gift-name">{g.name}</span><span className="gift-price">{g.coinPrice} coins</span></button>)}</div>
  </div></div>;
}

function CommentsSheet({ post, onClose }) {
  const [items, setItems] = useState([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  useEffect(() => {
    let alive = true;
    api(`/v1/posts/${post.id}/comments`).then((r) => { if (alive) setItems(r.items || []); })
      .catch((e) => toast(e.message)).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [post.id]);
  async function submit(e) {
    e.preventDefault();
    if (!body.trim() || sending) return;
    setSending(true);
    try {
      const comment = await api(`/v1/posts/${post.id}/comments`, { method: 'POST', body: { body: body.trim() } });
      setItems((current) => [...current, comment]);
      setBody('');
    } catch (e) { toast(e.message); }
    finally { setSending(false); }
  }
  async function remove(comment) {
    try {
      await api(`/v1/posts/${post.id}/comments/${comment.id}`, { method: 'DELETE' });
      setItems((current) => current.filter((item) => item.id !== comment.id));
    } catch (e) { toast(e.message); }
  }
  return <div className="sheet-backdrop comments-backdrop" onClick={onClose}>
    <section className="sheet comments-sheet" role="dialog" aria-label="Comments" onClick={(e) => e.stopPropagation()}>
      <div className="comments-heading"><h3>Comments</h3><button className="ghost small" onClick={onClose} aria-label="Close comments">✕</button></div>
      <div className="comments-list">{loading ? <p className="muted center">Loading comments…</p> : items.length ? items.map((item) => <article className="comment-row" key={item.id}>
        <Avatar user={item.author} size={34} />
        <div className="comment-copy"><strong>@{item.author?.username || 'user'}</strong><p>{item.body}</p></div>
        {item.isMine && <button className="comment-delete" aria-label="Delete comment" onClick={() => remove(item)}>×</button>}
      </article>) : <p className="muted center">Be the first to comment.</p>}</div>
      <form className="comment-compose" onSubmit={submit}><input aria-label="Write a comment" value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} placeholder="Add a comment…" /><button type="submit" disabled={sending || !body.trim()}>{sending ? '…' : 'Post'}</button></form>
    </section>
  </div>;
}

export default function PostCard({ post, active }) {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const [likes, setLikes] = useState(post.likeCount);
  const [liked, setLiked] = useState(false);
  const [reposted, setReposted] = useState(false);
  const [showRepostSheet, setShowRepostSheet] = useState(false);
  const [repostCount, setRepostCount] = useState(post.repostCount || 0);
  const [showGifts, setShowGifts] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [repostBusy, setRepostBusy] = useState(false);
  const username = post.author?.username || 'unknown';
  const src = mediaUrl(post.mediaUrl);
  const poster = mediaUrl(post.thumbUrl) || undefined;

  useEffect(() => {
    let alive = true;
    api(`/v1/posts/${post.id}/engagement`).then((r) => {
      if (alive) { setLiked(Boolean(r.liked)); setReposted(Boolean(r.reposted)); }
    }).catch(() => {});
    return () => { alive = false; };
  }, [post.id]);

  useEffect(() => {
    if (active && !countedViews.has(post.id)) {
      countedViews.add(post.id);
      api(`/v1/posts/${post.id}/view`, { method: 'POST' }).catch(() => {});
    }
    const video = videoRef.current;
    if (!video) return;
    if (active) video.play().catch(() => {}); else video.pause();
  }, [active, post.id]);

  async function like() {
    if (likeBusy) return;
    setLikeBusy(true);
    try {
      const r = await api(`/v1/posts/${post.id}/like`, { method: 'POST' });
      setLikes(r.likeCount); setLiked(Boolean(r.liked));
    } catch (err) { toast(err.message); }
    finally { setLikeBusy(false); }
  }

  async function repost() {
    if (repostBusy) return;
    setRepostBusy(true);
    try {
      const r = await api(`/v1/posts/${post.id}/repost`, { method: 'POST' });
      setReposted(Boolean(r.reposted)); setRepostCount(r.repostCount);
      toast(r.reposted ? 'Post reposted to your profile' : 'Repost removed');
      return true;
    } catch (err) { toast(err.message); return false; }
    finally { setRepostBusy(false); }
  }

  return <article className="post" data-id={post.id}>
    {post.kind === 'video' ? <video ref={videoRef} src={active ? src : undefined} poster={poster} loop muted playsInline preload={active ? 'auto' : 'none'} />
      : <img src={src} alt="" loading="lazy" />}
    <div className="shade" />
    {post.isSponsored && <div className="sponsored-label">Ad</div>}
    <aside className="rail">
      <button className="rail-avatar" onClick={() => navigate(`/u/${username}`)} aria-label={`Open @${username}`}><Avatar user={post.author} size={48} ring /></button>
      <button className={`rail-btn ${liked ? 'liked' : ''}`} onClick={like} disabled={likeBusy} aria-pressed={liked} aria-label={liked ? 'Unlike post' : 'Like post'}>
        <Icon name="heart" /><span>{formatCount(likes)}</span>
      </button>
      <button className="rail-btn" onClick={() => setShowComments(true)} aria-label="Open comments"><Icon name="message-circle" /><span>Comment</span></button>
      <button className={`rail-btn ${reposted ? 'reposted' : ''}`} onClick={() => setShowRepostSheet(true)} disabled={repostBusy} aria-pressed={reposted} aria-label={reposted ? 'Undo repost' : 'Repost'}>
        <Icon name="repeat" /><span>{reposted ? 'Reposted' : 'Repost'}</span>{repostCount > 0 && <small>{formatCount(repostCount)}</small>}
      </button>
      <button className="rail-btn" onClick={() => setShowGifts(true)}><Icon name="gift" /><span>Gift</span></button>
    </aside>
    <div className="info">
      <button className="author author-link" onClick={() => navigate(`/u/${username}`)}>@{username}</button>
      {post.caption && <Caption text={post.caption} onHashtag={(tag) => navigate(`/explore?q=${encodeURIComponent(`#${tag}`)}`)} />}
      {post.isSponsored ? <>
        <div className="sponsor-copy"><strong>{post.sponsorName}</strong>{post.sponsorDescription && <span>{post.sponsorDescription}</span>}</div>
        {post.sponsorUrl && <a className="sponsor-cta" href={post.sponsorUrl} target="_blank" rel="noopener noreferrer">{post.sponsorCta || 'Shop Now'} <span aria-hidden="true">›</span></a>}
      </> : <>
        <div className="meta-row">{formatCount(post.viewCount)} views</div>
        <button className="view-profile" onClick={() => navigate(`/u/${username}`)}>View Profile</button>
      </>}
    </div>
    {showRepostSheet && <div className="sheet-backdrop repost-backdrop" onClick={() => setShowRepostSheet(false)}>
      <section className="sheet repost-sheet" role="dialog" aria-label="Repost" onClick={(e) => e.stopPropagation()}>
        <div className="people-sheet-handle" />
        <div className="comments-heading"><h3>{reposted ? 'Remove repost?' : 'Repost to your friends'}</h3><button className="icon-button" onClick={() => setShowRepostSheet(false)} aria-label="Close"><Icon name="x" size={20} /></button></div>
        <p className="muted">{reposted ? 'This post will no longer be shared with people who follow you.' : 'Share this video with people who follow you. The original creator and post stay credited.'}</p>
        <div className="repost-preview"><Avatar user={post.author} size={38} /><div><strong>@{username}</strong><small>{post.caption || 'Video post'}</small></div><Icon name="repeat" size={20} /></div>
        <button className={reposted ? 'repost-confirm remove' : 'repost-confirm'} disabled={repostBusy} onClick={async () => { const success = await repost(); if (success) setShowRepostSheet(false); }}>{repostBusy ? 'Please wait…' : reposted ? 'Remove repost' : 'Repost'}</button>
      </section>
    </div>}
    {showGifts && <GiftSheet post={post} onClose={() => setShowGifts(false)} />}
    {showComments && <CommentsSheet post={post} onClose={() => setShowComments(false)} />}
  </article>;
}
