const router = require('express').Router();
const config = require('../config');
const { Gift, Wallet } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { sendGift } = require('../services/wallet');
const httpError = require('../utils/httpError');

router.get('/gifts', requireAuth, async (req, res, next) => {
  try {
    res.json({ items: await Gift.findAll({ where: { active: true }, order: [['coinPrice', 'ASC']] }) });
  } catch (e) { next(e); }
});

// Idempotency-Key header is required so retried requests never charge twice
router.post('/gifts', requireAuth, async (req, res, next) => {
  try {
    const key = req.headers['idempotency-key'];
    if (!key) throw httpError(400, 'Idempotency-Key header required');
    const { postId, giftId } = req.body;
    const result = await sendGift({ senderId: req.user.id, postId, giftId: Number(giftId), idempotencyKey: key });
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (e) { next(e); }
});

router.get('/wallet', requireAuth, async (req, res, next) => {
  try {
    const wallet = await Wallet.findByPk(req.user.id);
    res.json({ coinBalance: wallet ? Number(wallet.coinBalance) : 0 });
  } catch (e) { next(e); }
});

// Starts a Paystack payment. Coins are credited only by the webhook, never here.
router.post('/wallet/topup', requireAuth, async (req, res, next) => {
  try {
    const amountMinor = Number(req.body.amountMinor);
    if (!Number.isInteger(amountMinor) || amountMinor < 100) throw httpError(400, 'Minimum top-up is 100 minor units');
    const r = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.paystackSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: req.body.email || `${req.user.id}@clipverse.local`,
        amount: amountMinor,
        metadata: { userId: req.user.id },
      }),
    });
    const data = await r.json();
    if (!data.status) throw httpError(502, 'Payment provider error');
    res.json({ authorizationUrl: data.data.authorization_url, reference: data.data.reference });
  } catch (e) { next(e); }
});

module.exports = router;
