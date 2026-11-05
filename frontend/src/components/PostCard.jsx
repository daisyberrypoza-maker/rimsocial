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

// active: true only for the post on screen. Only that post loads its video.
export default function PostCard({ post, active }) {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const [likes, setLikes] = useState(post.likeCount);
  const [liked, setLiked] = useState(Boolean(post.isLiked));
  const [showGifts, setShowGifts] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [reposting, setReposting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api(`/v1/posts/${post.id}/like`).then((r) => {
      if (!cancelled) { setLikes(r.likeCount); setLiked(Boolean(r.liked)); }
    }).catch(() => {});
    return () => { cancelled = true; };
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
    const wasLiked = liked;
    setLiked(!wasLiked);
    setLikes((n) => Math.max(0, n + (wasLiked ? -1 : 1)));
    try {
      const r = await api(`/v1/posts/${post.id}/like`, { method: wasLiked ? 'DELETE' : 'POST' });
      setLikes(r.likeCount);
      setLiked(Boolean(r.liked));
    } catch (err) {
      setLiked(wasLiked);
      setLikes((n) => Math.max(0, n + (wasLiked ? 1 : -1)));
      toast(err.message);
    }
  }

  async function share() {
    const url = `${location.origin}/u/${username}`;
    try {
      if (navigator.share) await navigator.share({ title: 'RimSocial', text: post.caption || `Post by @${username}`, url });
      else {
        await navigator.clipboard.writeText(url);
        toast('Link copied');
      }
    } catch { /* user cancelled sharing */ }
  }

  async function repost() {
    if (reposting) return;
    setReposting(true);
    try {
      await api(`/v1/posts/${post.id}/repost`, { method: 'POST' });
      toast('Reposted to your followers');
      setShowMenu(false);
    } catch (err) { toast(err.message); }
    finally { setReposting(false); }
  }

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
        <button className={`rail-btn ${liked ? 'on' : ''}`} onClick={like}>
          <Icon name="heart" />
          <span>{formatCount(likes)}</span>
        </button>
        <button className="rail-btn" onClick={() => setShowGifts(true)}>
          <Icon name="gift" />
          <span>Gift</span>
        </button>
        <button className="rail-btn" onClick={repost} disabled={reposting}>
          <Icon name="share" />
          <span>{reposting ? '…' : 'Repost'}</span>
        </button>
        <button className="rail-btn" onClick={() => setShowMenu((v) => !v)} aria-label="Post options" aria-expanded={showMenu}>
          <span className="post-more-icon">•••</span><span>More</span>
        </button>
      </aside>

      {showMenu && <div className="post-menu" role="menu">
        <button type="button" onClick={share}>Share link…</button>
        <button type="button" onClick={repost} disabled={reposting}>{reposting ? 'Reposting…' : 'Repost to followers'}</button>
        <button type="button" onClick={() => { setShowMenu(false); toast('Report flow will be available when moderation tools are enabled.'); }}>Report post</button>
        <button type="button" onClick={() => setShowMenu(false)}>Cancel</button>
      </div>}

      <div className="info">
        <div className="author">@{username}</div>
        {post.caption && <Caption text={post.caption} onHashtag={(tag) => { navigate(`/explore?q=${encodeURIComponent(`#${tag}`)}`); }} />}
        <div className="meta-row">{formatCount(post.viewCount)} views</div>
        <button className="view-profile" onClick={() => navigate(`/u/${username}`)}>View Profile</button>
      </div>

      {showGifts && <GiftSheet post={post} onClose={() => setShowGifts(false)} />}
    </article>
  );
}
