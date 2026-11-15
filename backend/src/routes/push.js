const router = require('express').Router();
const { requireAuth } = require('../middleware/auth');
const { PushSubscription } = require('../db');
const { publicKey } = require('../services/push');

// The public VAPID key the browser needs to subscribe (null until the server has keys)
router.get('/public-key', (req, res) => {
  res.json({ publicKey: publicKey() });
});

router.post('/subscribe', requireAuth, async (req, res, next) => {
  try {
    const endpoint = String(req.body?.endpoint || '');
    const p256dh = String(req.body?.keys?.p256dh || '');
    const auth = String(req.body?.keys?.auth || '');
    if (!endpoint.startsWith('https://') || !p256dh || !auth) return res.status(400).json({ error: 'Invalid push subscription' });
    const existing = await PushSubscription.findOne({ where: { endpoint } });
    if (existing) await existing.update({ userId: req.user.id, p256dh, auth });
    else await PushSubscription.create({ userId: req.user.id, endpoint, p256dh, auth });
    res.status(201).json({ ok: true });
  } catch (error) { next(error); }
});

router.delete('/subscribe', requireAuth, async (req, res, next) => {
  try {
    await PushSubscription.destroy({ where: { userId: req.user.id, endpoint: String(req.body?.endpoint || '') } });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

module.exports = router;
