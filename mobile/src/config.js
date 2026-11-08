// Same backend as the website build (VITE_API_URL default)
export const API_BASE = 'https://clipverse-backend-production.up.railway.app';

// Server media paths look like "/uploads/file.mp4"; make them absolute for the phone
export function mediaUrl(path) {
  if (!path) return path;
  if (/^https?:/.test(path)) return path;
  return `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

// Cloudinary streams a smaller, compressed copy (max 720px wide), same as the web app
export function videoStreamUrl(url) {
  if (!url || !url.includes('res.cloudinary.com/') || !url.includes('/video/upload/') || url.includes('/video/upload/q_auto')) return url;
  return url.replace('/video/upload/', '/video/upload/q_auto,f_auto,w_720,c_limit/');
}
