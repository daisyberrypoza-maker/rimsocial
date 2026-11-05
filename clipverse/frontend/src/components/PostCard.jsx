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
  const [liked, setLiked] = useState(false);
  const [showGifts, setShowGifts] = useState(false);

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
    if (liked) return;
    try {
      const r = await api(`/v1/posts/${post.id}/like`, { method: 'POST' });
      setLikes(r.likeCount);
      setLiked(true);
    } catch (err) {
      toast(err.message);
    }
  }

  async function share() {
    const url = `${location.origin}${location.pathname}#/u/${username}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Clipverse', url });
      else {
        await navigator.clipboard.writeText(url);
        toast('Link copied');
      }
    } catch { /* cancelled */ }
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
        <button className="rail-btn" onClick={share}>
          <Icon name="share" />
          <span>Share</span>
        </button>
      </aside>

      <div className="info">
        <div className="author">@{username}</div>
        {post.caption && <p>{post.caption}</p>}
        <div className="meta-row">{formatCount(post.viewCount)} views</div>
        <button className="view-profile" onClick={() => navigate(`/u/${username}`)}>View Profile</button>
      </div>

      {showGifts && <GiftSheet post={post} onClose={() => setShowGifts(false)} />}
    </article>
  );
}
