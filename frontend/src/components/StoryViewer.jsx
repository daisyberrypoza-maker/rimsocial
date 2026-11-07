import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { mediaUrl } from '../lib/config.js';
import Avatar from './Avatar.jsx';
import { toast } from '../toast.js';

const PHOTO_MS = 5000;

// Full-screen story player. groups: [{ user }]. Photos advance after PHOTO_MS,
// videos advance when they end. Tap left or right to skip.
export default function StoryViewer({ groups, startIndex, onClose }) {
  const [gi, setGi] = useState(startIndex);
  const [si, setSi] = useState(0);
  const [stories, setStories] = useState(null);
  const [progress, setProgress] = useState(0);
  const [resharing, setResharing] = useState(false);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const storyVideoRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const group = groups[gi];
  const current = stories?.[si];

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

  // Reset playback state and record the view for each story shown
  useEffect(() => {
    setProgress(0);
    setPaused(false);
    if (current) api(`/v1/stories/${current.id}/view`, { method: 'POST' }).catch(() => {});
  }, [current?.id]);

  // Pause stories while the app/browser is backgrounded; resume when it returns.
  useEffect(() => {
    const pauseForBackground = () => setPaused(true);
    const resumeOnReturn = () => setPaused(document.visibilityState !== 'visible');
    document.addEventListener('visibilitychange', resumeOnReturn);
    window.addEventListener('pagehide', pauseForBackground);
    window.addEventListener('pageshow', resumeOnReturn);
    return () => {
      document.removeEventListener('visibilitychange', resumeOnReturn);
      window.removeEventListener('pagehide', pauseForBackground);
      window.removeEventListener('pageshow', resumeOnReturn);
    };
  }, []);

  useEffect(() => {
    const video = storyVideoRef.current;
    if (!video) return;
    if (paused || document.visibilityState !== 'visible') video.pause();
    else video.play().catch(() => {});
  }, [paused, current?.id]);

  function togglePlayback() {
    setPaused((value) => !value);
  }

  // Photo timer keeps its progress when paused.
  useEffect(() => {
    if (!current || current.kind !== 'photo' || paused || document.visibilityState !== 'visible') return undefined;
    const started = Date.now() - progress * PHOTO_MS;
    const timer = setInterval(() => {
      const p = (Date.now() - started) / PHOTO_MS;
      if (p >= 1) {
        clearInterval(timer);
        next();
      } else {
        setProgress(p);
      }
    }, 50);
    return () => clearInterval(timer);
  }, [current?.id, current?.kind, next, paused]);

  const total = stories?.length || 0;

  async function reshare() {
    if (!current || resharing) return;
    setResharing(true);
    try {
      await api(`/v1/stories/${current.id}/repost`, { method: 'POST' });
      toast('Story reshared to your public story for 24 hours');
    } catch (e) { toast(e.message); }
    finally { setResharing(false); }
  }

  return (
    <div className="viewer" role="dialog" aria-label={`Stories from ${group.user.username}`}>
      <div className="viewer-bars">
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} className="bar">
            <i style={{ width: i < si ? '100%' : i === si ? `${Math.min(progress, 1) * 100}%` : '0%' }} />
          </div>
        ))}
      </div>

      <div className="viewer-head">
        <Avatar user={group.user} size={34} />
        <span>@{group.user.username}</span>
        <div className="viewer-head-actions"><button className="ghost small" disabled={!current || resharing} onClick={reshare}>{resharing ? 'Sharing…' : 'Reshare'}</button><button className="ghost small" onClick={() => closeRef.current()} aria-label="Close">✕</button></div>
      </div>

      {current ? (
        current.kind === 'video' ? (
          <video
            key={current.id}
            ref={storyVideoRef}
            className="viewer-media"
            src={mediaUrl(current.mediaUrl)}
            autoPlay
            muted={muted}
            playsInline
            onPlay={() => setPaused(false)}
            onPause={() => { if (document.visibilityState === 'visible') setPaused(true); }}
            onEnded={next}
            onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime / (e.currentTarget.duration || 1))}
          />
        ) : (
          <img key={current.id} className="viewer-media" src={mediaUrl(current.mediaUrl)} alt="" />
        )
      ) : (
        <p className="muted center viewer-empty">{stories ? 'No stories' : 'Loading…'}</p>
      )}

      {current?.caption && <p className="viewer-caption">{current.caption}</p>}

      <div className="story-playback-controls">
        <button type="button" className="story-control" onClick={prev} aria-label="Previous story">‹</button>
        <button type="button" className="story-control story-control-main" onClick={togglePlayback} aria-label={paused ? 'Play story' : 'Pause story'}>{paused ? '▶' : 'Ⅱ'}</button>
        <button type="button" className="story-control" onClick={next} aria-label="Next story">›</button>
        {current?.kind === 'video' && <button type="button" className="story-control story-control-volume" onClick={() => setMuted((value) => !value)} aria-label={muted ? 'Turn sound on' : 'Mute story'}>{muted ? '🔇' : '🔊'}</button>}
      </div>
      <button className="tap tap-prev" aria-label="Previous story" onClick={prev} />
      <button className="tap tap-next" aria-label="Next story" onClick={next} />
      <button className="story-center-toggle" type="button" aria-label={paused ? 'Play story' : 'Pause story'} onClick={togglePlayback}>{paused ? '▶' : 'Ⅱ'}</button>
    </div>
  );
}
