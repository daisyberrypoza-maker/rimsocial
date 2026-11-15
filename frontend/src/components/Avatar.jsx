import { useEffect, useState } from 'react';
import { mediaUrl } from '../lib/config.js';
import { requestStoryRings } from '../lib/storyRings.js';
import { useAppStore } from '../store.js';
import { backgroundCss } from '../lib/storyBackgrounds.js';

// Round avatar. When this person has an active story it gets the story ring everywhere: coloured while some of it
// is unseen, grey once it has all been watched. No active story means a plain avatar.
// keepPhoto: show the real profile photo (profile and edit-profile screens). Otherwise your own avatar shows your latest story or post.
export default function Avatar({ user, size = 40, ring = false, storyRing, noRing = false, keepPhoto = false }) {
  const storeRing = useAppStore((s) => (user?.id ? s.storyRings?.[user.id] : undefined));
  // Any screen can show this person; if the ring is not known yet, look it up (batched, see lib/storyRings.js)
  useEffect(() => {
    if (!storyRing && user?.id) requestStoryRings(user.id);
  }, [user?.id, storyRing]);
  // A null prop is not authoritative: a cached/shared active ring must still show while the
  // batched server check refreshes it. The server clears it when the story expires or is removed.
  // noRing: the caller already draws the story ring (avoids a double ring)
  const rawState = noRing ? null : (storyRing || storeRing);
  const ownId = useAppStore((s) => s.user?.id);
  const myThumb = useAppStore((s) => s.myThumb);
  const thumb = !keepPhoto && user?.id && String(user.id) === String(ownId) ? myThumb : null;
  const state = rawState && user?.id && String(user.id) === String(ownId) ? 'mine' : rawState;
  const label = (user?.displayName || user?.username || '?').charAt(0).toUpperCase();
  const src = thumb?.kind === 'image' ? thumb.src : mediaUrl(user?.avatarUrl);
  const [failedSrc, setFailedSrc] = useState(null);
  const showImage = Boolean(src) && failedSrc !== src;
  const inner = thumb?.kind === 'text'
    ? <span className="avatar-text" style={{ background: backgroundCss(thumb.background) }}><span style={{ fontSize: Math.max(8, size * 0.2) }}>{thumb.text}</span></span>
    : showImage
      ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailedSrc(src)} />
      : <span className="avatar-initial" style={{ fontSize: size * 0.4 }}>{label}</span>;
  const ringed = Boolean(state);
  const className = ['avatar', ringed ? 'ring' : '', state ? `story-${state}` : ''].filter(Boolean).join(' ');

  return (
    <span className={className} style={{ width: size, height: size }}>
      {ringed ? <span className="inner">{inner}</span> : inner}
    </span>
  );
}
