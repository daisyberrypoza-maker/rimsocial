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

  // Reset progress and record the view for each story shown
  useEffect(() => {
    setProgress(0);
    if (current) api(`/v1/stories/${current.id}/view`, { method: 'POST' }).catch(() => {});
  }, [current?.id]);

  // Photo timer
  useEffect(() => {
    if (!current || current.kind !== 'photo') return undefined;
    const started = Date.now();
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
  }, [current?.id, current?.kind, next]);

  const total = stories?.length || 0;

  async function reshareStory() {
    if (!current || resharing) return;
    setResharing(true);
    try { await api(`/v1/stories/${current.id}/reshare`, { method: 'POST', body: {} }); toast('Story reshared to your public story'); }
    catch (e) { toast(e.message); } finally { setResharing(false); }
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
        {current && <button className="ghost small" disabled={resharing} onClick={reshareStory}>{resharing ? 'Sharing…' : 'Reshare'}</button>}
        <button className="ghost small" onClick={() => closeRef.current()} aria-label="Close">✕</button>
      </div>

      {current ? (
        current.kind === 'video' ? (
          <video
            key={current.id}
            className="viewer-media"
            src={mediaUrl(current.mediaUrl)}
            autoPlay
            playsInline
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

      <button className="tap tap-prev" aria-label="Previous story" onClick={prev} />
      <button className="tap tap-next" aria-label="Next story" onClick={next} />
    </div>
  );
}
