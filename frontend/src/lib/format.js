export function formatCount(n = 0) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}


// Shared relative-time format used across the web app.
// Examples: now, 5m, 3h, 2d, 1w. Set suffix=true for story labels such as "3h ago".
export function formatRelativeTime(value, { suffix = false, absoluteAfterDays = Infinity } = {}) {
  if (!value) return '';
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return suffix ? `${minutes}m ago` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return suffix ? `${hours}h ago` : `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days >= absoluteAfterDays) return new Date(timestamp).toLocaleDateString();
  if (days < 7) return suffix ? `${days}d ago` : `${days}d`;
  const weeks = Math.floor(days / 7);
  return suffix ? `${weeks}w ago` : `${weeks}w`;
}
