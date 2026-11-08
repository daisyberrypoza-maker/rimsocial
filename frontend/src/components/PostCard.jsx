import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAppStore } from '../store.js';
import { toast } from '../toast.js';
import { mediaUrl, postShareUrl, videoStreamUrl } from '../lib/config.js';
import { startWhenReady } from '../lib/playVideo.js';
import { formatCount } from '../lib/format.js';
import Avatar from './Avatar.jsx';

// Sound preference is shared by every video in the feed, like TikTok.
let feedSoundOn = true;

// Starts playback with the shared sound setting; if the browser blocks sound, play muted.
// Short relative time for comments: 5m, 3h, 2d, 4w.
function timeAgo(iso) {
  if (!iso) return '';
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'Now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return `${Math.floor(seconds / 604800)}w`;
}

function playVideo(video) {
  video.muted = !feedSoundOn;
  const attempt = startWhenReady(video);
  if (attempt && attempt.catch) attempt.catch(() => {
    video.muted = true;
    video.play().catch(() => {});
    // Browsers only allow sound after a tap on the page, so turn it on at the first tap anywhere.
    const unmute = () => { if (!feedSoundOn) return; video.muted = false; video.play().catch(() => {}); };
    window.addEventListener('pointerdown', unmute, { once: true, capture: true });
  });
}
import Icon from './Icon.jsx';
import ShareOptions from './ShareOptions.jsx';
import ShareSheet from './ShareSheet.jsx';
import PostOptionsSheet from './PostOptionsSheet.jsx';
import { logError } from '../toast.js';

const countedViews = new Set();

function Caption({ text, onHashtag, onMention }) {
  return <p>{String(text || '').split(/(#[a-zA-Z0-9_]+|@[a-zA-Z0-9_.]+)/g).map((part, i) =>
    /^#[a-zA-Z0-9_]+$/.test(part)
      ? <button key={i} type="button" className="hashtag-inline" onClick={() => onHashtag(part.slice(1))}>{part}</button>
      : /^@[a-zA-Z0-9_.]+$/.test(part)
        ? <button key={i} type="button" className="mention-inline" onClick={() => onMention(part.slice(1))}>{part}</button>
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
    } catch (err) { logError(err); }
    finally { setBusy(null); }
  }
  return <div className="sheet-backdrop" onClick={onClose}><div className="sheet" onClick={(e) => e.stopPropagation()}>
    <h3>Send a gift</h3><div className="gift-grid">{gifts.map((g) => <button key={g.id} className="gift" disabled={busy !== null} onClick={() => send(g)}><span className="gift-name">{g.name}</span><span className="gift-price">{g.coinPrice} coins</span></button>)}</div>
  </div></div>;
}

function CommentsSheet({ post, onClose }) {
  const me = useAppStore((st) => st.user);
  const [items, setItems] = useState([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  useEffect(() => {
    let alive = true;
    api(`/v1/posts/${post.id}/comments`).then((r) => { if (alive) setItems(r.items || []); })
      .catch((e) => logError(e)).finally(() => { if (alive) setLoading(false); });
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
    } catch (e) { logError(e); }
    finally { setSending(false); }
  }
  async function remove(comment) {
    try {
      await api(`/v1/posts/${post.id}/comments/${comment.id}`, { method: 'DELETE' });
      setItems((current) => current.filter((item) => item.id !== comment.id));
    } catch (e) { logError(e); }
  }
  const username = post.author?.username || 'creator';
  const emojis = ['❤️', '😍', '😂', '😭', '🔥', '🙏', '😊'];
  return <div className="rv-sheet-backdrop" onClick={onClose}>
    <section className="rv-sheet" role="dialog" aria-label="Comments" onClick={(e) => e.stopPropagation()}>
      <div className="rv-handle" aria-hidden="true" />
      <header className="rv-sheet-head"><strong>Comments</strong></header>
      <div className="rv-comments">
        {loading ? <p className="rv-empty"></p> : items.length ? items.map((item) => <div className="rv-comment" key={item.id}>
          <Avatar user={item.author} size={40} />
          <div className="rv-comment-body">
            <div className="rv-name-line"><strong className="rv-name">{item.author?.username || 'user'}</strong><span className="rv-time">· {timeAgo(item.createdAt)}</span></div>
            <p>{item.body}</p>
            {item.isMine && <button type="button" className="rv-delete" onClick={() => remove(item)}>Delete</button>}
          </div>
        </div>) : <p className="rv-empty">No comments yet.<br />Start the conversation.</p>}
      </div>
      <div className="rv-emojis" role="group" aria-label="Quick reactions">
        {emojis.map((emoji) => <button type="button" key={emoji} onClick={() => setBody((current) => current + emoji)} aria-label={`Add ${emoji}`}>{emoji}</button>)}
      </div>
      <form className="rv-compose" onSubmit={submit}>
        <Avatar user={me || {}} size={36} />
        <input aria-label="Add a comment" value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} placeholder="Add a comment…" />
        {body.trim() && <button type="submit" disabled={sending}>{sending ? '…' : 'Post'}</button>}
      </form>
    </section>
  </div>;
}

export default function PostCard({ post, active }) {
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const activeRef = useRef(false);
  const viewerId = useAppStore((s) => s.user?.id);
  const isOwnPost = viewerId != null && post.author?.id != null && String(viewerId) === String(post.author.id);
  const [soundOn, setSoundOn] = useState(feedSoundOn);
  const [paused, setPaused] = useState(false);
  const [flash, setFlash] = useState(null);
  const [progress, setProgress] = useState(0);
  const [following, setFollowing] = useState(Boolean(post.author?.isFollowing));
  const [followBusy, setFollowBusy] = useState(false);
  const seekingRef = useRef(false);
  const lastTapRef = useRef({ t: 0, side: null });
  const tapTimerRef = useRef(null);
  const [likes, setLikes] = useState(post.likeCount);
  const [liked, setLiked] = useState(false);
  const pressTimer = useRef(null);
  const [reposted, setReposted] = useState(false);
  const [showRepostSheet, setShowRepostSheet] = useState(false);
  const [repostCount, setRepostCount] = useState(post.repostCount || 0);
  const [showGifts, setShowGifts] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [reportReason, setReportReason] = useState('Spam or misleading');
  const [reporting, setReporting] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [repostBusy, setRepostBusy] = useState(false);
  const username = post.author?.username || 'unknown';
  const src = post.kind === 'video' ? videoStreamUrl(mediaUrl(post.mediaUrl)) : mediaUrl(post.mediaUrl);
  const poster = mediaUrl(post.thumbUrl) || undefined;

  // Pause when the app is hidden (closed or switched away) and resume when it is shown again.
  useEffect(() => {
    let resumeOnShow = false;
    function onVisibility() {
      const video = videoRef.current;
      if (!video) return;
      if (document.hidden) {
        resumeOnShow = !video.paused;
        video.pause();
      } else if (resumeOnShow && activeRef.current) {
        resumeOnShow = false;
        playVideo(video);
      }
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  function toggleSound() {
    feedSoundOn = !feedSoundOn;
    setSoundOn(feedSoundOn);
    if (videoRef.current) videoRef.current.muted = !feedSoundOn;
  }

  // Drag or tap the bottom progress bar to seek.
  function seekFromPointer(event) {
    const video = videoRef.current;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    if (video && Number.isFinite(video.duration) && video.duration > 0) {
      video.currentTime = ratio * video.duration;
      setProgress(ratio);
    }
  }

  async function followAuthor() {
    if (followBusy || !post.author?.id) return;
    setFollowBusy(true);
    try {
      const r = await api(`/v1/users/${post.author.id}/follow`, { method: 'POST' });
      setFollowing(Boolean(r.isFollowing ?? true));
    } catch (err) { logError(err); }
    finally { setFollowBusy(false); }
  }

  function flashIcon(kind) {
    const key = Date.now();
    setFlash({ kind, key });
    setTimeout(() => setFlash((current) => (current && current.key === key ? null : current)), 600);
  }

  // Left and right thirds skip 10 seconds; the middle toggles play and pause.
  // Single tap plays or pauses. Double tap the left or right side to go back or forward 10 seconds.
  function onMediaTap(event) {
    const video = videoRef.current;
    if (!video) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const side = x < 0.35 ? 'back' : x > 0.65 ? 'forward' : 'middle';
    const now = Date.now();
    const last = lastTapRef.current;
    // Double tap the middle: like the post once (never unlike), with a heart. The like button still toggles.
    if (side === 'middle' && last.side === 'middle' && now - last.t < 320) {
      clearTimeout(tapTimerRef.current);
      lastTapRef.current = { t: 0, side: null };
      if (!liked) like();
      flashIcon('heart');
      return;
    }
    if (side !== 'middle' && side === last.side && now - last.t < 320) {
      clearTimeout(tapTimerRef.current);
      lastTapRef.current = { t: 0, side: null };
      if (side === 'back') video.currentTime = Math.max(0, video.currentTime - 10);
      else video.currentTime = Math.min(Number(video.duration) || Infinity, video.currentTime + 10);
      flashIcon(side);
      return;
    }
    lastTapRef.current = { t: now, side };
    clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => {
      if (video.paused) { playVideo(video); flashIcon('play'); }
      else { video.pause(); flashIcon('pause'); }
    }, 260);
  }

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
    activeRef.current = active;
    if (!video) return;
    if (active) playVideo(video); else video.pause();
    return () => {
      // Send a single watch-time sample when the viewer leaves this post.
      const duration = Number(video.duration);
      const watched = Number(video.currentTime);
      if (duration > 0 && Number.isFinite(duration) && Number.isFinite(watched)) {
        api('/v1/feed/feedback', {
          method: 'POST',
          body: watched < 2
            ? { postId: post.id, event: 'skipped' }
            : { postId: post.id, event: 'watch', watchMs: Math.min(watched, duration) * 1000, durationMs: duration * 1000 },
        }).catch(() => {});
      }
    };
  }, [active, post.id]);

  async function like() {
    if (likeBusy) return;
    setLikeBusy(true);
    try {
      const r = await api(`/v1/posts/${post.id}/like`, { method: 'POST' });
      setLikes(r.likeCount); setLiked(Boolean(r.liked));
      // The like endpoint already updates the recommendation score; do not score this twice.
    } catch (err) { logError(err); }
    finally { setLikeBusy(false); }
  }

  async function copyPostLink() {
    const url = postShareUrl(post.id);
    if (!url) return toast('External sharing needs VITE_PUBLIC_APP_URL set to the public RimSocial website.');
    try { await navigator.clipboard.writeText(url); toast('Post link copied'); setShowMenu(false); }
    catch { toast(url); }
  }

  function sharePost() {
    if (!postShareUrl(post.id)) return toast('External sharing needs VITE_PUBLIC_APP_URL set to the public RimSocial website.');
    setShowMenu(false);
    setShowShare(true);
  }

  async function blockCreator() {
    if (!post.author?.id) return toast('Creator information is unavailable');
    try {
      await api(`/v1/users/${post.author.id}/block`, { method: 'POST' });
      setHidden(true); setShowMenu(false); toast(`@${username} blocked`);
    } catch (e) { logError(e); }
  }

  async function reportPost(reason = reportReason) {
    if (reporting) return;
    setReporting(true);
    try {
      await api(`/v1/posts/${post.id}/report`, { method: 'POST', body: { reason } });
      toast('Report submitted for review'); setShowMenu(false);
    } catch (e) { logError(e); }
    finally { setReporting(false); }
  }
  async function repost() {
    if (repostBusy) return;
    setRepostBusy(true);
    try {
      const r = await api(`/v1/posts/${post.id}/repost`, { method: 'POST' });
      setReposted(Boolean(r.reposted)); setRepostCount(r.repostCount);
      // The repost endpoint already updates the recommendation score; do not score this twice.
      toast(r.reposted ? 'Post reposted to your profile' : 'Repost removed');
      return true;
    } catch (err) { logError(err); return false; }
    finally { setRepostBusy(false); }
  }

  if (hidden) return null;

  function cancelPress() { clearTimeout(pressTimer.current); pressTimer.current = null; }
  function startPress(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target.closest('button,a,input,textarea,select,label,video')) return;
    cancelPress();
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null;
      if (navigator.vibrate) navigator.vibrate(12);
      setShowMenu(true);
    }, 450);
  }
  function longPressContext(event) {
    if (event.target.closest('button,a,input,textarea,select,label,video')) return;
    event.preventDefault();
    setShowMenu(true);
  }
  return <article className="post" data-id={post.id} onPointerDown={startPress} onPointerUp={cancelPress} onPointerLeave={cancelPress} onPointerCancel={cancelPress} onPointerMove={cancelPress} onContextMenu={longPressContext}>
    {post.kind === 'video' ? <video ref={videoRef} src={active ? src : undefined} poster={poster} loop playsInline preload={active ? 'auto' : 'none'} onPause={() => setPaused(true)} onPlay={() => setPaused(false)} onTimeUpdate={(e) => { const d = e.currentTarget.duration; if (!seekingRef.current && d > 0) setProgress(e.currentTarget.currentTime / d); }} />
      : <img src={src} alt="" loading="lazy" />}
    {post.kind === 'video' && <button type="button" className="post-tap-layer" aria-label="Tap the middle to play or pause. Tap the left or right side to go back or forward 10 seconds." onClick={onMediaTap} />}
    {post.kind === 'video' && <input type="range" className="post-seek" min="0" max="1000" step="1" value={Math.round(progress * 1000)} aria-label="Video progress" style={{ '--p': `${progress * 100}%` }}
      onPointerDown={() => { seekingRef.current = true; }} onPointerUp={() => { seekingRef.current = false; }} onPointerCancel={() => { seekingRef.current = false; }}
      onChange={(e) => { const v = videoRef.current; const ratio = Number(e.target.value) / 1000; setProgress(ratio); if (v && Number.isFinite(v.duration)) v.currentTime = ratio * v.duration; }} />}
    {flash && <span key={flash.key} className="post-flash" aria-hidden="true"><Icon name={{ back: 'skip-back', forward: 'skip-forward', play: 'play', pause: 'pause', heart: 'heart' }[flash.kind]} size={34} /></span>}
    <div className="shade" />
    {post.aiLabel && <div className="ai-content-label">AI-generated</div>}
    {post.isSponsored && <div className="sponsored-label">Ad</div>}
    <aside className="rail">
      <div className="snap-avatar">
        <button className="rail-avatar" onClick={() => navigate(`/u/${username}`)} aria-label={`Open @${username}`}><Avatar user={post.author} size={44} /></button>
        {!isOwnPost && !post.isSponsored && !following && post.author?.id !== viewerId && <button className="snap-follow" onClick={followAuthor} disabled={followBusy} aria-label={`Follow @${username}`}>+</button>}
      </div>
      <button className={`rail-btn ${liked ? 'liked' : ''}`} onClick={like} disabled={likeBusy} aria-pressed={liked} aria-label={liked ? 'Unlike post' : 'Like post'}>
        <Icon name="heart" /><span>{formatCount(likes)}</span>
      </button>
      <button className="rail-btn" onClick={() => setShowComments(true)} aria-label="Open comments"><Icon name="message-circle" />{post.commentCount > 0 && <span>{formatCount(post.commentCount)}</span>}</button>
      <button className={`rail-btn repost-btn ${reposted ? 'reposted' : ''}`} onClick={repost} disabled={repostBusy} aria-pressed={reposted} aria-label={reposted ? 'Undo repost' : 'Repost'}>
        <Icon name="repeat" />{repostCount > 0 && <span>{formatCount(repostCount)}</span>}
      </button>
      <button className="rail-btn" onClick={() => setShowSend(true)} aria-label="Share post"><Icon name="send" /></button>
      {post.kind === 'video' && <button className="rail-btn" onClick={toggleSound} aria-label={soundOn ? 'Mute video' : 'Turn sound on'}><Icon name={soundOn ? 'volume-2' : 'volume-x'} /></button>}
      <button className="rail-btn" onClick={() => setShowMenu(true)} aria-label="More post controls"><Icon name="ellipsis" size={26} /></button>
    </aside>
    <div className="info">
      {reposted && <div className="snap-repost-pill"><Icon name="repeat" size={14} /> You reposted</div>}
      <div className="snap-title"><strong>{post.author?.displayName || username}</strong>{post.author?.isCreator && <Icon name="badge-check" size={16} />}</div>
      <div className="snap-sound">♫ Original sound · @{username}</div>
      {post.caption && <Caption text={post.caption} onHashtag={(tag) => navigate(`/explore?q=${encodeURIComponent(`#${tag}`)}`)} onMention={(name) => navigate(`/u/${encodeURIComponent(name)}`)} />}
      {post.isSponsored && <>
        <div className="sponsor-copy"><strong>{post.sponsorName}</strong>{post.sponsorDescription && <span>{post.sponsorDescription}</span>}</div>
        {post.sponsorUrl && <a className="sponsor-cta" href={post.sponsorUrl} target="_blank" rel="noopener noreferrer">{post.sponsorCta || 'Shop Now'} <span aria-hidden="true">›</span></a>}
      </>}
    </div>
    {showMenu && <PostOptionsSheet
      username={username}
      isOwn={isOwnPost}
      reposted={reposted}
      reporting={reporting}
      onClose={() => setShowMenu(false)}
      onRemix={() => { setShowMenu(false); navigate(`/upload?remix=${post.id}`); }}
      onShare={() => { setShowMenu(false); setShowSend(true); }}
      onCopy={() => { setShowMenu(false); copyPostLink(); }}
      onNotInterested={async () => { setHidden(true); setShowMenu(false); try { await api('/v1/feed/feedback', { method: 'POST', body: { postId: post.id, event: 'not_interested' } }); toast('You will see fewer posts like this'); } catch { toast('Post hidden. Recommendation feedback could not be saved.'); } }}
      onBlock={() => { setShowMenu(false); blockCreator(); }}
      onReport={(reason) => { setReportReason(reason); reportPost(reason); }}
      onDelete={async () => { setShowMenu(false); if (!window.confirm('Delete this post? This cannot be undone.')) return; try { await api(`/v1/posts/${post.id}`, { method: 'DELETE' }); setHidden(true); toast('Post deleted'); } catch (e) { logError(e); } }}
    />}
    {showShare && <ShareOptions url={postShareUrl(post.id)} title={`Post by @${username} on RimSocial`} text={post.caption || 'View this post on RimSocial'} onClose={() => setShowShare(false)} />}
    {showGifts && !isOwnPost && <GiftSheet post={post} onClose={() => setShowGifts(false)} />}
    {showComments && <CommentsSheet post={post} onClose={() => setShowComments(false)} />}
    {showSend && <ShareSheet url={postShareUrl(post.id)} caption={post.caption} onClose={() => setShowSend(false)} onCopy={() => { copyPostLink(); setShowSend(false); }} onMore={() => { setShowSend(false); sharePost(); }} />}
  </article>;
}
