// Base URL of the API. Empty in web development (Vite proxies /v1).
// Set VITE_API_URL for Android builds, since the app runs from local files.
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

// Server media paths look like "/uploads/file.mp4"; make them absolute on mobile.
export function mediaUrl(path) {
  if (!path) return path;
  return path.startsWith('/') ? `${API_BASE}${path}` : path;
}
