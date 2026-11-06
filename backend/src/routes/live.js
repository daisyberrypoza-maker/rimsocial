const router = require('express').Router();
const { Op } = require('sequelize');
const { LiveMatch, LiveSignal } = require('../db');
const { requireAuth } = require('../middleware/auth');
const httpError = require('../utils/httpError');

router.use(requireAuth);

async function getParticipantMatch(matchId, userId) {
  const match = await LiveMatch.findByPk(matchId);
  if (!match) throw httpError(404, 'LIVE match not found');
  if (![match.hostId, match.opponentId].includes(userId)) {
    throw httpError(403, 'Only creators invited to this match can access its signaling');
  }
  if (match.status !== 'active') throw httpError(409, 'The LIVE match is not active');
  return match;
}

// WebRTC signaling relay for creator-to-creator video sessions.
// This relays connection metadata only; media itself travels through WebRTC.
router.get('/matches/:id/signals', async (req, res, next) => {
  try {
    await getParticipantMatch(req.params.id, req.user.id);
    const since = req.query.since ? new Date(String(req.query.since)) : new Date(0);
    const afterId = req.query.afterId ? String(req.query.afterId) : '';
    if (Number.isNaN(since.getTime())) throw httpError(400, 'Invalid signal cursor');
    if (afterId.length > 64) throw httpError(400, 'Invalid signal cursor ID');
    const items = await LiveSignal.findAll({
      where: {
        matchId: req.params.id,
        senderId: { [Op.ne]: req.user.id },
        [Op.or]: [
          { createdAt: { [Op.gt]: since } },
          ...(afterId ? [{ createdAt: since, id: { [Op.gt]: afterId } }] : []),
        ],
      },
      attributes: ['id', 'kind', 'payload', 'createdAt'],
      order: [['createdAt', 'ASC'], ['id', 'ASC']],
      limit: 100,
    });
    res.json({ items, serverTime: new Date().toISOString() });
  } catch (e) { next(e); }
});

router.post('/matches/:id/signals', async (req, res, next) => {
  try {
    await getParticipantMatch(req.params.id, req.user.id);
    const kind = String(req.body.kind || '');
    if (!['offer', 'answer', 'candidate'].includes(kind)) {
      throw httpError(400, 'Signal kind must be offer, answer, or candidate');
    }
    const payload = req.body.payload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw httpError(400, 'Signal payload must be a JSON object');
    }
    if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > 16 * 1024) {
      throw httpError(413, 'Signal payload is too large');
    }
    const item = await LiveSignal.create({
      matchId: req.params.id,
      senderId: req.user.id,
      kind,
      payload,
    });
    res.status(201).json({ signal: { id: item.id, kind: item.kind, createdAt: item.createdAt } });
  } catch (e) { next(e); }
});

module.exports = router;
