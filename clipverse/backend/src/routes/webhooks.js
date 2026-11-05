const router = require('express').Router();
const crypto = require('crypto');
const express = require('express');
const config = require('../config');
const { sequelize, Wallet, LedgerEntry, Payout, EarningsWallet } = require('../db');

// Must receive the raw body to verify the signature
router.post('/paystack', express.raw({ type: '*/*' }), async (req, res) => {
  if (!config.paystackSecret || !Buffer.isBuffer(req.body)) return res.status(503).end();
  const sig = req.headers['x-paystack-signature'] || '';
  const expected = crypto.createHmac('sha512', config.paystackSecret).update(req.body).digest('hex');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return res.status(401).end();
  }

  let event;
  try { event = JSON.parse(req.body.toString('utf8')); } catch { return res.status(400).end(); }
  if (event.event === 'transfer.success' || event.event === 'transfer.failed' || event.event === 'transfer.reversed') {
    const transfer = event.data || {};
    if (!transfer.reference) return res.status(200).end();
    const payout = await Payout.findOne({ where: { providerRef: transfer.reference } });
    if (!payout || payout.status !== 'pending') return res.status(200).end();
    if (event.event === 'transfer.success') {
      await payout.update({ status: 'paid' });
    } else {
      await sequelize.transaction(async (t) => {
        const [changed] = await Payout.update({ status: 'failed' }, { where: { id: payout.id, status: 'pending' }, transaction: t });
        if (!changed) return;
        const [wallet] = await EarningsWallet.findOrCreate({ where: { userId: payout.userId }, defaults: { userId: payout.userId }, transaction: t });
        await wallet.increment('balanceMinor', { by: Number(payout.amountMinor), transaction: t });
        await LedgerEntry.create({ userId: payout.userId, kind: 'payout_refund', deltaMinor: Number(payout.amountMinor), refId: payout.id }, { transaction: t });
      });
    }
    return res.status(200).end();
  }
  if (event.event !== 'charge.success') return res.status(200).end();

  const { reference, amount, metadata, status, currency } = event.data || {};
  if (status !== 'success' || !reference || !Number.isSafeInteger(Number(amount)) || Number(amount) <= 0 || !metadata || !metadata.userId) return res.status(200).end();
  const { User } = require('../db');
  if (!(await User.findByPk(metadata.userId, { attributes: ['id'] }))) return res.status(200).end();
  if (currency && !['NGN', 'USD', 'GHS', 'ZAR', 'KES'].includes(currency)) return res.status(200).end();
  const coins = Math.floor(amount / config.coinPriceMinor);

  try {
    await sequelize.transaction(async (t) => {
      // Unique (kind, refId) index blocks a second credit for the same payment
      await LedgerEntry.create({
        userId: metadata.userId, kind: 'coin_purchase', deltaMinor: amount, refId: reference,
      }, { transaction: t });
      await Wallet.increment('coinBalance', { by: coins, where: { userId: metadata.userId }, transaction: t });
    });
  } catch (e) {
    if (e.name !== 'SequelizeUniqueConstraintError') throw e; // already credited: fine
  }
  res.status(200).end();
});

module.exports = router;
