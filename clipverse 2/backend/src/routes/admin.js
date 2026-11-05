const router = require('express').Router();
const crypto = require('crypto');
const { sequelize, Payout, PayoutProfile, EarningsWallet, LedgerEntry, User } = require('../db');
const config = require('../config');
const httpError = require('../utils/httpError');

function requireOperator(req, res, next) {
  const supplied = String(req.headers['x-admin-api-key'] || '');
  const expected = String(config.adminApiKey || '');
  if (expected.length < 32 || /replace|change-this|paste-output/i.test(expected) || supplied.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return res.status(401).json({ error: 'Operator authorization required' });
  }
  next();
}
router.use(requireOperator);

router.get('/payouts', async (req, res, next) => {
  try {
    const items = await Payout.findAll({ where: { status: 'pending' }, order: [['createdAt', 'ASC']], limit: 100 });
    res.json({ items: items.map((p) => ({ id: p.id, userId: p.userId, amountMinor: Number(p.amountMinor), status: p.status, createdAt: p.createdAt })) });
  } catch (e) { next(e); }
});

router.post('/payouts/:id/transfer', async (req, res, next) => {
  try {
    if (!config.paystackSecret) throw httpError(503, 'Paystack is not configured');
    const payout = await Payout.findByPk(req.params.id);
    if (!payout) throw httpError(404, 'Payout not found');
    if (payout.status !== 'pending') throw httpError(409, 'Payout is not pending');
    if (payout.providerRef) throw httpError(409, 'Transfer has already been submitted');
    const profile = await PayoutProfile.findByPk(payout.userId);
    if (!profile?.verified || !profile.recipientCode) throw httpError(409, 'Creator has no verified payout recipient');
    const reference = `clipverse_${payout.id.replace(/-/g, '')}`;
    const response = await fetch('https://api.paystack.co/transfer', {
      method: 'POST', headers: { Authorization: `Bearer ${config.paystackSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'balance', amount: Number(payout.amountMinor), recipient: profile.recipientCode, reference, reason: 'ClipVerse creator earnings' }),
    });
    const result = await response.json();
    if (!response.ok || !result.status) throw httpError(502, result.message || 'Paystack could not initiate this transfer');
    await payout.update({ providerRef: reference, providerTransferCode: result.data?.transfer_code || null });
    res.json({ payoutId: payout.id, providerStatus: result.data?.status || 'pending', requiresOtp: result.data?.status === 'otp', message: result.data?.status === 'otp' ? 'Paystack requires an operator OTP confirmation.' : 'Transfer submitted. Final status is confirmed by the signed Paystack webhook.' });
  } catch (e) { next(e); }
});

router.post('/payouts/:id/otp', async (req, res, next) => {
  try {
    if (!config.paystackSecret) throw httpError(503, 'Paystack is not configured');
    const otp = String(req.body.otp || '').trim();
    if (!/^\d{4,8}$/.test(otp)) throw httpError(400, 'Enter the transfer OTP');
    const payout = await Payout.findByPk(req.params.id);
    if (!payout || payout.status !== 'pending' || !payout.providerTransferCode) throw httpError(409, 'No transfer awaiting OTP confirmation');
    const response = await fetch('https://api.paystack.co/transfer/otp/validate', {
      method: 'POST', headers: { Authorization: `Bearer ${config.paystackSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ otp, transfer_code: payout.providerTransferCode }),
    });
    const result = await response.json();
    if (!response.ok || !result.status) throw httpError(400, result.message || 'Transfer OTP validation failed');
    res.json({ payoutId: payout.id, message: 'OTP accepted. Awaiting signed transfer webhook for final settlement.' });
  } catch (e) { next(e); }
});

module.exports = router;
