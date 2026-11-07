import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { mediaUrl, videoStreamUrl } from '../lib/config.js';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import { toast } from '../toast.js';
import { useAppStore } from '../store.js';
import ActionSheet from './ActionSheet.jsx';
import { prefetchMedia, evictMedia, missingItems } from '../lib/prefetch.js';

const PHOTO_MS = 5000;
const SWIPE_PX = 60;
const CLOSE_PX = 120;
const DOUBLE_TAP_MS = 260;
const QUICK_REACTIONS = ['❤️', '😂', '😮', '🔥', '👏', '😢'];
const REPORT_REASONS = ['Spam', 'Harassment or bullying', 'Nudity or sexual content', 'Violence or dangerous content', 'Something else'];

// "14h ago", "3m ago", "now"
function timeAgo(iso) {
  if (!iso) return '';
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// Full-screen story player. groups: [{ user }].
// Tap the left or right third for the previous or next story; tap the middle to pause or play.
// Double-tap anywhere likes the story. Swipe up opens the share sheet, swipe down closes.
// Videos play with sound; photos advance after PHOTO_MS.
export default function StoryViewer({ groups, startIndex, onClose }) {
  const [gi, setGi] = useState(startIndex);
  const [si, setSi] = useState(0);
  const [stories, setStories] = useState(null);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [flash, setFlash] = useState(null);
  const [resharing, setResharing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [reply, setReply] = useState('');
  const [typing, setTyping] = useState(false);
  const me = useAppStore((st) => st.user);
  const navigate = useNavigate();
  const swipeRef = useRef(null);
  const swipedRef = useRef(false);
  const videoRef = useRef(null);
  const activeFillRef = useRef(null);
  const tapRef = useRef({ time: 0, middle: false });
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const group = groups[gi];
  const creatorName = group.user?.displayName || group.user?.username;
  const current = stories?.[si];
  const isVideo = current?.kind === 'video';
  const total = stories?.length || 0;
  const isOwner = Boolean(me?.id) && group.user?.id === me.id;
  // Pauses the story while the viewer is typing or a sheet is open
  const frozen = paused || typing || shareOpen || reportOpen || menuOpen;

  // Show the saved copy at once, then refresh this creator's stories and subscription state
  useEffect(() => {
    let alive = true;
    const saved = useAppStore.getState().storyCache?.[group.user.id];
    setSi(0);
    if (saved) {
      setStories(saved.items);
      setSubscribed(Boolean(saved.isSubscribed));
    } else {
      setStories(null);
    }
    api(`/v1/stories/users/${group.user.id}`)
      .then((d) => {
        if (!alive) return;
        evictMedia(missingItems(saved?.items, d.items));
        setStories(d.items);
        setSubscribed(Boolean(d.isSubscribed));
        useAppStore.getState().setStoryCache(group.user.id, { items: d.items, isSubscribed: Boolean(d.isSubscribed) });
      })
      .catch(() => { if (alive && !saved) setStories([]); });
    return () => { alive = false; };
  }, [group.user.id]);

  // Behind the scenes: warm the next story (and the one after) while this one plays
  // Waits a moment so it never competes with the story on screen.
  useEffect(() => {
    if (!stories) return undefined;
    const item = stories[si + 1];
    if (!item) return undefined;
    const timer = setTimeout(() => {
      prefetchMedia([{
        url: item.kind === 'video' ? videoStreamUrl(mediaUrl(item.mediaUrl)) : mediaUrl(item.mediaUrl),
        kind: item.kind === 'video' ? 'video' : 'image',
      }]);
    }, 0);
    return () => clearTimeout(timer);
  }, [stories, si]);

  const next = useCallback(() => {
    if (!stories) return;
    if (si < stories.length - 1) return setSi(si + 1);
    if (gi < groups.length - 1) return setGi(gi + 1);
    closeRef.current();
  }, [stories, si, gi, groups.length]);

  const prev = useCallback(() => {
    if (si > 0) return setSi(si - 1);
    if (gi > 0) return setGi(gi - 1);
  }, [si, gi]);

  // A creator whose stories all expired is skipped
  useEffect(() => {
    if (stories && stories.length === 0) next();
  }, [stories, next]);

  // Load this story's saved state from this device and record the view.
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('rimsocial:favoriteStories') || '[]');
      setFavorite(Boolean(current && saved.includes(String(current.id))));
    } catch { setFavorite(false); }
  }, [current?.id]);

  // Each story starts fresh and is recorded as viewed
  useEffect(() => {
    setPaused(false);
    setReply('');
    if (!current) return;
    api(`/v1/stories/${current.id}/view`, { method: 'POST' }).catch((error) => {
      if (error.status === 404) dropStory(current.id);
    });
    updateCurrent(current.id, { viewed: true });
  }, [current?.id]);

  // This viewer's ring goes grey once every story from this creator has been watched on this device
  useEffect(() => {
    if (!stories || stories.length === 0 || !stories.every((s) => s.viewed)) return;
    const store = useAppStore.getState();
    const rail = store.storyRail;
    store.setStoryRail({
      ...rail,
      items: (rail.items || []).map((g) => (g.user.id === group.user.id ? { ...g, unseen: false } : g)),
    });
  }, [stories, group.user.id]);

  // Video: one effect decides play or pause from the viewer state. Browsers only allow sound after a tap,
  // so if autoplay with sound is refused the video starts muted and sound comes on at the next tap.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !isVideo) return undefined;
    if (frozen) { v.pause(); return undefined; }
    v.play().catch(() => {
      setMuted(true);
      v.muted = true;
      v.play().catch(() => {});
      const unmute = () => { setMuted(false); v.muted = false; v.play().catch(() => {}); };
      window.addEventListener('pointerdown', unmute, { once: true, capture: true });
    });
    return undefined;
  }, [current?.id, isVideo, frozen]);

  function flashIcon(icon) {
    const key = Date.now();
    setFlash({ icon, key });
    setTimeout(() => setFlash((c) => (c && c.key === key ? null : c)), 600);
  }

  function togglePlay() {
    if (isVideo) {
      const v = videoRef.current;
      if (!v) return;
      if (v.paused) { v.play().catch(() => {}); setPaused(false); flashIcon('play'); }
      else { v.pause(); setPaused(true); flashIcon('pause'); }
    } else {
      setPaused((p) => !p);
      flashIcon(paused ? 'play' : 'pause');
    }
  }

  // Removes a story that is no longer available, along with its media on this device
  function dropStory(id) {
    const gone = stories?.find((item) => item.id === id);
    if (gone) evictMedia([gone]);
    setStories((list) => (list ? list.filter((item) => item.id !== id) : list));
  }

  // Stop playback as soon as the app is minimised or closed; playback resumes only on a tap
  useEffect(() => {
    const onHide = () => { if (document.hidden) setPaused(true); };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  function updateCurrent(id, patch) {
    setStories((list) => (list ? list.map((s) => (s.id === id ? { ...s, ...patch } : s)) : list));
  }

  // Like or unlike the current story. A double-tap only likes, it never unlikes.
  async function toggleLike(onlyLike = false) {
    if (!current || isOwner) return;
    const { id, liked, likeCount } = current;
    if (onlyLike && liked) return;
    const nextLiked = !liked;
    updateCurrent(id, { liked: nextLiked, likeCount: Math.max(0, (likeCount || 0) + (nextLiked ? 1 : -1)) });
    try {
      const r = await api(`/v1/stories/${id}/like`, { method: 'POST' });
      updateCurrent(id, { liked: r.liked, likeCount: r.likeCount });
    } catch (e) {
      updateCurrent(id, { liked, likeCount });
      toast(e.message);
    }
  }

  async function toggleSubscribe() {
    const wanted = !subscribed;
    setSubscribed(wanted);
    try {
      const r = await api(`/v1/stories/users/${group.user.id}/subscribe`, { method: 'PUT', body: { enabled: wanted } });
      setSubscribed(Boolean(r.isSubscribed));
      toast(wanted ? `Subscribed to ${creatorName}` : `Unsubscribed from ${creatorName}`);
    } catch (e) {
      setSubscribed(!wanted);
      toast(e.message);
    }
  }

  // Sends a reply (a chat message to the creator). Quick reactions send their emoji the same way.
  async function sendReply(text) {
    const body = String(text || '').trim();
    if (!body || isOwner) return;
    try {
      await api(`/v1/messages/with/${group.user.id}`, { method: 'POST', body: { body } });
      toast('Sent');
    } catch (e) { toast(e.message); }
  }

  function submitReply() {
    const body = reply;
    setReply('');
    setTyping(false);
    sendReply(body);
  }

  function onQuickReaction(emoji) {
    if (emoji === '❤️') toggleLike(false);
    else sendReply(emoji);
  }

  function openOptions() {
    if (isOwner) setMenuOpen(true);
    else setShareOpen(true);
  }

  function onPointerDown(event) {
    swipeRef.current = { x: event.clientX, y: event.clientY, startedLow: event.clientY > window.innerHeight / 2 };
  }

  function onPointerUp(event) {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dy) <= Math.abs(dx)) return;
    if (start.startedLow && dy < -SWIPE_PX) {
      swipedRef.current = true;
      openOptions();
    } else if (dy > CLOSE_PX) {
      swipedRef.current = true;
      closeRef.current();
    }
  }

  function onStageTap(event) {
    if (swipedRef.current) { swipedRef.current = false; return; }
    if (typing) { setTyping(false); return; }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const now = Date.now();
    const middle = x >= 0.33 && x <= 0.67;
    if (!middle) {
      tapRef.current = { time: 0, middle: false };
      if (x < 0.33) prev(); else next();
      return;
    }
    // Middle tap: pause or play right away. A second middle tap within the window likes the story.
    if (tapRef.current.middle && now - tapRef.current.time < DOUBLE_TAP_MS) {
      tapRef.current = { time: 0, middle: false };
      togglePlay();                       // undo the pause the first tap caused
      flashIcon('heart');
      toggleLike(true);
      return;
    }
    tapRef.current = { time: now, middle: true };
    togglePlay();
  }

  function onVideoTime(event) {
    // Moves the progress bar directly, without re-rendering the viewer
    const d = event.currentTarget.duration;
    if (d > 0 && activeFillRef.current) activeFillRef.current.style.width = `${(event.currentTarget.currentTime / d) * 100}%`;
  }

  async function reshare() {
    if (!current || resharing) return;
    setResharing(true);
    try {
      await api(`/v1/stories/${current.id}/repost`, { method: 'POST' });
      toast('Story remixed to your public story for 24 hours');
    } catch (e) { toast(e.message); }
    finally { setResharing(false); }
  }

  async function reportStory(reason) {
    if (!current) return;
    try {
      await api(`/v1/stories/${current.id}/report`, { method: 'POST', body: { reason } });
      toast('Thanks. We will review this story');
    } catch (e) { toast(e.message); }
  }

  function toggleFavorite() {
    if (!current) return;
    try {
      const saved = JSON.parse(window.localStorage.getItem('rimsocial:favoriteStories') || '[]');
      const id = String(current.id);
      const nextSaved = favorite ? saved.filter((value) => value !== id) : [...new Set([...saved, id])];
      window.localStorage.setItem('rimsocial:favoriteStories', JSON.stringify(nextSaved));
      setFavorite(!favorite);
      toast(favorite ? 'Removed from Favorites on this device' : 'Added to Favorites on this device');
    } catch { toast('Could not update Favorites'); }
  }

  async function blockCreator() {
    if (!group.user?.id || isOwner) return;
    if (!window.confirm(`Block @${group.user.username}? You will no longer see their content.`)) return;
    try {
      await api(`/v1/users/${group.user.id}/block`, { method: 'POST' });
      toast(`@${group.user.username} blocked`);
      closeRef.current();
    } catch (e) { toast(e.message); }
  }

  function shareLocation() {
    if (!navigator.geolocation) { toast('Location sharing is not supported by this device'); return; }
    toast('Requesting location permission…');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => sendReply(`📍 My location: https://maps.google.com/?q=${coords.latitude},${coords.longitude}`),
      () => toast('Location permission was denied or location is unavailable'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }

  async function copyProfileLink() {
    const link = `${window.location.origin}/u/${group.user.username}`;
    try {
      await navigator.clipboard.writeText(link);
      toast('Profile link copied');
    } catch (e) { toast('Could not copy the link'); }
  }

  async function deleteCurrent() {
    if (!current) return;
    if (!window.confirm('Delete this story? This cannot be undone.')) return;
    try {
      await api(`/v1/stories/${current.id}`, { method: 'DELETE' });
      const rest = stories.filter((item) => item.id !== current.id);
      evictMedia([current]);
      setStories(rest);
      setSi((i) => Math.min(i, Math.max(0, rest.length - 1)));
      toast('Story deleted');
    } catch (e) { toast(e.message); }
  }

  return (
    <div className="sv-root" role="dialog" aria-label={`Stories from ${group.user.username}`} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
      <div className="sv-bars">
        {Array.from({ length: total }).map((_, i) => (
          i === si ? (
            <div key={`${i}-${current?.id || ''}`} className="sv-bar">
              <i
                ref={activeFillRef}
                className={isVideo ? 'sv-fill-live' : 'sv-fill-run'}
                style={isVideo ? undefined : { animationPlayState: frozen ? 'paused' : 'running' }}
                onAnimationEnd={(e) => { if (e.animationName === 'sv-fill') next(); }}
              />
            </div>
          ) : (
            <div key={i} className="sv-bar"><i style={{ width: i < si ? '100%' : '0%' }} /></div>
          )
        ))}
      </div>

      <div className="sv-head">
        <button type="button" className="sv-who" aria-label={`Open ${group.user.username}'s profile`} onClick={() => navigate(`/u/${group.user.username}`)}>
          <Avatar user={group.user} size={36} />
          <span className="sv-meta">
            <span className="sv-name">{group.user.displayName || group.user.username}</span>
            <span className="sv-time">{timeAgo(current?.createdAt)}</span>
          </span>
        </button>
        <div className="sv-head-actions">
          {isVideo && (
            <button type="button" className="sv-icon" aria-label={muted ? 'Turn sound on' : 'Mute'} onClick={() => setMuted((m) => !m)}>
              <Icon name={muted ? 'volume-x' : 'volume-2'} size={22} />
            </button>
          )}
          {!isOwner && (
            <button type="button" className={`sv-icon ${subscribed ? 'on' : ''}`} aria-label={subscribed ? 'Unsubscribe' : 'Subscribe'} aria-pressed={subscribed} onClick={toggleSubscribe}>
              <Icon name="bell" size={22} />
            </button>
          )}
          <button type="button" className="sv-icon" aria-label="Story options" disabled={!current} onClick={openOptions}>
            <Icon name="more-vertical" size={26} />
          </button>
        </div>
      </div>

      <div className="sv-stage" onClick={onStageTap}>
        {current ? (
          isVideo ? (
            <video
              key={current.id}
              ref={videoRef}
              className="sv-media"
              src={videoStreamUrl(mediaUrl(current.mediaUrl))}
              playsInline
              muted={muted}
              preload="auto"
              onEnded={next}
              onError={next}
              onTimeUpdate={onVideoTime}
            />
          ) : (
            <img key={current.id} className="sv-media" src={mediaUrl(current.mediaUrl)} alt="" onError={next} />
          )
        ) : (
          <p className="sv-empty">{stories ? 'No stories' : 'Loading…'}</p>
        )}
        {current?.caption && <p className="sv-caption">{current.caption}</p>}
        {flash && <span key={flash.key} className="sv-flash" aria-hidden="true"><Icon name={flash.icon} size={34} /></span>}
        {current?.liked && !flash && <span className="sv-liked-mark" aria-hidden="true"><Icon name="heart" size={16} /></span>}
      </div>

      {current && (
        <div className="sv-footer">
          <span className="sv-sound"><span className="sv-sound-art"><Avatar user={group.user} size={22} /></span>Original sound</span>
          <div className="sv-reply-row">
            {!isOwner && (
              <button type="button" className="sv-cam" aria-label="Open camera" onClick={() => navigate('/upload')}>
                <Avatar user={me} size={46} />
              </button>
            )}
            {isOwner ? (
              <div className="sv-reply sv-views"><Icon name="eye" size={18} /> <span>{current.viewCount || 0} views</span></div>
            ) : (
            <div className="sv-reply">
              <input
                type="text"
                value={reply}
                placeholder={`Reply to ${creatorName}...`}
                aria-label={`Reply to ${group.user.username}`}
                onFocus={() => setTyping(true)}
                onBlur={() => setTyping(false)}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && reply.trim()) submitReply(); }}
                maxLength={2000}
              />
              {!reply.trim() && QUICK_REACTIONS.slice(0, 2).map((emoji) => (
                <button key={emoji} type="button" className="sv-react" aria-label={emoji === '❤️' ? (current.liked ? 'Unlike story' : 'Like story') : `React ${emoji}`} onClick={() => onQuickReaction(emoji)}>{emoji}</button>
              ))}
            </div>
            )}
            {!isOwner && <button type="button" className="sv-sticker" aria-label="Open stickers and reactions" onClick={() => setReactionPickerOpen((open) => !open)}><Icon name="images" size={24} /></button>}
            <button type="button" className="sv-send" aria-label={reply.trim() ? 'Send reply' : 'More options'} onClick={reply.trim() ? submitReply : openOptions}>
              <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3.5 21 12 4 20.5l2.5-8.5z" fill="currentColor" /></svg>
            </button>
          </div>
        </div>
      )}

      {reactionPickerOpen && !shareOpen && <div className="sv-reaction-picker sv-reaction-picker-footer" onClick={(e) => e.stopPropagation()} aria-label="Choose a reaction or sticker">
        {QUICK_REACTIONS.map((emoji) => <button key={emoji} type="button" onClick={() => { setReactionPickerOpen(false); onQuickReaction(emoji); }}>{emoji}</button>)}
      </div>}

      {menuOpen && <ActionSheet
        actions={[{ label: 'Delete story', icon: 'trash', danger: true, onClick: deleteCurrent }]}
        onClose={() => setMenuOpen(false)}
      />}

      {reportOpen && <ActionSheet
        title="Report story"
        actions={REPORT_REASONS.map((reason) => ({ label: reason, icon: 'shield', onClick: () => reportStory(reason) }))}
        onClose={() => setReportOpen(false)}
      />}

      {shareOpen && (
        <div className="sv-share-backdrop" role="presentation" onClick={() => setShareOpen(false)}>
          <div className="sv-share-top" onClick={(e) => e.stopPropagation()}>
            <p className="sv-share-note">{creatorName} can share your reply to their public Story.</p>
            <div className="sv-share-reacts">
              {QUICK_REACTIONS.map((emoji) => (
                <button key={emoji} type="button" aria-label={emoji === '❤️' ? (current?.liked ? 'Unlike story' : 'Like story') : `React ${emoji}`} onClick={() => { setShareOpen(false); onQuickReaction(emoji); }}>{emoji}</button>
              ))}
            </div>
            <div className="sv-share-chat">
              <button type="button" className="sv-share-camera" aria-label="Open camera" onClick={() => { setShareOpen(false); navigate('/upload'); }}><Icon name="camera" size={24} /></button>
              <form className="sv-share-chat-input" onSubmit={(e) => { e.preventDefault(); const value = e.currentTarget.elements.chat.value; setShareOpen(false); sendReply(value); }}>
                <input name="chat" aria-label="Send a chat" placeholder="Send a chat" maxLength={2000} />
              </form>
              <button type="button" aria-label="Reactions" onClick={() => setReactionPickerOpen((open) => !open)}><Icon name="smile" size={27} /></button>
              <button type="button" aria-label="Stickers" onClick={() => setReactionPickerOpen((open) => !open)}><Icon name="images" size={27} /></button>
              <button type="button" aria-label="Share location" onClick={shareLocation}><Icon name="map-pin" size={27} /></button>
            </div>
          </div>
          <section className="sv-share-sheet" role="dialog" aria-label="Story options" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="sv-share-row" disabled={resharing} onClick={() => { setShareOpen(false); reshare(); }}>
              <Icon name="repeat-2" size={22} /><span>Remix Snap</span>
            </button>
            <button type="button" className="sv-share-row" onClick={() => { setShareOpen(false); toggleFavorite(); }}>
              <Icon name={favorite ? 'bookmark-check' : 'bookmark'} size={22} /><span>{favorite ? 'Remove from Favorites' : 'Add to Favorites'}</span>
            </button>
            <button type="button" className="sv-share-row danger" onClick={() => { setShareOpen(false); setReportOpen(true); }}>
              <Icon name="flag" size={22} /><span>Report Snap</span>
            </button>
            <button type="button" className="sv-share-row danger" onClick={() => { setShareOpen(false); blockCreator(); }}>
              <Icon name="ban" size={22} /><span>Block {creatorName}</span>
            </button>
            <button type="button" className="sv-share-row" onClick={() => { setShareOpen(false); copyProfileLink(); }}>
              <Icon name="link" size={22} /><span>Copy Link</span>
            </button>
            <button type="button" className="sv-share-row sv-send-snap" onClick={() => {
              setShareOpen(false);
              const url = `${window.location.origin}/u/${group.user.username}`;
              if (navigator.share) navigator.share({ title: 'RimSocial Story', text: `View ${creatorName}'s story on RimSocial`, url }).catch(() => {});
              else copyProfileLink();
            }}>
              <span>Share Story</span><span className="sv-send-snap-icon"><Icon name="send" size={25} /></span>
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
