// Web push (VAPID). Works once the VAPID keys are set in the environment and the web-push package is
// installed (npm install). Until then every call is a no-op, so nothing else depends on it.
// Notifications never carry message text: chats are end-to-end encrypted.
const { PushSubscription } = require('../db');

let webpush = null;
try { webpush = require('web-push'); } catch { webpush = null; }

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@rimsocial.app';
const enabled = Boolean(webpush && PUBLIC_KEY && PRIVATE_KEY);
if (enabled) webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);

function publicKey() {
  return enabled ? PUBLIC_KEY : null;
}

// Sends { title, body, tag, url } to every device of the given users. Dead endpoints are removed.
async function notifyUsers(userIds, payload) {
  if (!enabled || !userIds.length) return;
  const subs = await PushSubscription.findAll({ where: { userId: userIds }, raw: true });
  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
        { TTL: 3600 },
      );
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) await PushSubscription.destroy({ where: { id: sub.id } }).catch(() => {});
    }
  }));
}

module.exports = { notifyUsers, publicKey, enabled };
