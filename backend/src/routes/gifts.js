const router = require('express').Router();
const config = require('../config');
const { Gift, Wallet, User } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { sendGift } = require('../services/wallet');
const httpError = require('../utils/httpError');

router.get('/gifts', requireAuth, async (req, res, next) => {
  try {
    res.json({ items: await Gift.findAll({ where: { active: true }, order: [['coinPrice', 'ASC']] }) });
  } catch (e) { next(e); }
});

router.post('/gifts', requireAuth, async (req, res, next) => {
  try {
    const key = req.headers['idempotency-key'];
    if (!key) throw httpError(400, 'Idempotency-Key header required');
    const { postId, giftId, liveMatchId = null } = req.body;
    if (liveMatchId !== null && (typeof liveMatchId !== 'string' || liveMatchId.length > 64)) throw httpError(400, 'Invalid LIVE match ID');
    const result = await sendGift({ senderId: req.user.id, postId, giftId: Number(giftId), liveMatchId, idempotencyKey: key });
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (e) { next(e); }
});

router.get('/wallet', requireAuth, async (req, res, next) => {
  try {
    const wallet = await Wallet.findByPk(req.user.id);
    res.json({ coinBalance: wallet ? Number(wallet.coinBalance) : 0 });
  } catch (e) { next(e); }
});

router.get('/wallet/packs', requireAuth, (req, res) => {
  res.json({
    currency: 'NGN',
    packs: config.webCoinPurchasesEnabled
      ? config.coinPacks.filter((pack) => pack.enabled).map(({ id, coins, amountMinor, currency }) => ({ id, coins, amountMinor, currency }))
      : [],
    purchasesEnabled: config.webCoinPurchasesEnabled,
    pricesAreDraft: true,
  });
});

// Pack ID is the only client-controlled purchase input; amounts and coin counts are server-owned.
router.post('/wallet/topup', requireAuth, async (req, res, next) => {
  try {
    if (!config.webCoinPurchasesEnabled) throw httpError(503, 'Coin purchases are disabled until prices, payment reconciliation, and platform requirements are verified');
    if (!config.paystackSecret) throw httpError(503, 'Coin top-ups are temporarily unavailable because the payment provider is not configured');
    const pack = config.coinPacks.find((item) => item.enabled && item.id === req.body.packId);
    if (!pack) throw httpError(400, 'Choose a valid coin pack');
    if (req.body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(req.body.email))) throw httpError(400, 'Enter a valid email address');

    const user = await User.findByPk(req.user.id, { attributes: ['id', 'email'] });
    if (!user) throw httpError(401, 'Account not found');
    const email = String(req.body.email || user.email || '').trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, 'A valid email address is required for checkout');

    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.paystackSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        amount: pack.amountMinor,
        currency: pack.currency,
        metadata: { userId: req.user.id, coinPackId: pack.id, coinPackAmountMinor: pack.amountMinor, purpose: 'coin_topup' },
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.status || !data.data?.authorization_url || !data.data?.reference) {
      throw httpError(502, 'Payment provider could not initialize checkout');
    }
    res.json({
      authorizationUrl: data.data.authorization_url,
      reference: data.data.reference,
      pack: { id: pack.id, coins: pack.coins, amountMinor: pack.amountMinor, currency: pack.currency },
    });
  } catch (e) { next(e); }
});

module.exports = router;
