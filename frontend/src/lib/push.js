import { api } from '../api.js';

// Web push: subscribes this browser when notifications are already allowed. Does nothing until the
// server has VAPID keys. askForPush() asks for permission (call it from a button).
function base64UrlToBytes(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export async function enablePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  const { publicKey } = await api('/v1/push/public-key');
  if (!publicKey) return false;
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) });
  }
  await api('/v1/push/subscribe', { method: 'POST', body: subscription.toJSON() });
  return true;
}

export async function askForPush() {
  if (!('Notification' in window)) return false;
  const permission = await Notification.requestPermission();
  return permission === 'granted' ? enablePush() : false;
}
