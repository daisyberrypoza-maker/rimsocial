const router = require('express').Router();
const { Op } = require('sequelize');
const { sequelize, User, Post, EarningsWallet, GiftTransaction, LedgerEntry, Payout, PayoutProfile, LiveMatch, ContentEarning } = require('../db');
const { requireAuth } = require('../middleware/auth');
const config = require('../config');
const httpError = require('../utils/httpError');

router.use(requireAuth);

router.get('/dashboard', async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id, { attributes: ['id', 'username', 'displayName', 'isCreator', 'followerCount', 'country'] });
    const wallet = await EarningsWallet.findByPk(req.user.id);
    const [posts, gifts, earnings, payouts, profile] = await Promise.all([
      Post.count({ where: { authorId: req.user.id, isStory: false, status: 'live' } }),
      GiftTransaction.count({ where: { creatorId: req.user.id } }),
      ContentEarning.findAll({ where: { creatorId: req.user.id }, attributes: ['source', 'status', [sequelize.fn('SUM', sequelize.col('amountMinor')), 'totalMinor']], group: ['source', 'status'], raw: true }),
      Payout.findAll({ where: { userId: req.user.id }, attributes: ['id', 'amountMinor', 'status', 'createdAt'], order: [['createdAt', 'DESC']], limit: 20 }),
      PayoutProfile.findByPk(req.user.id, { attributes: ['country', 'currency', 'provider', 'verified'] }),
    ]);
    res.json({ creator: user, wallet: { availableMinor: Number(wallet?.balanceMinor || 0), pendingMinor: Number(wallet?.heldMinor || 0), currency: 'NGN', minimumPayoutMinor: config.minPayoutMinor }, stats: { posts, gifts }, earnings, payouts, payoutProfile: profile });
  } catch (e) { next(e); }
});

router.post('/apply', async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (!user) throw httpError(404, 'User not found');
    if (!user.isCreator) await user.update({ isCreator: true });
    res.status(200).json({ isCreator: true, message: 'Creator tools enabled. Earnings are paid only for eligible, verified activity.' });
  } catch (e) { next(e); }
});

router.get('/payout-banks', async (req, res, next) => {
  try {
    if (!config.paystackSecret) throw httpError(503, 'Payout provider is not configured');
    const response = await fetch('https://api.paystack.co/bank?country=nigeria&currency=NGN&perPage=100', { headers: { Authorization: `Bearer ${config.paystackSecret}` } });
    const result = await response.json();
    if (!response.ok || !result.status) throw httpError(502, 'Could not load supported banks');
    res.json({ items: (result.data || []).map((b) => ({ name: b.name, code: String(b.code) })).filter((b) => b.name && b.code) });
  } catch (e) { next(e); }
});

router.post('/payout-profile', async (req, res, next) => {
  try {
    if (!config.paystackSecret) throw httpError(503, 'Payout provider is not configured');
    const accountNumber = String(req.body.accountNumber || '').replace(/\s/g, '');
    const bankCode = String(req.body.bankCode || '').trim();
    if (!/^\d{10}$/.test(accountNumber)) throw httpError(400, 'Enter a valid 10-digit Nigerian account number');
    if (!/^[A-Za-z0-9_-]{2,12}$/.test(bankCode)) throw httpError(400, 'Choose a valid bank code');
    const headers = { Authorization: `Bearer ${config.paystackSecret}`, 'Content-Type': 'application/json' };
    const resolveUrl = new URL('https://api.paystack.co/bank/resolve');
    resolveUrl.searchParams.set('account_number', accountNumber);
    resolveUrl.searchParams.set('bank_code', bankCode);
    const resolvedRes = await fetch(resolveUrl, { headers });
    const resolved = await resolvedRes.json();
    if (!resolvedRes.ok || !resolved.status || !resolved.data?.account_name) throw httpError(400, 'Could not verify that bank account. Check the details and try again.');
    const recipientRes = await fetch('https://api.paystack.co/transferrecipient', {
      method: 'POST', headers,
      body: JSON.stringify({ type: 'nuban', name: resolved.data.account_name, account_number: accountNumber, bank_code: bankCode, currency: 'NGN' }),
    });
    const recipient = await recipientRes.json();
    if (!recipientRes.ok || !recipient.status || !recipient.data?.recipient_code) throw httpError(502, 'The payment provider could not register this payout destination');
    await PayoutProfile.upsert({ userId: req.user.id, country: 'NG', currency: 'NGN', provider: 'paystack', recipientCode: recipient.data.recipient_code, verified: true });
    // The app stores only Paystack's recipient code; the raw account number is not persisted here.
    res.json({ verified: true, accountName: resolved.data.account_name, bankName: resolved.data.bank_name || '', last4: accountNumber.slice(-4), message: 'Payout destination verified.' });
  } catch (e) { next(e); }
});

router.post('/payouts', async (req, res, next) => {
  try {
    const amountMinor = Number(req.body.amountMinor);
    if (!Number.isSafeInteger(amountMinor) || amountMinor < config.minPayoutMinor) throw httpError(400, `Minimum withdrawal is ${config.minPayoutMinor} minor units`);
    const profile = await PayoutProfile.findByPk(req.user.id);
    if (!profile || !profile.verified || !profile.recipientCode) throw httpError(409, 'Set up and verify your payout destination before withdrawing.');
    const payout = await sequelize.transaction(async (t) => {
      const wallet = await EarningsWallet.findByPk(req.user.id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!wallet || Number(wallet.balanceMinor) < amountMinor) throw httpError(400, 'Insufficient available earnings');
      await wallet.decrement('balanceMinor', { by: amountMinor, transaction: t });
      const item = await Payout.create({ userId: req.user.id, amountMinor, status: 'pending' }, { transaction: t });
      await LedgerEntry.create({ userId: req.user.id, kind: 'payout_request', deltaMinor: -amountMinor, refId: item.id }, { transaction: t });
      return item;
    });
    res.status(201).json({ payout: { id: payout.id, amountMinor: Number(payout.amountMinor), status: payout.status }, message: 'Withdrawal request submitted for secure processing.' });
  } catch (e) { next(e); }
});

router.get('/discover', async (req, res, next) => {
  try {
    const items = await User.findAll({ where: { isCreator: true, id: { [Op.ne]: req.user.id } }, attributes: ['id', 'username', 'displayName', 'avatarUrl', 'followerCount'], order: [['followerCount', 'DESC']], limit: 30 });
    res.json({ items });
  } catch (e) { next(e); }
});

router.get('/matches', async (req, res, next) => {
  try {
    const items = await LiveMatch.findAll({ where: { status: { [Op.in]: ['pending', 'active'] }, [Op.or]: [{ hostId: req.user.id }, { opponentId: req.user.id }] }, order: [['createdAt', 'DESC']], limit: 20 });
    res.json({ items });
  } catch (e) { next(e); }
});

router.post('/matches', async (req, res, next) => {
  try {
    const opponentId = String(req.body.opponentId || '');
    if (!opponentId || opponentId === req.user.id) throw httpError(400, 'Choose another creator to match with');
    const opponent = await User.findByPk(opponentId, { attributes: ['id', 'isCreator'] });
    if (!opponent || !opponent.isCreator) throw httpError(404, 'Creator not found');
    const mine = await User.findByPk(req.user.id, { attributes: ['isCreator'] });
    if (!mine?.isCreator) throw httpError(403, 'Apply as a creator before starting a match');
    const existing = await LiveMatch.findOne({ where: { status: { [Op.in]: ['pending', 'active'] }, [Op.or]: [{ hostId: req.user.id }, { opponentId: req.user.id }, { hostId: opponentId }, { opponentId: opponentId }] } });
    if (existing) throw httpError(409, 'One of these creators already has an active match');
    const match = await LiveMatch.create({ hostId: req.user.id, opponentId, status: 'pending' });
    res.status(201).json({ match });
  } catch (e) { next(e); }
});

router.post('/matches/:id/respond', async (req, res, next) => {
  try {
    const match = await LiveMatch.findByPk(req.params.id);
    if (!match) throw httpError(404, 'Match not found');
    if (match.opponentId !== req.user.id) throw httpError(403, 'Only the invited creator can respond');
    if (match.status !== 'pending') throw httpError(409, 'This match is no longer pending');
    const accept = req.body.accept === true;
    await match.update(accept ? { status: 'active', startsAt: new Date() } : { status: 'cancelled' });
    res.json({ match });
  } catch (e) { next(e); }
});

router.post('/matches/:id/score', async (req, res, next) => {
  try {
    const match = await LiveMatch.findByPk(req.params.id);
    if (!match) throw httpError(404, 'Match not found');
    if (![match.hostId, match.opponentId].includes(req.user.id)) throw httpError(403, 'You are not in this match');
    if (match.status !== 'active') throw httpError(409, 'Match is not active');
    // Scores must come from server-verified gifts; clients cannot award themselves points.
    res.json({ match, message: 'Match scores are server-controlled and will update from verified gifts.' });
  } catch (e) { next(e); }
});

router.post('/matches/:id/end', async (req, res, next) => {
  try {
    const match = await LiveMatch.findByPk(req.params.id);
    if (!match) throw httpError(404, 'Match not found');
    if (![match.hostId, match.opponentId].includes(req.user.id)) throw httpError(403, 'You are not in this match');
    if (match.status !== 'active') throw httpError(409, 'Match is not active');
    await match.update({ status: 'ended', endsAt: new Date() });
    res.json({ match });
  } catch (e) { next(e); }
});

module.exports = router;
