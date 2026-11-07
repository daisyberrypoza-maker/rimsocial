import { useState } from 'react';
import { mediaUrl } from '../lib/config.js';

// Round avatar. If the picture cannot load (for example a removed upload), the initial is shown instead of a broken image.
export default function Avatar({ user, size = 40, ring = false }) {
  const label = (user?.displayName || user?.username || '?').charAt(0).toUpperCase();
  const src = mediaUrl(user?.avatarUrl);
  const [failedSrc, setFailedSrc] = useState(null);
  const showImage = Boolean(src) && failedSrc !== src;
  const inner = showImage
    ? <img src={src} alt="" decoding="async" onError={() => setFailedSrc(src)} />
    : <span className="avatar-initial" style={{ fontSize: size * 0.4 }}>{label}</span>;

  return (
    <span className={`avatar ${ring ? 'ring' : ''}`} style={{ width: size, height: size }}>
      {ring ? <span className="inner">{inner}</span> : inner}
    </span>
  );
}
