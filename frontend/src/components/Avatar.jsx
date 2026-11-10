import { useEffect, useState } from 'react';
import { mediaUrl } from '../lib/config.js';
import { requestStoryRings } from '../lib/storyRings.js';
import { useAppStore } from '../store.js';

// Round avatar. When this person has an active story it gets the story ring everywhere: coloured while some of it
// is unseen, grey once it has all been watched. No active story means a plain avatar.
export default function Avatar({ user, size = 40, ring = false, storyRing }) {
  const storeRing = useAppStore((s) => (user?.id ? s.storyRings?.[user.id] : undefined));
  // Any screen can show this person; if the ring is not known yet, look it up (batched, see lib/storyRings.js)
  useEffect(() => {
    if (storyRing === undefined && user?.id) requestStoryRings(user.id);
  }, [user?.id, storyRing]);
  const rawState = storyRing !== undefined ? storyRing : storeRing;
  const ownId = useAppStore((s) => s.user?.id);
  const state = rawState && user?.id && String(user.id) === String(ownId) ? 'mine' : rawState;
  const label = (user?.displayName || user?.username || '?').charAt(0).toUpperCase();
  const src = mediaUrl(user?.avatarUrl);
  const [failedSrc, setFailedSrc] = useState(null);
  const showImage = Boolean(src) && failedSrc !== src;
  const inner = showImage
    ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailedSrc(src)} />
    : <span className="avatar-initial" style={{ fontSize: size * 0.4 }}>{label}</span>;
  const ringed = Boolean(state) || ring;
  const className = ['avatar', ringed ? 'ring' : '', state ? `story-${state}` : ''].filter(Boolean).join(' ');

  return (
    <span className={className} style={{ width: size, height: size }}>
      {ringed ? <span className="inner">{inner}</span> : inner}
    </span>
  );
}
