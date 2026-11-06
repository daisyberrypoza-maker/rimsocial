const router = require('express').Router();
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { LiveBroadcast, LiveBroadcastMessage, User } = require('../db');
const { requireAuth } = require('../middleware/auth');
const config = require('../config');
const httpError = require('../utils/httpError');
const { blockedUserIds, assertNotBlocked } = require('../lib/blocks');

router.use(requireAuth);

function liveKitReady() {
  return Boolean(config.livekitUrl && config.livekitApiKey && config.livekitApiSecret);
}
function roomName(id) { return `rimsocial-broadcast-${id}`; }
function tokenFor({ userId, room, host }) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign({
    iss: config.livekitApiKey,
    sub: String(userId),
    nbf: now - 5,
    exp: now + 60 * 60,
    video: { roomJoin: true, room, canPublish: Boolean(host), canSubscribe: true, canPublishData: true },
  }, config.livekitApiSecret, { algorithm: 'HS256' });
}

router.get('/', async (req, res, next) => {
  try {
    const blocked = await blockedUserIds(req.user.id);
    const items = (await LiveBroadcast.findAll({
      where: { status: 'live' }, order: [['startedAt', 'DESC']], limit: 50,
      attributes: ['id', 'hostId', 'title', 'status', 'viewerCount', 'startedAt'],
    })).filter((item) => !blocked.has(item.hostId));
    const ids = [...new Set(items.map((item) => item.hostId))];
    const users = await User.findAll({ where: { id: ids }, attributes: ['id', 'username', 'displayName', 'avatarUrl'] });
    const byId = new Map(users.map((user) => [user.id, user]));
    res.set('Cache-Control', 'no-store');
    res.json({ items: items.map((item) => ({ ...item.toJSON(), host: byId.get(item.hostId) || null })) });
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    if (!liveKitReady()) throw httpError(503, 'Public LIVE media provider is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET when configuring deployment.');
    const title = String(req.body.title || '').trim().slice(0, 120);
    if (!title) throw httpError(400, 'Add a title before going LIVE');
    const existing = await LiveBroadcast.findOne({ where: { hostId: req.user.id, status: 'live' } });
    if (existing) throw httpError(409, 'You already have an active broadcast');
    const item = await LiveBroadcast.create({
      id: crypto.randomUUID(), hostId: req.user.id, title, status: 'live',
      viewerCount: 0, startedAt: new Date(),
    });
    res.status(201).json({ broadcast: item, liveKitConfigured: liveKitReady() });
  } catch (e) { next(e); }
});

router.post('/:id/token', async (req, res, next) => {
  try {
    const item = await LiveBroadcast.findByPk(req.params.id);
    if (!item || item.status !== 'live') throw httpError(404, 'This broadcast is no longer live');
    await assertNotBlocked(req.user.id, item.hostId, 'This broadcast is no longer live');
    const host = item.hostId === req.user.id;
    if (!liveKitReady()) throw httpError(503, 'LIVE media provider is not configured yet');
    const room = roomName(item.id);
    res.set('Cache-Control', 'no-store');
    res.json({ token: tokenFor({ userId: req.user.id, room, host }), serverUrl: config.livekitUrl, room, role: host ? 'host' : 'viewer' });
  } catch (e) { next(e); }
});

router.post('/:id/end', async (req, res, next) => {
  try {
    const item = await LiveBroadcast.findByPk(req.params.id);
    if (!item) throw httpError(404, 'Broadcast not found');
    if (item.hostId !== req.user.id) throw httpError(403, 'Only the host can end this broadcast');
    if (item.status === 'live') {
      item.status = 'ended';
      item.endedAt = new Date();
      await item.save();
    }
    res.json({ broadcast: { id: item.id, status: item.status, endedAt: item.endedAt } });
  } catch (e) { next(e); }
});

router.get('/:id/chat', async (req, res, next) => {
  try {
    const item = await LiveBroadcast.findByPk(req.params.id);
    if (!item) throw httpError(404, 'Broadcast not found');
    await assertNotBlocked(req.user.id, item.hostId, 'Broadcast not found');
    const blocked = await blockedUserIds(req.user.id);
    const messages = (await LiveBroadcastMessage.findAll({
      where: { broadcastId: item.id }, order: [['createdAt', 'DESC']], limit: 60,
      attributes: ['id', 'userId', 'body', 'createdAt'],
    })).filter((message) => !blocked.has(message.userId));
    const ids = [...new Set(messages.map((message) => message.userId))];
    const users = await User.findAll({ where: { id: ids }, attributes: ['id', 'username', 'displayName', 'avatarUrl'] });
    const byId = new Map(users.map((user) => [user.id, user]));
    res.json({ items: messages.reverse().map((message) => ({ ...message.toJSON(), user: byId.get(message.userId) || null })) });
  } catch (e) { next(e); }
});

router.post('/:id/chat', async (req, res, next) => {
  try {
    const item = await LiveBroadcast.findByPk(req.params.id);
    if (!item || item.status !== 'live') throw httpError(404, 'This broadcast is no longer live');
    await assertNotBlocked(req.user.id, item.hostId, 'This broadcast is no longer live');
    const body = String(req.body.body || '').trim();
    if (!body || body.length > 500) throw httpError(400, 'Chat messages must be 1–500 characters');
    const recent = await LiveBroadcastMessage.count({ where: { broadcastId: item.id, userId: req.user.id, createdAt: { [require('sequelize').Op.gte]: new Date(Date.now() - 10_000) } } });
    if (recent >= 5) throw httpError(429, 'You are sending messages too quickly');
    const message = await LiveBroadcastMessage.create({ id: crypto.randomUUID(), broadcastId: item.id, userId: req.user.id, body });
    const user = await User.findByPk(req.user.id, { attributes: ['id', 'username', 'displayName', 'avatarUrl'] });
    res.status(201).json({ message: { ...message.toJSON(), user } });
  } catch (e) { next(e); }
});

module.exports = router;
