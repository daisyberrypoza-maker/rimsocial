const router = require('express').Router();
const crypto = require('node:crypto');
const { LiveBroadcast, User } = require('../db');
const { requireAuth } = require('../middleware/auth');
const config = require('../config');
const httpError = require('../utils/httpError');

router.use(requireAuth);

function livekitToken({ identity, name, room, canPublish }) {
  if (!config.livekitApiKey || !config.livekitApiSecret || !config.livekitUrl) {
    throw httpError(503, 'Public LIVE is not configured on the server');
  }
  const now = Math.floor(Date.now() / 1000);
  const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = b64({ alg: 'HS256', typ: 'JWT' });
  const payload = b64({
    iss: config.livekitApiKey,
    sub: identity,
    name: String(name || identity).slice(0, 64),
    nbf: now - 5,
    iat: now,
    exp: now + 60 * 60,
    video: { room, roomJoin: true, canPublish, canSubscribe: true, canPublishData: true },
  });
  const signature = crypto.createHmac('sha256', config.livekitApiSecret).update(header + '.' + payload).digest('base64url');
  return header + '.' + payload + '.' + signature;
}

router.get('/', async (req, res, next) => {
  try {
    const items = await LiveBroadcast.findAll({
      where: { status: 'live' },
      attributes: ['id', 'hostId', 'title', 'createdAt'],
      include: [{ model: User, as: 'host', attributes: ['id', 'username', 'displayName', 'avatarUrl'] }],
      order: [['createdAt', 'DESC']],
      limit: 50,
    });
    res.set('Cache-Control', 'no-store');
    res.json({ items });
  } catch (error) { next(error); }
});

router.post('/', async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id, { attributes: ['id', 'username', 'displayName', 'isCreator'] });
    if (!user || !user.isCreator) throw httpError(403, 'Enable creator status before starting a public LIVE broadcast');
    if (!config.livekitUrl || !config.livekitApiKey || !config.livekitApiSecret) {
      throw httpError(503, 'Public LIVE streaming is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET.');
    }
    const active = await LiveBroadcast.findOne({ where: { hostId: user.id, status: 'live' } });
    if (active) throw httpError(409, 'End your current public LIVE before starting another');
    const title = typeof req.body.title === 'string' ? req.body.title.trim().slice(0, 120) : '';
    const broadcast = await LiveBroadcast.create({ hostId: user.id, title });
    const token = livekitToken({ identity: user.id, name: user.displayName || user.username, room: 'rimsocial-' + broadcast.id, canPublish: true });
    res.status(201).json({ broadcast, token, serverUrl: config.livekitUrl, tokenExpiresInSeconds: 3600 });
  } catch (error) { next(error); }
});

router.post('/:id/token', async (req, res, next) => {
  try {
    const broadcast = await LiveBroadcast.findByPk(req.params.id);
    if (!broadcast || broadcast.status !== 'live') throw httpError(404, 'LIVE broadcast is not available');
    const user = await User.findByPk(req.user.id, { attributes: ['id', 'username', 'displayName'] });
    if (!user) throw httpError(401, 'Sign in to watch LIVE');
    const isHost = broadcast.hostId === user.id;
    const token = livekitToken({
      identity: user.id,
      name: user.displayName || user.username,
      room: 'rimsocial-' + broadcast.id,
      canPublish: isHost,
    });
    res.set('Cache-Control', 'no-store');
    res.json({ token, serverUrl: config.livekitUrl, role: isHost ? 'host' : 'viewer', tokenExpiresInSeconds: 3600 });
  } catch (error) { next(error); }
});

router.post('/:id/end', async (req, res, next) => {
  try {
    const broadcast = await LiveBroadcast.findByPk(req.params.id);
    if (!broadcast) throw httpError(404, 'LIVE broadcast not found');
    if (broadcast.hostId !== req.user.id) throw httpError(403, 'Only the host can end this broadcast');
    if (broadcast.status === 'live') await broadcast.update({ status: 'ended', endedAt: new Date() });
    res.json({ broadcast: { id: broadcast.id, status: broadcast.status, endedAt: broadcast.endedAt } });
  } catch (error) { next(error); }
});

module.exports = router;
