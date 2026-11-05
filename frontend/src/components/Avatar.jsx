import { mediaUrl } from '../lib/config.js';

export default function Avatar({ user, size = 40, ring = false }) {
  const label = (user?.displayName || user?.username || '?').charAt(0).toUpperCase();
  const src = mediaUrl(user?.avatarUrl);
  const inner = src
    ? <img src={src} alt="" loading="lazy" />
    : <span className="avatar-initial" style={{ fontSize: size * 0.4 }}>{label}</span>;

  return (
    <span className={`avatar ${ring ? 'ring' : ''}`} style={{ width: size, height: size }}>
      {ring ? <span className="inner">{inner}</span> : inner}
    </span>
  );
}
