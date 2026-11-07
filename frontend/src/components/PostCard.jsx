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
  const [repostCount, setRepostCount] = useState(post.repostCount || 0);
  const [showGifts, setShowGifts] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [repostBusy, setRepostBusy] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(Boolean(active));
  const [videoMuted, setVideoMuted] = useState(true);
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
    if (active && document.visibilityState === 'visible') {
      video.play().then(() => setVideoPlaying(true)).catch(() => setVideoPlaying(false));
    } else {
      video.pause();
      setVideoPlaying(false);
    }
  }, [active, post.id]);

  // Never keep feed audio/video running while the browser/app is backgrounded.
  useEffect(() => {
    const syncPlayback = () => {
      const video = videoRef.current;
      if (!video) return;
      if (document.visibilityState !== 'visible') {
        video.pause();
        setVideoPlaying(false);
      } else if (active) {
        video.play().then(() => setVideoPlaying(true)).catch(() => setVideoPlaying(false));
      }
    };
    document.addEventListener('visibilitychange', syncPlayback);
    window.addEventListener('pagehide', syncPlayback);
    window.addEventListener('pageshow', syncPlayback);
    return () => {
      document.removeEventListener('visibilitychange', syncPlayback);
      window.removeEventListener('pagehide', syncPlayback);
      window.removeEventListener('pageshow', syncPlayback);
    };
  }, [active, post.id]);

  function toggleVideoPlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play().then(() => setVideoPlaying(true)).catch(() => setVideoPlaying(false));
    } else {
      video.pause();
      setVideoPlaying(false);
    }
  }

  function seekVideo(seconds) {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
  }

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
    } catch (err) { toast(err.message); }
    finally { setRepostBusy(false); }
  }

  const isFollowingAuthor = Boolean(post.author?.isFollowing ?? post.author?.following ?? post.isFollowingAuthor ?? post.isFollowing);

  return <article className="post" data-id={post.id}>
    {post.kind === 'video' ? <>
      <video ref={videoRef} src={active ? src : undefined} poster={poster} loop muted={videoMuted} playsInline preload={active ? 'auto' : 'none'} onClick={toggleVideoPlayback} onPlay={() => setVideoPlaying(true)} onPause={() => setVideoPlaying(false)} />
      <div className="post-video-controls" aria-label="Video controls">
        <button type="button" className="post-video-control" onClick={(e) => { e.stopPropagation(); seekVideo(-10); }} aria-label="Back 10 seconds">−10</button>
        <button type="button" className="post-video-control post-video-play" onClick={(e) => { e.stopPropagation(); toggleVideoPlayback(); }} aria-label={videoPlaying ? 'Pause video' : 'Play video'}>{videoPlaying ? 'Ⅱ' : '▶'}</button>
        <button type="button" className="post-video-control" onClick={(e) => { e.stopPropagation(); seekVideo(10); }} aria-label="Forward 10 seconds">+10</button>
        <button type="button" className="post-video-control post-video-volume" onClick={(e) => { e.stopPropagation(); setVideoMuted((v) => !v); }} aria-label={videoMuted ? 'Turn sound on' : 'Mute video'}>{videoMuted ? '🔇' : '🔊'}</button>
      </div>
    </> : <img src={src} alt="" loading="lazy" />}
    <div className="shade" />
    <aside className="rail">
      <button className="rail-avatar" onClick={() => navigate(`/u/${username}`)} aria-label={`Open @${username}`}><Avatar user={post.author} size={48} ring /></button>
      <button className={`rail-btn ${liked ? 'liked' : ''}`} onClick={like} disabled={likeBusy} aria-pressed={liked} aria-label={liked ? 'Unlike post' : 'Like post'}>
        <Icon name="heart" /><span>{formatCount(likes)}</span>
      </button>
      <button className="rail-btn" onClick={() => setShowComments(true)} aria-label="Open comments"><Icon name="message-circle" /><span>Comment</span></button>
      <button className={`rail-btn ${reposted ? 'reposted' : ''}`} onClick={repost} disabled={repostBusy} aria-pressed={reposted} aria-label={reposted ? 'Undo repost' : 'Repost'}>
        <Icon name="repeat" /><span>{reposted ? 'Reposted' : 'Repost'}</span>{repostCount > 0 && <small>{formatCount(repostCount)}</small>}
      </button>
      <button className="rail-btn" onClick={() => setShowGifts(true)}><Icon name="gift" /><span>Gift</span></button>
    </aside>
    <div className="info">
      <button className="author author-link" onClick={() => navigate(`/u/${username}`)}>@{username}</button>
      {post.caption && <Caption text={post.caption} onHashtag={(tag) => navigate(`/explore?q=${encodeURIComponent(`#${tag}`)}`)} />}
      <div className="meta-row">{formatCount(post.viewCount)} views</div>
      {!isFollowingAuthor && <button className="view-profile" onClick={() => navigate(`/u/${username}`)}>View Profile</button>}
    </div>
    {showGifts && <GiftSheet post={post} onClose={() => setShowGifts(false)} />}
    {showComments && <CommentsSheet post={post} onClose={() => setShowComments(false)} />}
  </article>;
}
