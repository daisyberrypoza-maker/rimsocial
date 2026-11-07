import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { mediaUrl } from '../lib/config.js';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import { toast } from '../toast.js';
import { useAppStore } from '../store.js';
import ActionSheet from './ActionSheet.jsx';

const PHOTO_MS = 5000;
const TICK_MS = 100;
const SKIP_SECONDS = 5;
const SWIPE_PX = 60;

// Full-screen story player. groups: [{ user }].
// Tap the left or right third for the previous or next story; tap the middle to pause or play.
// Videos have back/forward 5 seconds, a sound button and a progress bar. Photos advance after PHOTO_MS.
export default function StoryViewer({ groups, startIndex, onClose }) {
  const [gi, setGi] = useState(startIndex);
  const [si, setSi] = useState(0);
  const [stories, setStories] = useState(null);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [flash, setFlash] = useState(null);
  const [resharing, setResharing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const me = useAppStore((st) => st.user);
  const navigate = useNavigate();
  const swipeRef = useRef(null);
  const swipedRef = useRef(false);
  const videoRef = useRef(null);
  const elapsedRef = useRef(0);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const group = groups[gi];
  const current = stories?.[si];
  const isVideo = current?.kind === 'video';
  const total = stories?.length || 0;
  const isOwner = Boolean(me?.id) && group.user?.id === me.id;

  // Load this creator's active stories
  useEffect(() => {
    let alive = true;
    setStories(null);
    setSi(0);
    api(`/v1/stories/users/${group.user.id}`)
      .then((d) => alive && setStories(d.items))
      .catch(() => alive && setStories([]));
    return () => { alive = false; };
  }, [group.user.id]);

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

  // Each story starts fresh and is recorded as viewed
  useEffect(() => {
    setProgress(0);
    elapsedRef.current = 0;
    setPaused(false);
    if (current) api(`/v1/stories/${current.id}/view`, { method: 'POST' }).catch(() => {});
  }, [current?.id]);

  // Video: start playing. Browsers block sound until the viewer is tapped, so if that happens
  // play muted and turn the sound on at the next tap anywhere.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !isVideo) return undefined;
    v.play().catch(() => {
      setMuted(true);
      v.play().catch(() => {});
      const unmute = () => { setMuted(false); v.play().catch(() => {}); };
      window.addEventListener('pointerdown', unmute, { once: true, capture: true });
    });
    return undefined;
  }, [current?.id, isVideo]);

  // Photo timer (pauses with the viewer)
  useEffect(() => {
    if (!current || isVideo) return undefined;
    const timer = setInterval(() => {
      if (paused) return;
      elapsedRef.current += TICK_MS;
      const p = elapsedRef.current / PHOTO_MS;
      if (p >= 1) {
        clearInterval(timer);
        next();
      } else {
        setProgress(p);
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [current?.id, isVideo, paused, next]);

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

  function skip(seconds) {
    const v = videoRef.current;
    if (!v) return;
    const max = Number.isFinite(v.duration) ? v.duration : Infinity;
    v.currentTime = Math.min(max, Math.max(0, v.currentTime + seconds));
  }

  // Swipe up from the lower half of the story opens that person's profile.
  function onPointerDown(event) {
    swipeRef.current = { x: event.clientX, y: event.clientY, startedLow: event.clientY > window.innerHeight / 2 };
  }

  function onPointerUp(event) {
    const start = swipeRef.current;
    swipeRef.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (start.startedLow && dy < -SWIPE_PX && Math.abs(dy) > Math.abs(dx)) {
      swipedRef.current = true;
      navigate(`/u/${group.user.username}`);
    }
  }

  function onStageTap(event) {
    if (swipedRef.current) { swipedRef.current = false; return; }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    if (x < 0.33) prev();
    else if (x > 0.67) next();
    else togglePlay();
  }

  function onVideoTime(event) {
    const d = event.currentTarget.duration;
    if (d > 0) setProgress(event.currentTarget.currentTime / d);
  }

  async function reshare() {
    if (!current || resharing) return;
    setResharing(true);
    try {
      await api(`/v1/stories/${current.id}/repost`, { method: 'POST' });
      toast('Story reshared to your public story for 24 hours');
    } catch (e) { toast(e.message); }
    finally { setResharing(false); }
  }

  async function deleteCurrent() {
    if (!current) return;
    if (!window.confirm('Delete this story? This cannot be undone.')) return;
    try {
      await api(`/v1/stories/${current.id}`, { method: 'DELETE' });
      const rest = stories.filter((item) => item.id !== current.id);
      setStories(rest);
      setSi((i) => Math.min(i, Math.max(0, rest.length - 1)));
      toast('Story deleted');
    } catch (e) { toast(e.message); }
  }

  return (
    <div className="sv-root" role="dialog" aria-label={`Stories from ${group.user.username}`} onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
      <div className="sv-bars">
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} className="sv-bar"><i style={{ width: i < si ? '100%' : i === si ? `${Math.min(progress, 1) * 100}%` : '0%' }} /></div>
        ))}
      </div>

      <div className="sv-head">
        <Avatar user={group.user} size={34} />
        <span className="sv-name">@{group.user.username}</span>
        <div className="sv-head-actions">
          {isVideo && (
            <button type="button" className="sv-icon" aria-label={muted ? 'Turn sound on' : 'Mute'} onClick={() => setMuted((m) => !m)}>
              <Icon name={muted ? 'volume-x' : 'volume-2'} size={20} />
            </button>
          )}
          {isOwner ? <button type="button" className="sv-icon" aria-label="Story options" disabled={!current} onClick={() => setMenuOpen(true)}><Icon name="ellipsis" size={22} /></button>
          : <button type="button" className="sv-pill" disabled={!current || resharing} onClick={reshare}>{resharing ? 'Sharing…' : 'Reshare'}</button>}
          <button type="button" className="sv-icon" aria-label="Close" onClick={() => closeRef.current()}><Icon name="x" size={22} /></button>
        </div>
      </div>

      <div className="sv-stage" onClick={onStageTap}>
        {current ? (
          isVideo ? (
            <video
              key={current.id}
              ref={videoRef}
              className="sv-media"
              src={mediaUrl(current.mediaUrl)}
              playsInline
              muted={muted}
              onEnded={next}
              onTimeUpdate={onVideoTime}
            />
          ) : (
            <img key={current.id} className="sv-media" src={mediaUrl(current.mediaUrl)} alt="" />
          )
        ) : (
          <p className="sv-empty">{stories ? 'No stories' : 'Loading…'}</p>
        )}
        {current?.caption && <p className="sv-caption">{current.caption}</p>}
        {flash && <span key={flash.key} className="sv-flash" aria-hidden="true"><Icon name={flash.icon} size={34} /></span>}
      </div>

      {menuOpen && <ActionSheet
        actions={[{ label: 'Delete story', icon: 'trash', danger: true, onClick: deleteCurrent }]}
        onClose={() => setMenuOpen(false)}
      />}

      {isVideo && (
        <div className="sv-controls">
          <button type="button" className="sv-icon big" aria-label="Back 5 seconds" onClick={() => skip(-SKIP_SECONDS)}><Icon name="skip-back" size={26} /></button>
          <button type="button" className="sv-icon big" aria-label={paused ? 'Play' : 'Pause'} onClick={togglePlay}><Icon name={paused ? 'play' : 'pause'} size={30} /></button>
          <button type="button" className="sv-icon big" aria-label="Forward 5 seconds" onClick={() => skip(SKIP_SECONDS)}><Icon name="skip-forward" size={26} /></button>
        </div>
      )}
    </div>
  );
}
