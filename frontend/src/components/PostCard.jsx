import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAppStore } from '../store.js';
import { toast } from '../toast.js';
import { mediaUrl, postShareUrl } from '../lib/config.js';
import { formatCount } from '../lib/format.js';
import Avatar from './Avatar.jsx';

// Sound preference is shared by every video in the feed, like TikTok.
let feedSoundOn = true;

// Starts playback with the shared sound setting; if the browser blocks sound, play muted.
function playVideo(video) {
  video.muted = !feedSoundOn;
  const attempt = video.play();
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
  const activeRef = useRef(false);
  const viewerId = useAppStore((s) => s.user?.id);
  const [soundOn, setSoundOn] = useState(feedSoundOn);
  const [paused, setPaused] = useState(false);
  const [flash, setFlash] = useState(null);
  const [progress, setProgress] = useState(0);
  const [following, setFollowing] = useState(Boolean(post.author?.isFollowing));
  const [followBusy, setFollowBusy] = useState(false);
  const seekingRef = useRef(false);
  const [likes, setLikes] = useState(post.likeCount);
  const [liked, setLiked] = useState(false);
  const pressTimer = useRef(null);
  const [reposted, setReposted] = useState(false);
  const [showRepostSheet, setShowRepostSheet] = useState(false);
  const [repostCount, setRepostCount] = useState(post.repostCount || 0);
  const [showGifts, setShowGifts] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [reportReason, setReportReason] = useState('Spam or misleading');
  const [reporting, setReporting] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [repostBusy, setRepostBusy] = useState(false);
  const username = post.author?.username || 'unknown';
  const src = mediaUrl(post.mediaUrl);
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
    } catch (err) { toast(err.message); }
    finally { setFollowBusy(false); }
  }

  function flashIcon(kind) {
    const key = Date.now();
    setFlash({ kind, key });
    setTimeout(() => setFlash((current) => (current && current.key === key ? null : current)), 600);
  }

  // Left and right thirds skip 10 seconds; the middle toggles play and pause.
  function onMediaTap(event) {
    const video = videoRef.current;
    if (!video) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    if (x < 0.3) {
      video.currentTime = Math.max(0, video.currentTime - 10);
      flashIcon('back');
    } else if (x > 0.7) {
      video.currentTime = Math.min(Number(video.duration) || Infinity, video.currentTime + 10);
      flashIcon('forward');
    } else if (video.paused) {
      playVideo(video);
      flashIcon('play');
    } else {
      video.pause();
      flashIcon('pause');
    }
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
    } catch (err) { toast(err.message); }
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
    } catch (e) { toast(e.message); }
  }

  async function reportPost() {
    if (reporting) return;
    setReporting(true);
    try {
      await api(`/v1/posts/${post.id}/report`, { method: 'POST', body: { reason: reportReason } });
      toast('Report submitted for review'); setShowMenu(false);
    } catch (e) { toast(e.message); }
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
    } catch (err) { toast(err.message); return false; }
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
    {post.kind === 'video' && <div className="post-progress" role="slider" aria-label="Video progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}
      onPointerDown={(e) => { e.stopPropagation(); seekingRef.current = true; e.currentTarget.setPointerCapture(e.pointerId); seekFromPointer(e); }}
      onPointerMove={(e) => { if (seekingRef.current) seekFromPointer(e); }}
      onPointerUp={() => { seekingRef.current = false; }} onPointerCancel={() => { seekingRef.current = false; }}>
      <div className="post-progress-fill" style={{ width: `${progress * 100}%` }} />
    </div>}
    {flash && <span key={flash.key} className="post-flash" aria-hidden="true"><Icon name={{ back: 'skip-back', forward: 'skip-forward', play: 'play', pause: 'pause' }[flash.kind]} size={34} /></span>}
    <div className="shade" />
    {post.aiLabel && <div className="ai-content-label">AI-generated</div>}
    {post.isSponsored && <div className="sponsored-label">Ad</div>}
    <aside className="rail">
      <button className="rail-avatar" onClick={() => navigate(`/u/${username}`)} aria-label={`Open @${username}`}><Avatar user={post.author} size={48} ring /></button>
      <button className={`rail-btn ${liked ? 'liked' : ''}`} onClick={like} disabled={likeBusy} aria-pressed={liked} aria-label={liked ? 'Unlike post' : 'Like post'}>
        <Icon name="heart" /><span>{formatCount(likes)}</span>
      </button>
      <button className={`rail-btn ${reposted ? 'reposted' : ''}`} onClick={() => setShowRepostSheet(true)} disabled={repostBusy} aria-pressed={reposted} aria-label={reposted ? 'Undo repost' : 'Repost'}>
        <Icon name="repeat" />{repostCount > 0 && <small>{formatCount(repostCount)}</small>}
      </button>
      <button className="rail-btn" onClick={() => setShowComments(true)} aria-label="Open comments"><Icon name="message-circle" /></button>
      <button className="rail-btn" onClick={copyPostLink} aria-label="Share post"><Icon name="send" /></button>
      <button className="rail-btn" onClick={() => setShowGifts(true)}><Icon name="gift" /></button>
      {post.kind === 'video' && <button className="rail-btn" onClick={toggleSound} aria-label={soundOn ? 'Mute video' : 'Turn sound on'}><Icon name={soundOn ? 'volume-2' : 'volume-x'} /></button>}
      <button className="rail-btn" onClick={() => setShowMenu(true)} aria-label="More post controls"><span className="post-more-glyph">•••</span></button>
    </aside>
    <div className="info">
      {post.topic && <div className="post-topic"><Icon name="map-pin" size={14} /> {post.topic}</div>}
      <div className="author-row">
        <button className="author-avatar" onClick={() => navigate(`/u/${username}`)} aria-label={`Open @${username}`}><Avatar user={post.author} size={32} ring /></button>
        <button className="author author-link" onClick={() => navigate(`/u/${username}`)}>@{username}</button>
        {post.author?.isCreator && <Icon name="badge-check" size={15} />}
        {!post.isSponsored && !following && post.author?.id !== viewerId && <button className="view-profile" onClick={followAuthor} disabled={followBusy}>Follow</button>}
      </div>
      {post.caption && <Caption text={post.caption} onHashtag={(tag) => navigate(`/explore?q=${encodeURIComponent(`#${tag}`)}`)} onMention={(name) => navigate(`/u/${encodeURIComponent(name)}`)} />}
      {post.isSponsored ? <>
        <div className="sponsor-copy"><strong>{post.sponsorName}</strong>{post.sponsorDescription && <span>{post.sponsorDescription}</span>}</div>
        {post.sponsorUrl && <a className="sponsor-cta" href={post.sponsorUrl} target="_blank" rel="noopener noreferrer">{post.sponsorCta || 'Shop Now'} <span aria-hidden="true">›</span></a>}
      </> : <>
        <div className="meta-row">{formatCount(post.viewCount)} views</div>
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
    {showMenu && <div className="sheet-backdrop post-menu-backdrop" onClick={() => setShowMenu(false)}>
      <section className="sheet post-menu-sheet" role="dialog" aria-label="Post controls" onClick={(e) => e.stopPropagation()}>
        <div className="people-sheet-handle" />
        <div className="comments-heading"><h3>Post options</h3><button className="icon-button" onClick={() => setShowMenu(false)} aria-label="Close menu">✕</button></div>
        {post.allowRemix && <button className="post-menu-item" onClick={() => { setShowMenu(false); navigate(`/upload?remix=${post.id}`); }}>Remix this post</button>}
        <button className="post-menu-item" onClick={blockCreator}>Block @{username}</button>
        <label className="post-report-reason">Report reason
          <select value={reportReason} onChange={(e) => setReportReason(e.target.value)}>
            <option>Spam or misleading</option><option>Harassment or bullying</option><option>Hate or harmful content</option><option>Violence or dangerous acts</option><option>Copyright concern</option><option>Other</option>
          </select>
        </label>
        <button className="post-menu-item" onClick={reportPost} disabled={reporting}>{reporting ? "Submitting report…" : "Report post"}</button>
        <button className="post-menu-item" onClick={() => { setShowMenu(false); setShowRepostSheet(true); }}><Icon name="repeat" size={18} /> {reposted ? 'Undo repost' : 'Repost'}</button>
        <button className="post-menu-item" onClick={async () => { setHidden(true); setShowMenu(false); try { await api('/v1/feed/feedback', { method: 'POST', body: { postId: post.id, event: 'not_interested' } }); toast('You will see fewer posts like this'); } catch { toast('Post hidden. Recommendation feedback could not be saved.'); } }}>Hide post</button>
        <button className="post-menu-item" onClick={copyPostLink}>Copy link</button>
        <button className="post-menu-item" onClick={sharePost}><Icon name="share-2" size={18} /> Share to other apps</button>
      </section>
    </div>}
    {showShare && <ShareOptions url={postShareUrl(post.id)} title={`Post by @${username} on RimSocial`} text={post.caption || 'View this post on RimSocial'} onClose={() => setShowShare(false)} />}
    {showGifts && <GiftSheet post={post} onClose={() => setShowGifts(false)} />}
    {showComments && <CommentsSheet post={post} onClose={() => setShowComments(false)} />}
  </article>;
}
