import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

// Video with the same controls as the feed: tap to play or pause, drag the bottom bar to seek,
// and a sound button. Starts playing when shown; if the browser blocks sound, it plays muted and
// turns the sound on at the next tap anywhere.
export default function VideoPlayer({ src, poster, className = '' }) {
  const videoRef = useRef(null);
  const seekingRef = useRef(false);
  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return undefined;
    v.play().catch(() => {
      setMuted(true);
      v.play().catch(() => {});
      const unmute = () => { setMuted(false); v.play().catch(() => {}); };
      window.addEventListener('pointerdown', unmute, { once: true, capture: true });
    });
    return undefined;
  }, [src]);

  function flashIcon(icon) {
    const key = Date.now();
    setFlash({ icon, key });
    setTimeout(() => setFlash((c) => (c && c.key === key ? null : c)), 600);
  }

  function toggle() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play().catch(() => {}); flashIcon('play'); }
    else { v.pause(); flashIcon('pause'); }
  }

  function seekFromPointer(event) {
    const v = videoRef.current;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    if (v && Number.isFinite(v.duration) && v.duration > 0) {
      v.currentTime = ratio * v.duration;
      setProgress(ratio);
    }
  }

  return (
    <div className={`vp ${className}`}>
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        playsInline
        loop
        autoPlay
        muted={muted}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onTimeUpdate={(e) => { const d = e.currentTarget.duration; if (!seekingRef.current && d > 0) setProgress(e.currentTarget.currentTime / d); }}
      />
      <button type="button" className="vp-tap" aria-label={paused ? 'Play video' : 'Pause video'} onClick={toggle} />
      {flash && <span key={flash.key} className="vp-flash" aria-hidden="true"><Icon name={flash.icon} size={34} /></span>}
      <button type="button" className="vp-sound" aria-label={muted ? 'Turn sound on' : 'Mute'} onClick={() => setMuted((m) => !m)}>
        <Icon name={muted ? 'volume-x' : 'volume-2'} size={20} />
      </button>
      <div
        className="vp-progress"
        role="slider"
        aria-label="Video progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        onPointerDown={(e) => { e.stopPropagation(); seekingRef.current = true; e.currentTarget.setPointerCapture(e.pointerId); seekFromPointer(e); }}
        onPointerMove={(e) => { if (seekingRef.current) seekFromPointer(e); }}
        onPointerUp={() => { seekingRef.current = false; }}
        onPointerCancel={() => { seekingRef.current = false; }}
      >
        <div className="vp-progress-track"><div className="vp-progress-fill" style={{ width: `${progress * 100}%` }} /></div>
      </div>
    </div>
  );
}
