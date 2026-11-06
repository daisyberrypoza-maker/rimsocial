const router = require('express').Router();
const crypto = require('crypto');
const express = require('express');
const config = require('../config');
const { sequelize, Wallet, LedgerEntry, Payout, EarningsWallet } = require('../db');
const { settlePayoutTransfer } = require('../services/payoutSettlement');

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
  if (['transfer.success', 'transfer.failed', 'transfer.reversed'].includes(event.event)) {
    try {
      await settlePayoutTransfer({
        eventName: event.event,
        reference: event.data?.reference,
        sequelize, Payout, EarningsWallet, LedgerEntry,
      });
    } catch (error) {
      // Return 500 so the provider can retry; the DB transaction rolls back all partial changes.
      console.error('Payout settlement webhook failed:', error.message);
      return res.status(500).end();
    }
    return res.status(200).end();
  }
  if (event.event !== 'charge.success') return res.status(200).end();

  const { reference, amount, metadata, status, currency } = event.data || {};
  if (status !== 'success' || !reference || !Number.isSafeInteger(Number(amount)) || Number(amount) <= 0 || !metadata || !metadata.userId) return res.status(200).end();
  const { User } = require('../db');
  if (!(await User.findByPk(metadata.userId, { attributes: ['id'] }))) return res.status(200).end();
  // Coin pricing is configured in NGN minor units. Never convert another
  // currency using the NGN price, which would mis-credit a wallet.
  if (currency !== 'NGN') return res.status(200).end();
  const coins = Math.floor(Number(amount) / config.coinPriceMinor);
  if (!Number.isSafeInteger(coins) || coins < 1) return res.status(200).end();

  try {
    await sequelize.transaction(async (t) => {
      // Unique (kind, refId) index blocks a second credit for the same payment
      await LedgerEntry.create({
        userId: metadata.userId, kind: 'coin_purchase', deltaMinor: amount, refId: reference,
      }, { transaction: t });
      await Wallet.findOrCreate({ where: { userId: metadata.userId }, defaults: { userId: metadata.userId }, transaction: t });
      await Wallet.increment('coinBalance', { by: coins, where: { userId: metadata.userId }, transaction: t });
    });
  } catch (e) {
    if (e.name !== 'SequelizeUniqueConstraintError') throw e; // already credited: fine
  }
  res.status(200).end();
});

module.exports = router;
