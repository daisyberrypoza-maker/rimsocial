// Rimlight rating indicator for every grid and story tile. Posts rated 4.0 and above get the badge (same rule as
// the mobile app). Unrated posts (rating null) show nothing.
export const RIMLIGHT_MIN_RATING = 4;

export function rimlightScore(rating) {
  if (rating == null) return null;
  const n = Number(rating);
  return Number.isFinite(n) && n >= RIMLIGHT_MIN_RATING ? n : null;
}

export default function RimlightBadge({ rating }) {
  const score = rimlightScore(rating);
  if (score == null) return null;
  return <span className="rim-badge" aria-label={`Rimlight rated ${score.toFixed(1)}`}>✦ {score.toFixed(1)}</span>;
}
