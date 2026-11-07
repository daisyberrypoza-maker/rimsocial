import { Capacitor } from '@capacitor/core';

// Base URL of the API. Empty in web development (Vite proxies /v1).
// Set VITE_API_URL for Android builds, since the app runs from local files.
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

// Server media paths look like "/uploads/file.mp4"; make them absolute on mobile.
export function mediaUrl(path) {
  if (!path) return path;
  return path.startsWith('/') ? `${API_BASE}${path}` : path;
}

// A public web URL is required for links shared from a native Android/iOS app.
// Do not share capacitor://localhost links outside the app.
export function postShareUrl(postId) {
  const configured = (import.meta.env.VITE_PUBLIC_APP_URL || '').replace(/\/$/, '');
  const base = configured || (!Capacitor.isNativePlatform() ? window.location.origin : '');
  return base ? base + '/p/' + encodeURIComponent(postId) : null;
}

// Cloudinary videos are served as a smaller, compressed stream (auto quality and format, max 720px wide),
// so phones download far less before playback starts. Other URLs are returned unchanged.
export function videoStreamUrl(url) {
  if (!url || !url.includes('res.cloudinary.com/') || !url.includes('/video/upload/') || url.includes('/video/upload/q_auto')) return url;
  return url.replace('/video/upload/', '/video/upload/q_auto,f_auto,w_720,c_limit/');
}
